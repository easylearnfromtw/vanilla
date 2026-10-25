# TGFX optional renderer spike

Status: design / investigation only. No TGFX binary or production renderer has been integrated.

## Context
Vanilla is a React + Vite PWA on GitHub Pages with iPhone-first WebGPU features. TGFX is a C++17 GPU 2D renderer, with an Emscripten WebAssembly demo and WebGL2 / WebGPU backends. Its official Web build currently documents Emscripten 4.0.15.

## Architecture
- Keep existing Canvas / SVG renderer as the production default.
- Introduce a future renderer adapter at the LUNA / Vectorcraft drawing boundary, *after* locating the actual implementations.
- Use a lazy-loaded TGFX WASM adapter only for supported browsers and selected scenes.
- Ensure WebGPU device usage does not conflict with WebLLM inference; avoid allocating GPU resources until the design surface is opened.
- Feature flag default OFF; never auto-enable solely because WebGPU is present.
- On initialization, rendering, context loss, or export error, revert to the existing renderer and preserve the scene document.
- Do not send scene content to external services.

## Required investigation before coding
1. Identify the actual LUNA / Vectorcraft source files, rendering and export contracts.
2. Verify TGFX licensing, font packaging, CJK shaping, iOS Safari behavior, and WASM asset deployment on GitHub Pages.
3. Build a standalone minimal TGFX Web demo; verify correct loading under Vite's base path.
4. Compare Canvas/SVG vs TGFX: cold start, p50/p95 frame times, peak memory, visual diff, export consistency and battery impact.
5. Test mobile Safari, Chrome desktop, GPU unavailable, context loss, WebLLM simultaneously active.

## Acceptance
- Existing editor and export remain unchanged with flag OFF.
- Toggle only affects experimental surfaces; no change to model routing or SLIME.
- All error paths recover without losing work.
- Performance benefit demonstrated with representative real designs before enabling by default.

Upstream: https://github.com/Tencent/tgfx
