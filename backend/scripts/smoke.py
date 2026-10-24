"""End-to-end API smoke test against a running stack. Exercises every endpoint.

    uv run python -m scripts.smoke --base http://localhost:8480

Uses the dedicated smoke-test users (never the demo users), so the demo accounts' patient lists
and case lists stay clean. Passwords come from SMOKE_CLINICIAN_PASSWORD /
SMOKE_DERMATOLOGIST_PASSWORD or, if unset, from the macOS Keychain.
"""

import argparse
import json
import os
import random
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

PHANTOMS = Path(__file__).resolve().parent.parent / "simulator" / "out" / "phantoms"
FRAMES = ("blue", "green", "red", "nir", "dark")
TIMEOUT = 30
# Cloudflare bans the default "Python-urllib" agent (error 1010); identify honestly instead.
USER_AGENT = "spektroskin-smoke/1.0 (+https://github.com/lan666as/spektroskin-proto)"


class SmokeFailure(AssertionError):
    pass


def password(user: str) -> str:
    env = os.environ.get(f"{user.upper().replace('-', '_')}_PASSWORD")
    if env:
        return env
    return subprocess.run(
        ["security", "find-generic-password", "-a", user, "-s", f"spektroskin-{user}", "-w"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout.strip()


class Client:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def request(self, method: str, path: str, *, body=None, form=None, files=None, raw=False):
        headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
        data = None
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if files is not None:
            boundary = uuid.uuid4().hex
            data = _multipart(boundary, form or {}, files)
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif form is not None:
            data = urllib.parse.urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        url = path if path.startswith("http") else self.base + path
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                payload = resp.read()
                status = resp.status
                ctype = resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as err:
            payload, status, ctype = err.read(), err.code, err.headers.get("Content-Type", "")
        if raw or "json" not in ctype:
            return status, payload
        return status, json.loads(payload) if payload else None

    def login(self, user: str) -> dict:
        self.token = None
        status, data = self.request(
            "POST", "/api/auth/token", form={"username": user, "password": password(user)}
        )
        expect(status == 200, f"login {user}: {status} {data}")
        self.token = data["access_token"]
        return data["user"]


def _multipart(boundary: str, fields: dict[str, str], files: dict[str, bytes]) -> bytes:
    out = bytearray()
    for name, value in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += f"{value}\r\n".encode()
    for name, content in files.items():
        out += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
            f'filename="{name}.png"\r\nContent-Type: image/png\r\n\r\n'
        ).encode()
        out += content + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out)


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)
    print(f"  ok  {message.split(':')[0]}")


def upload(client: Client, lesion_id: str, phantom: str, capture_id: str | None = None):
    capture_id = capture_id or str(uuid.uuid4())
    frames = {f: (PHANTOMS / phantom / f"{f}.png").read_bytes() for f in FRAMES}
    form = {
        "id": capture_id,
        "lesion_id": lesion_id,
        "captured_at": datetime.now(UTC).isoformat(),
        "device_id": "virtual-001",
        "phantom_id": phantom,
    }
    return client.request("POST", "/api/captures", form=form, files=frames)


