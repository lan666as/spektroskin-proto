"""Generate the skin-tone-stratified validation report from simulated phantoms.

    uv run python -m scripts.validation_report [--out ../docs/evidence] [--repeats 10]

Deterministic: every capture comes from a fixed seed. Validates the processing math on simulated
data only.
"""

import argparse
import statistics
import subprocess
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from app.processing import render, run
from app.processing.validation import compare
from simulator.device import capture, factory_profile
from simulator.phantoms import TONE_FITZPATRICK, PhantomSpec, catalogue, ground_truth

TONES = ("light", "medium", "dark")
LESIONS = ("pigmented", "vascular", "mixed")
DEFAULT_OUT = Path(__file__).resolve().parents[2] / "docs" / "evidence"


@dataclass
class Run:
    tone: str
    lesion: str
    qc_passed: bool
    metrics: dict[str, float] | None
    measured_area: float | None
    true_area: float


def _base_spec(lesion: str, tone: str) -> PhantomSpec:
    return next(s for s in catalogue() if s.id == f"{lesion}_{tone}")


def run_clean(repeats: int, profile) -> list[Run]:
    runs = []
    for tone in TONES:
        for lesion in LESIONS:
            spec = _base_spec(lesion, tone)
            gt = ground_truth(spec)
            for k in range(repeats):
                result = run(capture(spec, gt, repeat=k), profile)
                metrics = None
                if result.qc.passed:
                    metrics = compare(
                        result.melanin,
                        result.hemoglobin,
                        result.mask,
                        gt.melanin,
                        gt.hemoglobin,
                        gt.mask,
                    )
                runs.append(
                    Run(tone, lesion, result.qc.passed, metrics, result.area_mm2, gt.area_mm2)
                )
    return runs


def run_bad(repeats: int, profile) -> dict[tuple[str, str], tuple[int, int]]:
    """Rejected / total for blur and glare variants of the pigmented phantom at every tone."""
    out = {}
    for tone in TONES:
        base = _base_spec("pigmented", tone)
        gt = ground_truth(base)
        for variant in ("blur", "glare"):
            spec = replace(base, id=f"{base.id}_{variant}", variant=variant, shape_seed=base.id)
            rejected = sum(
                not run(capture(spec, gt, repeat=k), profile).qc.passed for k in range(repeats)
            )
            out[(tone, variant)] = (rejected, repeats)
    return out


def run_growth(repeats: int, profile) -> list[tuple[str, float, float, float]]:
    rows = []
    for spec in catalogue():
        if not spec.id.startswith("acral_dark_d"):
            continue
        gt = ground_truth(spec)
        areas = [run(capture(spec, gt, repeat=k), profile).area_mm2 for k in range(repeats)]
        rows.append((spec.id, gt.area_mm2, statistics.mean(areas), statistics.pstdev(areas)))
    return rows


