#!/usr/bin/env node
/**
 * Detroit P0 release gate: runs core regression suites and produces an auditable
 * machine-readable report. No network, credentials or production user data used.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const suites = [
  ["local-chat", "test:local-chat"],
  ["webllm-lifecycle-and-system-order", "test:webllm-guard"],
  ["provider-streaming", "test:providers"],
  ["file-read-and-delete", "test:file-lifecycle"],
  ["drive-delete-verification", "test:drive-orphan"],
  ["chat-router", "test:chat-router"],
  ["athena-security", "test:security"],
  ["detroit-orchestration", "test:detroit"],
  ["diana-dispatch", "test:diana"],
  ["release-readiness", "test:release"],
  ["pwa-update", "test:pwa-update"],
  ["typescript-and-production-build", "build"],
];
const output = resolve(process.env.VANILLA_CORE_GATE_REPORT || "artifacts/core-release-gate.json");
const started = new Date().toISOString();
const results = [];
for (const [name, script] of suites) {
  process.stdout.write("\n[Vanilla core gate] " + name + " (" + script + ")\n");
  const start = Date.now();
  const child = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CI: process.env.CI || "true" },
  });
  const passed = child.status === 0 && !child.error && !child.signal;
  results.push({
    name, script, passed, exitCode: child.status,
    signal: child.signal || null,
    error: child.error ? child.error.message : null,
    elapsedMs: Date.now() - start,
  });
  if (!passed) break; // Fail closed; never report unexecuted suites as passed.
}
const passed = results.length === suites.length && results.every(r => r.passed);
const report = {
  schemaVersion: 1, gate: "vanilla-detroit-p0",
  started, finished: new Date().toISOString(),
  passed, executed: results.length, expected: suites.length, results,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\n[Vanilla core gate] " + (passed ? "PASS" : "FAIL") +
  " (" + results.length + "/" + suites.length + " executed); report: " + output + "\n");
if (!passed) process.exitCode = 1;
