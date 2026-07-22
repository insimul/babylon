/**
 * The web npm packages covered by the release tooling — the single source of truth
 * shared by the publish gate (`npm-publish-dry-run.mjs`) and the release orchestrator
 * (`publish-web-packages.mjs`), so the two can never disagree about what ships.
 *
 * `mustInclude` lists the files a package must ship beyond README/LICENSE (which are
 * required of every package). `deprecated: true` marks a passthrough package (US-PB2):
 * it must carry deprecation metadata pointing at @insimul/babylon, depend on it, ship
 * shims that still resolve there once installed, and get an `npm deprecate` call after
 * each publish.
 *
 * Order matters: the passthroughs are checked against the successor's own tarball, so
 * @insimul/babylon must be packed before them.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PACKAGES = [
  { dir: 'packages/core', name: '@insimul/core', mustInclude: ['src/index.ts', 'schemas/save-file.schema.json'] },
  {
    dir: 'packages/babylon',
    name: '@insimul/babylon',
    mustInclude: ['src/index.ts', 'src/conversation/index.ts', 'src/data/index.ts', 'src/engine/index.ts', 'templates/vite.config.ts'],
  },
  {
    dir: 'packages/typescript',
    name: '@insimul/typescript',
    mustInclude: ['src/index.ts'],
    deprecated: true,
  },
  {
    dir: 'packages/babylon-game',
    name: '@insimul/babylon-game',
    // The snapshotted shim surface (OLD_EXPORT_SURFACE.json) is asserted separately;
    // these are the two entry points the platform imports directly.
    mustInclude: ['src/WorldStateManager.ts', 'src/DataSource.ts'],
    deprecated: true,
  },
];

/** The package every deprecated passthrough must point at. */
export const SUCCESSOR = '@insimul/babylon';

/**
 * Git tag that triggers a web-package release: `web-v<train>`, where the train is a
 * date (e.g. `web-v2026.07.22`). The tag marks the release *train*, not a version —
 * the four packages are independently versioned in their manifests (single-sourced
 * from VERSIONS.json `web`), so one tag publishes whichever versions are new.
 */
export const RELEASE_TAG_PATTERN = /^web-v[0-9][0-9A-Za-z.\-+]*$/;
