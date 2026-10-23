import type { LunaDoc } from './model';
import { lunaPNG } from './export';

export type Renderer = (doc: LunaDoc) => Promise<Blob>;
let optionalRenderer: Renderer | null = null;

export function registerExperimentalRenderer(renderer: Renderer | null): void {
  optionalRenderer = renderer;
}

export async function renderLunaPNG(doc: LunaDoc, experimental = false): Promise<Blob> {
  if (experimental && optionalRenderer) {
    try {
      const output = await optionalRenderer(doc);
      if (output.type === 'image/png' && output.size > 0) return output;
    } catch {
      // Preserve the existing export path if the experimental backend fails.
    }
  }
  return lunaPNG(doc);
}
