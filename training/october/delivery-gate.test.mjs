import test from "node:test";
import assert from "node:assert/strict";
import { auditOctoberDocuments, readOctoberDocuments } from "./delivery-gate.mjs";

const docs = readOctoberDocuments();

test("OC-000: documents have 49 confirmed decisions and skipped Q24", () => {
  const report = auditOctoberDocuments(docs);
  assert.equal(report.passed, true, report.failed.join(", "));
  assert.equal(report.counts.decisionHeadings, 49);
  assert.equal(report.counts.matrixSlots, 50);
  assert.equal(report.counts.epicHeadings, 24);
  assert.equal(report.classification, "DOCS_ONLY_NOT_RUNTIME_VERIFICATION");
});
test("OC-000: inventing or deciding skipped Q24 must fail closed", () => {
  const changed = { ...docs, decisions: docs.decisions +
    "\n## Q24 / 50 — invented decision\n\n**決策：D — invented**\n" };
  const report = auditOctoberDocuments(changed);
  assert.equal(report.passed, false);
  assert.ok(report.failed.includes("no-q24-decision"));
  assert.ok(report.failed.includes("decision-headings"));
});
test("OC-000: rewriting choice C to D violates confirmed intent", () => {
  assert.ok(docs.decisions.includes("## Q46 / 50 — C："));
  const mutated = docs.decisions.replace("## Q46 / 50 — C：", "## Q46 / 50 — D：");
  const report = auditOctoberDocuments({ ...docs, decisions: mutated });
  assert.equal(report.passed, false);
  assert.ok(report.failed.includes("choice-Q46"));
});
test("OC-000: decision, matrix, and backlog IDs must not silently vanish", () => {
  const cases = [
    [{ ...docs, decisions: docs.decisions.replace("## Q50 / 50 —", "## F50 / 50 —") }, "decision-headings"],
    [{ ...docs, matrix: docs.matrix.replace("| Q25 |", "| Q24 |") }, "rtm-50-slots"],
    [{ ...docs, backlog: docs.backlog.replace("### OC-023 —", "### OC-022 —") }, "backlog-24-epics"],
    [{ ...docs, plan: docs.plan.replace(/\bM7\b/g, "MF") }, "milestone-M7"],
  ];
  for (const [modified, expected] of cases) {
    const r = auditOctoberDocuments(modified);
    assert.equal(r.passed, false, expected);
    assert.ok(r.failed.includes(expected), r.failed.join(","));
  }
});
test("OC-000: readiness gate does not claim security, CI, or deployment", () => {
  const r = auditOctoberDocuments(docs);
  assert.equal(r.passed, true);
  assert.match(r.classification, /NOT_RUNTIME_VERIFICATION/);
  assert.ok(!Object.hasOwn(r, "deploymentPassed"));
  assert.ok(!Object.hasOwn(r, "implementationPassed"));
});