def _gray(values: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((values - lo) / (hi - lo), 0, 1)
    return np.repeat((255 * (1 - t))[..., None], 3, axis=2).astype(np.uint8)


def figure(tone: str, profile, path: Path) -> None:
    """Rows: lesion types. Columns: standard view, true / recovered melanin, true / recovered Hb."""
    tiles = []
    for lesion in LESIONS:
        spec = _base_spec(lesion, tone)
        gt = ground_truth(spec)
        result = run(capture(spec, gt), profile)
        m_lo, m_hi = render.MELANIN_RANGE
        h_lo, h_hi = render.HEMOGLOBIN_RANGE
        maps = [
            _gray(gt.melanin, m_lo, m_hi),
            _gray(result.melanin, m_lo, m_hi),
            _gray(gt.hemoglobin, h_lo, h_hi),
            _gray(result.hemoglobin, h_lo, h_hi),
        ]
        row = [result.views["standard"], *(render.mask_spacer(m) for m in maps)]
        tiles.append(np.concatenate(row, axis=1))
    grid = np.concatenate(tiles, axis=0)
    header = Image.new("RGB", (grid.shape[1], 28), "white")
    draw = ImageDraw.Draw(header)
    labels = [
        "standard (simulated)",
        "true melanin",
        "recovered melanin",
        "true Hb",
        "recovered Hb",
    ]
    for i, label in enumerate(labels):
        draw.text((i * 256 + 8, 8), label, fill="black")
    img = Image.new("RGB", (grid.shape[1], grid.shape[0] + 28), "white")
    img.paste(header, (0, 0))
    img.paste(Image.fromarray(grid), (0, 28))
    img.save(path)


def _fmt(values: list[float], digits: int = 3) -> str:
    return f"{statistics.mean(values):.{digits}f} (worst {min(values):.{digits}f})"


def _commit() -> str:
    try:
        head = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--", "backend"], capture_output=True, text=True
        ).stdout.strip()
        return f"{head}-dirty" if dirty else head
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def write_report(out: Path, repeats: int) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    profile = factory_profile()
    clean = run_clean(repeats, profile)
    bad = run_bad(repeats, profile)
    growth = run_growth(repeats, profile)
    for tone in TONES:
        figure(tone, profile, out / f"validation_maps_{tone}.png")

    lines = [
        "# Validation report: processing pipeline vs simulated ground truth",
        "",
        f"Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC from commit `{_commit()}` with "
        f"`uv run python -m scripts.validation_report --repeats {repeats}` (deterministic seeds).",
        "",
        "> **Scope.** This validates the *processing math* on *synthetic phantoms only*. The "
        "simulator and the pipeline share the same simplified optical model (Beer-Lambert-style, "
        "no scattering), so these numbers show that the pipeline inverts that model correctly "
        "under "
        "sensor noise, LED gain drift, vignetting and hand motion. They do **not** show that the "
        "model matches real skin, and they are **not** clinical performance. No real or public "
        "images were used. No diagnosis, risk score or AI is involved.",
        "",
        "## Method",
        "",
        "- Phantoms: pigmented, vascular and mixed lesions on three skin tones "
        "(light / medium / dark = Fitzpatrick III / IV / V, illustrative melanin levels).",
        f"- Each phantom captured {repeats} times with independent noise, per-band gain drift "
        "(±6 %) and per-band hand-motion shifts (±3 px).",
        "- Pipeline: QC → dark/flat-field + reference-patch calibration → phase-correlation "
        "registration → least-squares unmixing of −ln(R/R0) → Otsu + hysteresis segmentation.",
        "- Metrics (outside the spacer ring): Pearson r and RMSE of recovered vs true melanin and "
        "hemoglobin maps (model units), Dice of lesion mask vs true mask, signed area error.",
        "",
        "## Results by skin tone",
        "",
        "| Tone (Fitzpatrick) | Captures | QC pass (clean) | Melanin r | Hemoglobin r "
        "| Mask Dice | Area error, mean abs (max abs) |",
        "|---|---|---|---|---|---|---|",
    ]
    for tone in TONES:
        runs = [r for r in clean if r.tone == tone]
        ok = [r for r in runs if r.metrics]
        area = [abs(r.metrics["area_error_pct"]) for r in ok]
        lines.append(
            f"| {tone} ({TONE_FITZPATRICK[tone]}) | {len(runs)} | {len(ok)}/{len(runs)} | "
            f"{_fmt([r.metrics['melanin_r'] for r in ok])} | "
            f"{_fmt([r.metrics['hemoglobin_r'] for r in ok])} | "
            f"{_fmt([r.metrics['mask_dice'] for r in ok])} | "
            f"{statistics.mean(area):.1f} % ({max(area):.1f} %) |"
        )
    lines += [
        "",
        "Values are mean (worst) over captures. Worst = lowest r / Dice. Pearson r is low where "
        "a map has little true variation (melanin in vascular lesions); RMSE in the next table "
        "is the better measure there. Segmentation has a small positive area bias (it includes "
        "the soft lesion edge).",
        "",
        "## Results by lesion type and tone",
        "",
        "| Phantom | Melanin RMSE | Hemoglobin RMSE | Mask Dice | Area error mean (sd) |",
        "|---|---|---|---|---|",
    ]
    for tone in TONES:
        for lesion in LESIONS:
            ok = [r for r in clean if r.tone == tone and r.lesion == lesion and r.metrics]
            err = [r.metrics["area_error_pct"] for r in ok]
            mel_rmse = statistics.mean(r.metrics["melanin_rmse"] for r in ok)
            lines.append(
                f"| {lesion}, {tone} | {mel_rmse:.3f} | "
                f"{statistics.mean(r.metrics['hemoglobin_rmse'] for r in ok):.3f} | "
                f"{statistics.mean(r.metrics['mask_dice'] for r in ok):.3f} | "
                f"{statistics.mean(err):+.1f} % ({statistics.pstdev(err):.1f}) |"
            )
    lines += [
        "",
        "## Quality check: rejection of bad captures by tone",
        "",
        "| Tone | Blur rejected | Glare rejected |",
        "|---|---|---|",
    ]
    for tone in TONES:
        b, g = bad[(tone, "blur")], bad[(tone, "glare")]
        lines.append(f"| {tone} ({TONE_FITZPATRICK[tone]}) | {b[0]}/{b[1]} | {g[0]}/{g[1]} |")
    lines += [
        "",
        "## Longitudinal series (acral sole, dark tone)",
        "",
        "| Visit | True area | Measured area, mean (sd) |",
        "|---|---|---|",
    ]
    for pid, true_area, mean_area, sd in growth:
        lines.append(f"| {pid} | {true_area:.1f} mm² | {mean_area:.1f} mm² ({sd:.2f}) |")
    lines += [
        "",
        "## Figures",
        "",
        *[
            f"![{tone}](validation_maps_{tone}.png)\n\n*{tone} tone (Fitzpatrick "
            f"{TONE_FITZPATRICK[tone]}): standard view, true vs recovered melanin, true vs "
            "recovered hemoglobin (darker = more). Synthetic phantoms.*\n"
            for tone in TONES
        ],
        "## Limitations",
        "",
        '- Same model generates and inverts the data (an "inverse crime"): real skin scattering, '
        "camera spectral response and LED spectra are not modelled.",
        "- Skin-tone levels are illustrative and ordered, not fitted to measured Indonesian skin.",
        "- Next step for real evidence: bench measurements on physical phantoms with known "
        "absorbers, then ethics-approved volunteer imaging (see the 12-month roadmap).",
        "",
    ]
    report = out / "validation_report.md"
    report.write_text("\n".join(lines))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--repeats", type=int, default=10)
    args = parser.parse_args()
    print(f"wrote {write_report(args.out, args.repeats)}")


if __name__ == "__main__":
    main()
