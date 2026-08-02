/**
 * The vendored wasm artifact is present, coherent, and really is the engine
 * that gets loaded (US-1, 91-babylon-prolog-wasm).
 *
 * Because the artifact is COMMITTED rather than fetched (see
 * `docs/prolog-wasm-acquisition.md`), "the artifact is unavailable" and "the
 * tests are red" have to be the same event. There is deliberately no path in
 * which a missing engine degrades quietly to tau-prolog — that would make the
 * US-2 parity diff compare tau-prolog against itself and pass vacuously.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WasmPrologEngine } from '../wasm-engine';
import { loadPrologWasm } from '../wasm-loader';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'prolog-wasm');

function vendorFile(name: string): string {
  return join(VENDOR, name);
}

function versionStamp(): Record<string, string> {
  const stamp: Record<string, string> = {};
  for (const line of readFileSync(vendorFile('VERSION'), 'utf8').split('\n')) {
    const [key, ...rest] = line.trim().split(' ');
    if (key) stamp[key] = rest.join(' ');
  }
  return stamp;
}

describe('vendored @insimul/prolog-wasm', () => {
  const manifest = JSON.parse(readFileSync(vendorFile('package.json'), 'utf8')) as {
    name: string;
    version: string;
    files: string[];
  };

  it('is the packaged upstream artifact', () => {
    expect(manifest.name).toBe('@insimul/prolog-wasm');
  });

  it('ships every file its own package.json declares', () => {
    expect(manifest.files.length).toBeGreaterThan(0);
    for (const file of manifest.files) {
      expect(existsSync(vendorFile(file)), `missing vendored file: ${file}`).toBe(true);
    }
  });

  it('carries our hand-written TypeScript surface', () => {
    // Not part of the upstream package — vendor-prolog-wasm.mjs preserves it
    // across a re-stage. Without it, wasm-loader.ts has no types to import.
    expect(existsSync(vendorFile('index.d.mts'))).toBe(true);
  });

  it('has a real WebAssembly binary of a plausible size', () => {
    const bytes = readFileSync(vendorFile('insimul.wasm'));
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x00, 0x61, 0x73, 0x6d]); // "\0asm"
    // A Trealla build is ~2 MB. A few KB would mean an LFS pointer or a stub.
    expect(statSync(vendorFile('insimul.wasm')).size).toBeGreaterThan(500_000);
  });

  it('records the platform and the Trealla pin', () => {
    const stamp = versionStamp();
    expect(stamp.platform).toBe('wasm32-emscripten');
    expect(stamp.trealla_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(stamp.insimul).toBe(manifest.version);
  });

  it('loads, and the running engine reports the vendored version', async () => {
    // Catches a half-refreshed directory: new glue with a stale binary, or a
    // VERSION file edited without re-staging.
    const insimul = await loadPrologWasm();
    const stamp = versionStamp();
    expect(insimul.version()).toContain(`insimul ${stamp.insimul}`);
    expect(insimul.version()).toContain(stamp.trealla_commit);
  });

  it('actually solves a goal through WasmPrologEngine', async () => {
    const engine = await WasmPrologEngine.create();
    await engine.consult('parent(tom, bob).\nparent(bob, ann).\ngp(X, Z) :- parent(X, Y), parent(Y, Z).');
    const result = await engine.query('gp(X, Z)');
    expect(result.success).toBe(true);
    expect(result.bindings).toEqual([{ X: 'tom', Z: 'ann' }]);
    engine.destroy();
  });
});
