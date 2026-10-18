export type LocalAICapabilities = {
  webgpu: boolean;
  wasm: boolean;
  indexedDB: boolean;
  serviceWorker: boolean;
  secureContext: boolean;
};
export function detectLocalAICapabilities(): LocalAICapabilities {
  return {
    webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
    wasm: typeof WebAssembly !== "undefined",
    indexedDB: typeof indexedDB !== "undefined",
    serviceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    secureContext: typeof window !== "undefined" && window.isSecureContext,
  };
}
