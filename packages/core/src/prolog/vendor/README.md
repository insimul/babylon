# `packages/core/src/prolog/vendor/`

Third-party / cross-repo build artifacts that are **committed on purpose**.

| Directory | What it is | Where it comes from |
| --- | --- | --- |
| `prolog-wasm/` | `@insimul/prolog-wasm` — libinsimul (Trealla) built for `wasm32-emscripten` | `insimul/native`, `scripts/package.sh --target wasm` |

Refresh with `npm run wasm:vendor` from `packages/core` (see
`../../../scripts/vendor-prolog-wasm.mjs`). The decision record for why this is
committed rather than fetched is
[`packages/core/docs/prolog-wasm-acquisition.md`](../../../docs/prolog-wasm-acquisition.md).

Nothing here is hand-edited. `prolog-wasm/index.d.mts` is the one exception: it
is our hand-written TypeScript surface for the (untyped, hand-written)
`insimul-api.mjs`, and it travels with the artifact so a refresh does not lose
it — `vendor-prolog-wasm.mjs` preserves it across a re-stage.
