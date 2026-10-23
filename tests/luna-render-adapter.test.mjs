import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const adapter=readFileSync(new URL('../src/luna/render-adapter.ts',import.meta.url),'utf8');
const studio=readFileSync(new URL('../src/luna/LunaStudio.tsx',import.meta.url),'utf8');

test('experimental renderer stays opt-in and defaults to Canvas2D',()=>{
 assert.match(adapter,/experimental = false/);
 assert.match(adapter,/return lunaPNG\(doc\)/);
 assert.match(adapter,/optionalRenderer/);
});
test('invalid output or thrown errors fall back to Canvas2D',()=>{
 assert.match(adapter,/output\.type === 'image\/png' && output\.size > 0/);
 assert.match(adapter,/catch\s*\{/);
});
test('LUNA export uses the adapter instead of calling Canvas2D directly',()=>{
 assert.match(studio,/import \{renderLunaPNG\} from "\.\/render-adapter"/);
 assert.match(studio,/await renderLunaPNG\(doc\)/);
});
