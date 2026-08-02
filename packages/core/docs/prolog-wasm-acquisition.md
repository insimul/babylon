# How the WebAssembly Prolog engine gets here

**Decision (US-1, `91-babylon-prolog-wasm`): the artifact is committed to this
repository, at `packages/core/src/prolog/vendor/prolog-wasm/`.**

This is a deliberate departure from the fetch-not-commit convention the native
engine plugins follow, and the rest of this document is the justification, the
alternatives that were rejected, and how to refresh it.

## What the artifact is

`@insimul/prolog-wasm` — libinsimul (Trealla Prolog behind the twelve-function C
ABI of `insimul.h`) compiled for `wasm32-emscripten`. It is produced by the
sibling `insimul/native` repository:

```
insimul-native $ scripts/build_wasm.sh          # emcmake + emcc → build-wasm/
insimul-native $ scripts/package.sh --target wasm   # → dist/wasm/
```

`dist/wasm/` is a complete ES-module npm package:

| File | Role |
| --- | --- |
| `package.json` | `@insimul/prolog-wasm`, `type: module`, the exports map |
| `index.mjs` | entry point — `loadInsimul()` as the default export |
| `insimul-api.mjs` | hand-written wrapper over the C ABI (handles, ownership) |
| `insimul.mjs` | the **generated** Emscripten glue (`-sMODULARIZE -sEXPORT_ES6`) |
| `insimul.wasm` | the engine itself, ~2.0 MB, fetched by the glue as a sibling |
| `VERSION` | semver + platform + git sha + the Trealla pin |
| `LICENSE` | Apache-2.0 |

The vendored copy adds exactly one file of our own, `index.d.mts`: a hand-written
TypeScript surface for `insimul-api.mjs`, which upstream ships untyped.

The currently vendored build:

```
insimul 0.1.0
platform wasm32-emscripten
git a9287b5
trealla_tag v2.106.1
trealla_commit 07de013677af760a8bca0594ae4b2bef158a3cde
```

## Why committed rather than fetched

The engine plugin packages (`packages/unity`, `packages/godot`, …) gitignore
their native binaries and stage them from `INSIMUL_NATIVE_DIST` at package time.
Four things make the wasm case different:

1. **It is bundler input, not a platform binary.** The unity/unreal/godot
   artifacts are one file *per platform*, selected at package time by the engine
   toolchain. The wasm build is a single, platform-independent file that a JS
   bundler must be able to resolve while it builds a game. Every consumer needs
   the same bytes, so there is nothing for a fetch step to select.

2. **The build environment cannot be assumed.** Producing it needs Emscripten
   (`emsdk`), CMake, and a network clone of the pinned Trealla commit. Requiring
   that of anyone who runs `npm test` in this repo — or of the export pipeline,
   which runs `vite build` on a generated game project — is not viable.

3. **There is nowhere to fetch it from yet.** `@insimul/prolog-wasm` is not
   published to any registry, and libinsimul cuts no tagged release artifacts.
   A fetch step would have to point at "a local libinsimul build", which fails
   the acceptance criterion that a developer with **no native checkout** can
   build this repo. Chief also worktrees one submodule at a time, so
   `insimul/native` is frequently not present at any sibling path.

4. **A silent fallback is worse than a big repo.** If the artifact could go
   missing, the tempting recovery is to fall back to tau-prolog — which would
   make the US-2 parity diff compare tau-prolog against itself and pass
   vacuously. Committing the bytes removes the failure mode instead of handling
   it.

The cost is ~2.2 MB of binary in git history, once, plus ~2.2 MB per refresh.
Measured transfer cost to a *game* is lower: 562 KB gzipped, 415 KB brotli.

### Rejected alternatives

| Option | Why not |
| --- | --- |
| Fetch from a GitHub release produced by libinsimul | No such release exists; adds a network dependency to `npm install` and to CI. Revisit if libinsimul starts publishing — this file is the place to record the switch. |
| Publish `@insimul/prolog-wasm` to the GitHub npm registry and depend on it | The cleanest end state, but it makes every consumer of `@insimul/core` need registry auth for a *second* scope, and the export pipeline vendors source trees rather than installing packages. |
| Build it during `postinstall` | Requires Emscripten on every developer machine and in CI. |
| Inline the binary as base64 (`-sSINGLE_FILE=1`) | +33 % size and no streaming compilation, for no benefit here. |

## Where it lives, and why *inside* `src/`

`packages/core/src/prolog/vendor/prolog-wasm/`.

Under `src/` specifically, because the game-export pipeline vendors
`packages/core/src` into a generated project as `src/insimul-core` (see
`packages/babylon/scripts/export-shell-smoke.mjs`). An artifact outside `src/`
would resolve in this repo and vanish from every exported game. `files` in
`packages/core/package.json` already ships `src`, so publishing needs no change
either.

The dependency-direction guard is satisfied because the import
(`./vendor/prolog-wasm/index.mjs`, from `src/prolog/wasm-loader.ts`) is a
relative path that stays inside the package.

## Refreshing it

```bash
# 1. build + package in the libinsimul checkout
cd <insimul-native> && scripts/build_wasm.sh && scripts/package.sh --target wasm

# 2. re-stage here
cd packages/core && npm run wasm:vendor -- --from <insimul-native>/dist/wasm
```

`INSIMUL_NATIVE_DIST` / `INSIMUL_NATIVE_ROOT` work in place of `--from`, matching
the environment variables the Godot and Unity packaging steps already read.
`npm run wasm:vendor -- --check --from <dir>` compares without writing.

The script preserves `index.d.mts` and refuses a source directory that is not a
packaged `@insimul/prolog-wasm`.

## What guards it

`src/prolog/__tests__/prolog-wasm-vendor.test.ts`:

- every file the upstream `package.json` declares is present;
- `insimul.wasm` starts with the `\0asm` magic and is a plausible size;
- the `VERSION` stamp, the vendored `package.json` version, and the version the
  **loaded engine** reports all agree — so a half-refreshed directory (new glue,
  stale binary) fails rather than running the wrong engine;
- the engine actually solves a goal through `WasmPrologEngine`.

Because the vendored copy is the only source, "artifact unavailable" and "tests
red" are the same event: there is no path where a missing engine degrades
quietly to tau-prolog. `loadPrologWasm()` rejects with
`PrologWasmUnavailableError`, whose message names this document and the two
commands above.
