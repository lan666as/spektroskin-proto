"""AI evaluation report: repeatability of every automated output and a sensor-noise stress test.

    uv run python -m scripts.ai_evaluation

Writes docs/evidence/ai_evaluation.md. Deterministic (fixed seeds). Simulated data only.
"""

import json
import subprocess
from collections import Counter
from datetime import UTC, datetime
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from app.processing import acral_model, quality_model, run, triage_model
from simulator.device import capture, factory_profile
from simulator.phantoms import catalogue, ground_truth, spec_by_id

REPEATS = 10
STRESS_REPEATS = 5
NOISE_SCALES = (1.0, 2.0, 4.0, 8.0)
REPORT = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "ai_evaluation.md"
TEMPLATE = """# AI evaluation: repeatability and stress (simulated data only)

Generated {generated} on top of commit `{commit}` with
`uv run python -m scripts.ai_evaluation` (deterministic). Models: {versions}. Held-out accuracy
per model is in the model cards next to this file.

Everything here is measured on the simulator, which shares its optical model with the pipeline:
it shows that the software behaves consistently, not how it performs on skin.

## Repeatability: the same lesion captured again

Each phantom captured {repeats} times with fresh sensor noise, LED drift and hand motion. A
trustworthy assistant gives the same answer for the same lesion.

{repeatability}

Same triage output: share of captures giving the most common suggestion (an abstention counts as
an output). Area CV: coefficient of variation of the automated area.

## Stress: more sensor noise than the module is specified for

{n_phantoms} phantoms × {stress_repeats} captures at each noise level (×1 = the simulated module).
What should happen as images degrade: quality checks reject more, the triage model abstains more,
and what it still answers stays right.

{stress}

**Finding, and the fix it led to:** the first run of this report showed that neither the
rule-based quality check nor the learned quality model flagged heavy sensor noise (100 % of ×8
captures passed QC); only the triage model's abstention and out-of-distribution guard reacted.
A noise check on the gray reference patches was added to the quality gate (rejects above 0.02
relative pixel noise, about 3× the simulated module), which is what the QC column now shows:
noisy captures get retake guidance and never reach the triage model. The learned quality model
was then retrained with a noisy class (`quality_v2`): it now calls ×4 and ×8 captures noisy, and
flags some ×2 captures that the rules still accept (borderline, shown as a disagreement in the app).
"""
PHANTOMS = [s.id for s in catalogue() if s.variant is None and s.id != "acral_dark_d14"]


def one(args: tuple[str, int, float]) -> dict:
    phantom_id, repeat, noise = args
    spec = spec_by_id(phantom_id)
    result = run(
        capture(spec, ground_truth(spec), repeat=repeat, noise_scale=noise), factory_profile()
    )
    triage = result.triage_model or {}
    acral = result.acral_model or {}
    return {
        "phantom": phantom_id,
        "truth": spec.lesion,
        "acral_truth": spec.acral_pattern if spec.acral else None,
        "qc": result.qc.passed,
        "quality": (result.quality_model or {}).get("label"),
        "pattern": triage.get("pattern"),
        "ood": triage.get("out_of_distribution", False),
        "acral": acral.get("pattern"),
        "area": result.area_mm2,
        "border": (result.morphology or {}).get("border_irregularity"),
    }


def _share_of_mode(values: list) -> float:
    return Counter(values).most_common(1)[0][1] / len(values)


def repeatability(rows: list[dict]) -> list[str]:
    lines = [
        "| Phantom | Captures passing QC | Same triage output | Triage right | Same acral output "
        "| Area CV | Border SD |",
        "|---|---|---|---|---|---|---|",
    ]
    for phantom in PHANTOMS:
        group = [r for r in rows if r["phantom"] == phantom]
        ok = [r for r in group if r["qc"]]
        areas = np.array([r["area"] for r in ok])
        borders = np.array([r["border"] for r in ok])
        right = np.mean([r["pattern"] == r["truth"] for r in ok])
        acral = (
            f"{_share_of_mode([r['acral'] for r in ok]):.0%}" if group[0]["acral_truth"] else "n/a"
        )
        same = _share_of_mode([r["pattern"] for r in ok])
        lines.append(
            f"| {phantom} | {len(ok)}/{len(group)} | {same:.0%} | {right:.0%} | {acral} "
            f"| {areas.std() / areas.mean():.1%} | {borders.std():.3f} |"
        )
    return lines


def stress(rows: list[dict]) -> list[str]:
    lines = [
        "| Sensor noise | QC pass | Quality model says good | Triage answered | Triage right when "
        "answered | Out of range |",
        "|---|---|---|---|---|---|",
    ]
    for noise in NOISE_SCALES:
        group = [r for r in rows if r["noise"] == noise]
        ok = [r for r in group if r["qc"]]
        answered = [r for r in ok if r["pattern"]]
        right = (
            f"{np.mean([r['pattern'] == r['truth'] for r in answered]):.0%}" if answered else "–"
        )
        lines.append(
            f"| ×{noise:g} | {len(ok) / len(group):.0%} "
            f"| {np.mean([r['quality'] == 'good' for r in group]):.0%} "
            f"| {len(answered) / max(len(ok), 1):.0%} | {right} "
            f"| {np.mean([r['ood'] for r in ok]) if ok else 0:.0%} |"
        )
    return lines


def main() -> None:
    jobs = [(p, 100 + k, 1.0) for p in PHANTOMS for k in range(REPEATS)]
    stress_jobs = [
        (p, 500 + k, noise)
        for noise in NOISE_SCALES
        for p in PHANTOMS
        for k in range(STRESS_REPEATS)
    ]
    with Pool() as pool:
        rows = pool.map(one, jobs)
        stressed = [
            {**r, "noise": job[2]}
            for r, job in zip(pool.map(one, stress_jobs), stress_jobs, strict=True)
        ]
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False
    ).stdout.strip()
    versions = ", ".join(
        json.loads(m.MODEL_PATH.read_text())["version"]
        for m in (quality_model, triage_model, acral_model)
    )
    REPORT.write_text(
        TEMPLATE.format(
            generated=f"{datetime.now(UTC):%Y-%m-%d %H:%M} UTC",
            commit=commit,
            versions=versions,
            repeats=REPEATS,
            repeatability="\n".join(repeatability(rows)),
            n_phantoms=len(PHANTOMS),
            stress_repeats=STRESS_REPEATS,
            stress="\n".join(stress(stressed)),
        )
    )
    print(REPORT.read_text())


if __name__ == "__main__":
    main()
