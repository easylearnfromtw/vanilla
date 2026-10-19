"""Run once during Docker build against the real pinned GridCraft CLI."""
from io import BytesIO
import xml.etree.ElementTree as ET
from zipfile import ZipFile
from gridcraft_adapter import (
    CellEntry, SheetExport, CreamReportRequest, build_cream_report,
    validate_export, _render,
)

sheet = _render(validate_export(SheetExport(cells=[
    CellEntry(cell="A1", input="月份"),
    CellEntry(cell="B1", input="營收"),
    CellEntry(cell="B2", input="=SUM(100,50)"),
])))
with ZipFile(BytesIO(sheet)) as xlsx:
    assert "xl/workbook.xml" in xlsx.namelist(), "Sheets XLSX workbook missing"

request = CreamReportRequest(
    source='=HYPERLINK("https://invalid.example")',
    rowCount=4,
    metrics=[dict(key="Revenue", n=4, missing=0, sum=700, mean=175,
                  median=175, min=100, max=250, sampleStdDev=64.55)],
    focusKey="Revenue",
    chartKind="bar",
    points=[
        dict(row=2, label='=HYPERLINK("https://invalid.example")', value=100),
        dict(row=3, label="Feb", value=150),
        dict(row=4, label="Mar", value=200),
        dict(row=5, label="Apr", value=250),
    ],
)
commands, chart = build_cream_report(request)
assert chart == "column"
report = _render(commands)
with ZipFile(BytesIO(report)) as xlsx:
    names = xlsx.namelist()
    assert any(n.startswith("xl/charts/chart") and n.endswith(".xml") for n in names), "Native Excel chart missing"
    sheets = [n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
    assert sheets, "Workbook worksheet missing"
    root = ET.fromstring(xlsx.read(sheets[0]))
    formulas = [(node.text or "") for node in root.findall(".//{*}f")]
    assert any(formula.startswith("SUM(") for formula in formulas), "Preview SUM formula missing"
    assert any(formula.startswith("AVERAGE(") for formula in formulas), "Preview AVERAGE formula missing"
    assert all("HYPERLINK" not in formula.upper() for formula in formulas), "Formula injection"
print("GridCraft 0.8.0 real CLI: Sheets / CREAM / native chart / formulas OK")
