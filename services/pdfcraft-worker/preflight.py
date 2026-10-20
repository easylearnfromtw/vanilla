"""Operator-only VPS acceptance test: real PdfCraft merge INSIDE Bubblewrap.

Run as the unprivileged vanilla-pdfcraft Unix user. This does NOT expose
an endpoint, modify sysctls, modify host security policy, print secrets,
or enable any production service.
"""
from __future__ import annotations

import asyncio
import base64
from io import BytesIO
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from pypdf import PdfReader

EXPECTED_CLI_SHA256 = "073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f"
CLI = Path("/usr/local/bin/pdfcraft-cli")


def fixture(label: str) -> bytes:
    """Build an ordinary, structurally valid, one-page PDF using the stdlib."""
    safe = "".join(c for c in label if c.isascii() and (c.isalnum() or c == "_"))
    content = f"BT /F1 18 Tf 72 720 Td ({safe}) Tj ET\n".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"endstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(output)
    output.extend(b"xref\n0 6\n0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(b"trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n"
                  + str(xref).encode() + b"\n%%EOF\n")
    return bytes(output)


def check_host() -> None:
    from pdfcraft_native import _base_args, probe_sandbox
    if os.geteuid() == 0:
        raise RuntimeError("Never run this test as root. Use the dedicated worker user.")
    if not CLI.is_file() or CLI.is_symlink():
        raise RuntimeError("Reviewed CLI missing or symlinked")
    with CLI.open("rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    if digest != EXPECTED_CLI_SHA256:
        raise RuntimeError("PdfCraft executable SHA-256 mismatch")
    os.environ["WEIGUO_PDFCRAFT_SANDBOX"] = "bubblewrap"
    if not probe_sandbox():
        raise RuntimeError("Bubblewrap user/mount/network namespace probe failed. Inspect AppArmor and sysctl, do not disable protection globally.")

    # Require a *different* network namespace from the parent, rather than
    # relying merely on a connection to some test IP failing.
    parent_ns = os.readlink("/proc/self/ns/net")
    run = subprocess.run(
        [*_base_args(), "--", "/usr/bin/python3", "-c",
         "import os;print(os.readlink('/proc/self/ns/net'))"],
        capture_output=True, text=True, timeout=5, check=False,
        env={"PATH": "/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"},
    )
    if run.returncode != 0 or not run.stdout.strip().startswith("net:["):
        raise RuntimeError("Could not inspect child network namespace")
    if run.stdout.strip() == parent_ns:
        raise RuntimeError("Network isolation test failed: sandbox and host share network namespace")
    print("PASS: verified pinned binary, rootless sandbox and independent network namespace")


async def check_real_pdf() -> None:
    from pdfcraft_engine import available, combine_pdfs
    # These are PROCESS-LOCAL test flags; do not write a systemd env file
    # or turn on the Railway local adapter.
    os.environ.update({
        "WEIGUO_PDFCRAFT_ENABLED": "true",
        "WEIGUO_PDFCRAFT_EGRESS_ISOLATED": "true",
        "WEIGUO_PDFCRAFT_CLI": str(CLI),
        "WEIGUO_PDFCRAFT_SHA256": EXPECTED_CLI_SHA256,
    })
    if not available():
        raise RuntimeError("Native adapter rejected the pinned worker sandbox")
    docs = [base64.b64encode(fixture(x)).decode("ascii") for x in ("VANILLA_FIRST", "VANILLA_SECOND")]
    pdf = await combine_pdfs(docs)
    pages = PdfReader(BytesIO(pdf)).pages
    contents = [(page.extract_text() or "").strip() for page in pages]
    if len(contents) != 2 or not all(
        text in contents[i] for i, text in enumerate(("VANILLA_FIRST", "VANILLA_SECOND"))
    ):
        raise RuntimeError(f"Native merge did not preserve verified page order: {contents}")
    print("PASS: actual native PDF merge IN the sandbox; independent two-page text/order verification")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--fixture-only":
        for label in ("VANILLA_FIRST", "VANILLA_SECOND"):
            data = fixture(label)
            pages = PdfReader(BytesIO(data)).pages
            if len(pages) != 1 or label not in (pages[0].extract_text() or ""):
                raise SystemExit("Generated PDF fixture is not independently valid")
        print("PASS: preflight fixtures parsed and decoded independently")
        sys.exit(0)
    try:
        check_host()
        asyncio.run(check_real_pdf())
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError) as exc:
        print(f"FAIL (production must remain disabled): {exc}", file=sys.stderr)
        sys.exit(1)
