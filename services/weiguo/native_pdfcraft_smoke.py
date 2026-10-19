"""End-to-end native PdfCraft release smoke: actual PDFs, page order and content.

Requires the reviewed linux pdfcraft-cli plus independent reportlab/pypdf tooling.
Only executes in a disposable CI workspace; does NOT claim host sandbox availability.
"""
from __future__ import annotations
from pathlib import Path
import subprocess
import sys
import tempfile

from pypdf import PdfReader
from reportlab.pdfgen import canvas


def make_pdf(path: Path, labels: tuple[str, ...]) -> None:
    drawing = canvas.Canvas(str(path))
    for label in labels:
        drawing.setFont("Helvetica", 16)
        drawing.drawString(72, 720, label)
        drawing.showPage()
    drawing.save()


def run(binary: Path) -> None:
    if not binary.is_file():
        raise SystemExit("Native PdfCraft CLI executable not found")
    with tempfile.TemporaryDirectory(prefix="pdfcraft-native-smoke-") as d:
        root = Path(d)
        a, b, output = root / "first.pdf", root / "second.pdf", root / "out.pdf"
        make_pdf(a, ("NATIVE_A_PAGE_1",))
        make_pdf(b, ("NATIVE_B_PAGE_1", "NATIVE_B_PAGE_2"))
        command = [str(binary), "combine", str(a), str(b), "--out", str(output)]
        result = subprocess.run(command, cwd=root, env={"PATH": "/usr/bin:/bin", "HOME": d, "LANG": "C.UTF-8"},
                                capture_output=True, text=True, timeout=45, check=False)
        if result.returncode != 0:
            raise AssertionError("PdfCraft native combine failed: " + result.stderr[:1200])
        if not output.is_file():
            raise AssertionError("PdfCraft native output missing")
        data = output.read_bytes()
        if len(data) < 32 or not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
            raise AssertionError("Native output failed PDF signature/trailer validation")
        reader = PdfReader(str(output))
        if len(reader.pages) != 3:
            raise AssertionError(f"Expected 3 merged pages, got {len(reader.pages)}")
        text = [(p.extract_text() or "").strip() for p in reader.pages]
        expected = ["NATIVE_A_PAGE_1", "NATIVE_B_PAGE_1", "NATIVE_B_PAGE_2"]
        for index, (received, wanted) in enumerate(zip(text, expected), start=1):
            if wanted not in received:
                raise AssertionError(f"Page {index} content/order mismatch: {received[:200]}")
        print("PASS: real native PdfCraft v0.9.0 merge; 3 pages, correct order, extracted text and PDF trailer.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: native_pdfcraft_smoke.py /absolute/pdfcraft-cli")
    run(Path(sys.argv[1]))
