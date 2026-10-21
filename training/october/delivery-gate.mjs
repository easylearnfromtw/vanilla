#!/usr/bin/env node
/**
 * October OC-000: document governance gate only.
 * Verifies decision completeness and milestone traceability; NOT a runtime,
 * integration, security-authorization, or production deployment verification.
 * No secrets, external network, child processes, or user data.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const inputs = {
  decisions: "training/october/DECISIONS_50.md",
  matrix: "training/october/REQUIREMENTS_TRACEABILITY.md",
  backlog: "training/october/IMPLEMENTATION_BACKLOG.md",
  plan: "training/october/ARCHITECTURE_DELIVERY_PLAN.md",
};
export const expectedDecisionNumbers = Array.from({ length: 50 }, (_, i) => i + 1).filter(n => n !== 24);
export const expectedEpicNumbers = Array.from({ length: 24 }, (_, i) => i);

function numbers(text, regex) {
  return Array.from(text.matchAll(regex), m => Number(m[1]));
}
function exactNumbers(actual, expected) {
  return actual.length === expected.length &&
    actual.length === new Set(actual).size &&
    expected.every(n => actual.includes(n));
}
function sectionOf(decisions, n) {
  const id = String(n).padStart(2, "0");
  const heading = new RegExp("^## Q" + id + " / 50 —[^\\n]*$", "m");
  const match = heading.exec(decisions);
  if (!match) return "";
  const next = decisions.indexOf("\n## Q", match.index + match[0].length);
  return decisions.slice(match.index, next < 0 ? undefined : next);
}
export function auditOctoberDocuments({ decisions, matrix, backlog, plan }) {
  const checks = [];
  const check = (id, passed, description) => {
    checks.push({ id, passed: Boolean(passed), description });
  };
  const decisionIds = numbers(decisions, /^## Q(\d{2}) \/ 50 —/gm);
  const matrixIds = numbers(matrix, /^\| Q(\d{2}) \|/gm);
  const epicIds = numbers(backlog, /^### OC-(\d{3}) —/gm);
  const allIds = Array.from({ length: 50 }, (_, i) => i + 1);

  check("decision-headings", exactNumbers(decisionIds, expectedDecisionNumbers),
    "49 unique confirmed decision headings, Q24 omitted");
  check("decision-status", /狀態：決策訪談已完成 · 共 50 題 · 目前已確定 49 題 · 已略過 1 題（Q24）/.test(decisions),
    "Completed interview and explicit skipped count");
  check("no-q24-decision", !/^## Q24 \/ 50/m.test(decisions),
    "Q24 must not be automatically decided");
  check("rtm-50-slots", exactNumbers(matrixIds, allIds),
    "50 unique traceability slots");
  check("rtm-q24-skipped", /^\| Q24 \| \*\*略過（不補選）\*\* \|/m.test(matrix) &&
      !/^\| Q24 \|[^\n]*已確認決策/m.test(matrix),
    "Q24 remains skipped, not a confirmed feature");
  check("backlog-24-epics", exactNumbers(epicIds, expectedEpicNumbers),
    "Exactly OC-000 through OC-023, no duplicate ID");
  const options = [[39, "C"], [40, "C"], [43, "C"], [46, "C"], [47, "D"], [48, "D"], [49, "D"], [50, "D"]];
  for (const [n, option] of options) {
    const id = String(n).padStart(2, "0");
    check("choice-Q" + id,
      new RegExp("^## Q" + id + " / 50 — " + option + "：", "m").test(decisions),
      "Preserve explicitly confirmed choice " + option);
  }
  check("q50-engineering-gate", /### Q50 驗收標準/.test(sectionOf(decisions, 50)) &&
      /Owner/.test(sectionOf(decisions, 50)) && /Self-Build/.test(sectionOf(decisions, 50)),
    "Q50 describes evidence-based acceptance and hard trust boundaries");
  for (let m = 0; m <= 7; m++) {
    check("milestone-M" + m, new RegExp("\\bM" + m + "\\b").test(plan),
      "Delivery plan contains M" + m);
  }
  check("boundaries", /Self-Build/.test(plan) && /Ceres/.test(plan) &&
      /Self-Build/.test(backlog) && /Owner/.test(backlog),
    "Trust boundaries documented in plan and backlog");
  check("readme-links", ["DECISIONS_50.md", "REQUIREMENTS_TRACEABILITY.md",
      "ARCHITECTURE_DELIVERY_PLAN.md", "IMPLEMENTATION_BACKLOG.md"].every(path => plan.includes(path) || matrix.includes(path) || backlog.includes(path)),
    "Cross-linked source documents available in governance set");
  const failed = checks.filter(x => !x.passed);
  return {
    schemaVersion: 1,
    gate: "october-oc000-document-governance",
    classification: "DOCS_ONLY_NOT_RUNTIME_VERIFICATION",
    passed: failed.length === 0,
    checked: checks.length,
    failed: failed.map(x => x.id),
    counts: { decisionHeadings: decisionIds.length, matrixSlots: matrixIds.length,
      epicHeadings: epicIds.length, confirmed: 49, skipped: 1 },
    checks,
  };
}
export function readOctoberDocuments(fromRoot = root) {
  return Object.fromEntries(Object.entries(inputs).map(([name, relative]) =>
    [name, readFileSync(join(fromRoot, relative), "utf8")]));
}
const calledAsProgram = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (calledAsProgram) {
  let report;
  try {
    report = auditOctoberDocuments(readOctoberDocuments());
  } catch (err) {
    report = { schemaVersion: 1, gate: "october-oc000-document-governance",
      classification: "DOCS_ONLY_NOT_RUNTIME_VERIFICATION", passed: false,
      error: err instanceof Error ? err.message : String(err) };
  }
  const path = resolve(process.env.OCTOBER_DELIVERY_REPORT || "artifacts/october-oc000-doc-gate.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write("[October OC-000] " + (report.passed ? "PASS" : "FAIL") +
    " (DOCUMENT CHECK ONLY); " + path + "\n");
  if (!report.passed) process.exitCode = 1;
}
