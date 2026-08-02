/**
 * `@insimul/core/editor` — the **edit-time** core.
 *
 * The engine-agnostic contract the three native editor plugins mirror: session
 * and token lifecycle, the v1 operation table, the generation-job reducer and
 * poller, the world browser, the conversation tester, and — added by US-2 of
 * `101-editor-plugin-core` — the three capabilities that were implemented in
 * every engine and in none of core:
 *
 *  - `./binding`  — the archetype → asset resolution chain (+ pack parse,
 *    canonical serialize, taxonomy validation);
 *  - `./scene`    — the placement math and the canonical placement manifest;
 *  - `./reimport` — the five-way diff policy and the apply orchestration;
 *  - `./host-contracts` — the three interfaces core calls back into the plugin
 *    (`SceneMutator`, `AssetResolver`, `ProgressSink`).
 *
 * **Deep-import-only, on purpose.** A shipping game embeds the runtime core and
 * NOT this surface, so nothing here may be re-exported from the flat runtime
 * barrel (`src/index.ts`). `__tests__/editor-surface.test.ts` fails if it is.
 * Reach for `@insimul/core/editor` or a subpath
 * (`@insimul/core/editor/reimport/diff`); never `@insimul/core`.
 *
 * `conversation-tester` stays out of this barrel too: its `ConversationState`
 * (a reducer accumulator) collides with the proto/conversation enum of the same
 * name, so it remains subpath-only — `@insimul/core/editor/conversation-tester`.
 */

export * from './operations';
export * from './editor-session';
export * from './world-browser';
export * from './generation-console';
export * from './job-poller';
export * from './host-contracts';
export * from './binding';
export * from './scene';
export * from './reimport';
