import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/lib/cosmos-adapter.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
const { requestCosmosObservation, CosmosUnavailableError } = mod.exports;
const base = { mediaUrl: 'https://example.com/clip.mp4', question: 'Which way?', enabled: true, privateMode: false };
const config = { endpoint: 'https://gateway.example.com/cosmos' };
test('feature off never invokes network', async () => {
  let calls = 0;
  await assert.rejects(requestCosmosObservation({ ...base, enabled: false }, { ...config, fetchImpl: () => { calls++; } }), CosmosUnavailableError);
  assert.equal(calls, 0);
});
test('private mode never invokes network', async () => {
  let calls = 0;
  await assert.rejects(requestCosmosObservation({ ...base, privateMode: true }, { ...config, fetchImpl: () => { calls++; } }), CosmosUnavailableError);
  assert.equal(calls, 0);
});
test('rejects insecure gateway', async () => {
  await assert.rejects(requestCosmosObservation(base, { endpoint: 'http://gateway.example.com' }), CosmosUnavailableError);
});
test('validates response and returns observations', async () => {
  const result = await requestCosmosObservation(base, { ...config, fetchImpl: async (_url, opts) => {
    assert.equal(opts.credentials, 'omit');
    return { ok: true, json: async () => ({ observations: ['Object moves left'], model: 'test-stub' }) };
  } });
  assert.deepEqual(result.observations, ['Object moves left']);
});
test('rejects malformed response', async () => {
  await assert.rejects(requestCosmosObservation(base, { ...config, fetchImpl: async () => ({ ok: true, json: async () => ({ observations: 'wrong', model: 'test' }) }) }), CosmosUnavailableError);
});