def run(base: str) -> None:
    c = Client(base)
    status, data = c.request("GET", "/api/health")
    expect(status == 200 and data["database"] == "ok", f"GET /health: {status} {data}")

    status, _ = c.request("GET", "/api/auth/me")
    expect(status == 401, f"GET /auth/me without token is 401: {status}")
    c.token = "not-a-token"
    status, _ = c.request("GET", "/api/patients")
    expect(status == 401, f"invalid token is 401: {status}")

    clinician = c.login("smoke-clinician")
    status, me = c.request("GET", "/api/auth/me")
    expect(status == 200 and me["role"] == "clinician", f"GET /auth/me: {status} {me}")

    code = f"PT-{random.randint(9000, 9999)}"
    status, patient = c.request(
        "POST", "/api/patients", body={"code": code, "age": 50, "sex": "female", "fitzpatrick": "V"}
    )
    if status == 409:  # a previous smoke run used this code; reuse it
        _, patients = c.request("GET", "/api/patients")
        patient = next(p for p in patients if p["code"] == code)
        status = 201
    expect(status == 201, f"POST /patients: {status} {patient}")
    status, err = c.request(
        "POST",
        "/api/patients",
        body={"code": "bad", "age": 50, "sex": "female", "fitzpatrick": "V"},
    )
    expect(status == 422, f"POST /patients validates code: {status}")
    status, patients = c.request("GET", "/api/patients")
    expect(status == 200 and any(p["id"] == patient["id"] for p in patients), "GET /patients")

    status, lesion = c.request(
        "POST",
        "/api/lesions",
        body={"patient_id": patient["id"], "body_site": "sole", "laterality": "left"},
    )
    expect(status == 201, f"POST /lesions: {status} {lesion}")
    status, detail = c.request("GET", f"/api/patients/{patient['id']}")
    expect(status == 200 and len(detail["lesions"]) >= 1, f"GET /patients/{{id}}: {status}")

    capture_id = str(uuid.uuid4())
    status, capture = upload(c, lesion["id"], "acral_dark_d30", capture_id)
    expect(
        status == 201 and capture["status"] == "processed" and capture["qc"]["passed"],
        f"POST /captures (clean phantom processed): {status} {capture}",
    )
    expect(capture["simulated"] is True, "capture is flagged simulated")
    expect(set(capture["views"]) == {"standard", "pigment", "vascular"}, "three views returned")
    status, again = upload(c, lesion["id"], "acral_dark_d30", capture_id)
    expect(
        status == 200 and again["id"] == capture_id, f"POST /captures retry idempotent: {status}"
    )

    status, bad = upload(c, lesion["id"], "pigmented_dark_glare")
    expect(
        status == 201 and bad["status"] == "qc_failed" and bad["qc"]["guidance"],
        f"POST /captures (glare) fails QC with guidance: {status}",
    )

    status, got = c.request("GET", f"/api/captures/{capture_id}")
    expect(status == 200 and got["area_mm2"] > 0, f"GET /captures/{{id}}: {status}")
    status, png = c.request("GET", got["views"]["pigment"], raw=True)
    expect(status == 200 and png[:8] == b"\x89PNG\r\n\x1a\n", f"GET /images signed URL: {status}")
    status, _ = c.request("GET", got["views"]["pigment"].replace("sig=", "sig=x"), raw=True)
    expect(status == 403, f"GET /images with tampered signature is 403: {status}")
    status, val = c.request("GET", f"/api/validation/{capture_id}")
    expect(
        status == 200 and val["simulated"] and val["metrics"]["mask_dice"] > 0.9,
        f"GET /validation/{{id}} against phantom ground truth: {status}",
    )
    status, _ = c.request("GET", f"/api/validation/{bad['id']}")
    expect(status == 422, f"GET /validation for a failed-QC capture is 422: {status}")
    status, lesion_detail = c.request("GET", f"/api/lesions/{lesion['id']}")
    expect(
        status == 200 and len(lesion_detail["captures"]) == 2,
        f"GET /lesions/{{id}} with history: {status}",
    )

    status, _ = c.request(
        "POST",
        "/api/cases",
        body={"lesion_id": lesion["id"], "capture_ids": [bad["id"]], "question": "?"},
    )
    expect(status == 422, f"POST /cases rejects a failed-QC capture: {status}")
    status, case = c.request(
        "POST",
        "/api/cases",
        body={
            "lesion_id": lesion["id"],
            "capture_ids": [capture_id],
            "question": "Smoke test: pigmented macule on sole. Biopsy or observe?",
        },
    )
    expect(status == 201 and case["status"] == "submitted", f"POST /cases: {status}")
    status, mine = c.request("GET", "/api/cases")
    expect(status == 200 and any(x["id"] == case["id"] for x in mine), "GET /cases (own)")
    status, _ = c.request(
        "POST",
        f"/api/cases/{case['id']}/review",
        body={"impression": "x", "action": "observe"},
    )
    expect(status == 403, f"clinician cannot review: {status}")

    c.login("smoke-dermatologist")
    status, _ = c.request(
        "POST",
        "/api/patients",
        body={"code": "PT-0001", "age": 1, "sex": "male", "fitzpatrick": "I"},
    )
    expect(status == 403, f"dermatologist cannot create patients: {status}")
    status, queue = c.request("GET", "/api/cases?status=submitted&status=in_review")
    expect(status == 200 and any(x["id"] == case["id"] for x in queue), "GET /cases queue")
    status, opened = c.request("GET", f"/api/cases/{case['id']}")
    expect(status == 200 and opened["status"] == "in_review", f"GET /cases/{{id}}: {status}")
    expect(len(opened["lesion_history"]) >= 1, "case detail includes lesion history")
    status, reviewed = c.request(
        "POST",
        f"/api/cases/{case['id']}/review",
        body={
            "impression": "Smoke test review.",
            "action": "biopsy",
            "follow_up_days": 14,
            "notes": "automated",
        },
    )
    expect(
        status == 201 and reviewed["status"] == "answered",
        f"POST /cases/{{id}}/review: {status}",
    )
    status, _ = c.request(
        "POST", f"/api/cases/{case['id']}/review", body={"impression": "x", "action": "observe"}
    )
    expect(status == 409, f"second review is 409: {status}")

    c.login("smoke-clinician")
    status, answered = c.request("GET", f"/api/cases/{case['id']}")
    expect(
        status == 200 and answered["review"]["action"] == "biopsy",
        f"clinician sees the recommendation: {status}",
    )
    print(f"smoke passed against {base} (smoke user {clinician['username']})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://localhost:8480")
    args = parser.parse_args()
    try:
        run(args.base)
    except SmokeFailure as failure:
        print(f"SMOKE FAILED: {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
