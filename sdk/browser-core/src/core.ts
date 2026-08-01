// Loader for the shared Rust core compiled to WebAssembly (core/web-sdk).
//
// The core exposes the SAME deterministic logic the desktop + mobile apps use:
// policy decisions, skill prompt composition, and realtime replay. In the
// browser we mainly need `composePrompt` (the widget composes the host site's
// teaching prompt client-side).
//
// Loading is lazy + tolerant: the widget renders and works as a UI shell even
// if the WASM module isn't served, so the host page never hard-fails on it.

/** Subset of the wasm-bindgen exports the widget calls (see core/web-sdk). */
export interface SkillyCore {
  composePrompt(input: unknown): string;
  canStartTurn(input: unknown): unknown;
  replayRealtimeEvents(eventsJson: string): unknown;
}

let cachedCore: SkillyCore | null = null;
let loadAttempted = false;

/**
 * Dynamically import + initialize the WASM core from `coreUrl`. Returns null
 * (with a console warning) if unavailable — callers must tolerate the absence.
 * The import specifier is a runtime variable so the bundler leaves it alone
 * (the .wasm is served alongside the host site, not bundled into the widget).
 */
export async function loadCore(coreUrl: string | undefined): Promise<SkillyCore | null> {
  if (cachedCore || loadAttempted) {
    return cachedCore;
  }
  loadAttempted = true;

  if (!coreUrl) {
    return null;
  }

  try {
    const moduleSpecifier = coreUrl;
    const wasmModule = (await import(/* @vite-ignore */ moduleSpecifier)) as {
      default: (input?: unknown) => Promise<unknown>;
    } & SkillyCore;

    // wasm-bindgen's default export initializes the module (fetches the .wasm).
    await wasmModule.default();
    cachedCore = wasmModule;
    return cachedCore;
  } catch (loadError) {
    console.warn("[skilly] WASM core unavailable; widget runs as UI-only:", loadError);
    return null;
  }
}
