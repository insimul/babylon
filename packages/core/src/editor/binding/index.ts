/**
 * `@insimul/core/editor/binding` — the asset-binding resolution chain.
 *
 * Deep-import-only, like the whole editor surface: nothing here is re-exported
 * from the flat runtime barrel (`src/index.ts`), because a shipping game embeds
 * the runtime core and not the editor core.
 */

export * from './resolver';
export * from './pack';
