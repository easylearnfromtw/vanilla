"""Prevent startup failures from missing locally imported Python modules in WeiGuo Docker images."""
from __future__ import annotations

import ast
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parent


class DockerImportCoverage(unittest.TestCase):
    def test_app_local_python_imports_are_copied_to_each_runtime_image(self):
        source = (ROOT / "app.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        modules = {p.stem for p in ROOT.glob("*.py")}
        required = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                name = node.module.split(".", 1)[0]
                if name in modules:
                    required.add(f"{name}.py")
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.name.split(".", 1)[0]
                    if name in modules:
                        required.add(f"{name}.py")
        self.assertIn("ceres_gateway.py", required)
        for image in ("Dockerfile", "Dockerfile.pdfcraft"):
            with self.subTest(image=image):
                lines = (ROOT / image).read_text(encoding="utf-8").replace("\\\n", " ").splitlines()
                copied = set()
                for line in lines:
                    match = re.match(r"^COPY\\s+(?!--from=)(.+)\\s+\\./?$", line.strip())
                    if match:
                        copied.update(part for part in match.group(1).split() if part.endswith(".py"))
                self.assertFalse(required - copied,
                    f"{image} omits imported modules: {sorted(required - copied)}")


if __name__ == "__main__":
    unittest.main()
