#!/usr/bin/env node
/**
 * US-2 (93-runtime-logic-to-core) — classify the game-engine/logic boundary.
 *
 * `packages/babylon/src/engine/game-engine/logic/` contains ZERO `@babylonjs` imports,
 * which is what made "logic/ is the shared runtime" measurable in the first place. That
 * measurement is necessary but NOT sufficient: a module can be coupled to the Babylon
 * runtime through a type, through a `@shared/*` shim that resolves into
 * `packages/babylon/src`, or through a browser/DOM assumption, without ever naming
 * `@babylonjs`. So before US-3 moves anything, every file is classified by what its
 * transitive first-party closure ACTUALLY reaches:
 *
 *   a — engine-agnostic and moving. Its whole closure is already inside logic/ or
 *       inside packages/core/src. Nothing has to move first.
 *   b — engine-agnostic but depending on something not yet in core. Clean itself, but
 *       its closure reaches real source still living in shared/ or elsewhere in the
 *       Babylon package. Resolve by MOVING that dependency into core or INVERTING it —
 *       never by re-exporting from babylon back into core (US-1's guard rejects that,
 *       and it would defeat the extraction the guard protects). The prescribed
 *       resolution for every blocker is recorded in BLOCKER_RESOLUTIONS below.
 *   c — actually Babylon-coupled despite the import scan. Do not move. `couplings`
 *       names the specific edge, whether it is type-only, and the path it enters by;
 *       COUPLING_VERDICTS records the human decision for each.
 *
 * Class-(c) marker kinds, alphabetical as reported:
 *   babylon-runtime — the closure reaches packages/babylon/src/engine/game-engine/rendering/.
 *   babylonjs       — the closure imports `@babylonjs/*`.
 *   dom             — the file ITSELF uses a browser global. packages/core/tsconfig.json
 *                     deliberately omits the `dom` lib, so this does not compile in core.
 *   react           — the closure imports react / react-dom (a rendering-layer tell).
 *
 * `typeOnly: true` on a coupling means every edge on the path was an `import type` /
 * `export type`. Those erase at runtime, so they are breakable with a structural
 * stand-in (the US-CE6 `visual-types.ts` precedent). A value edge is a real runtime
 * dependency and needs an inverted interface or has to stay behind.
 *
 * Regenerate with: npm run logic:classify
 * Drift-guarded by shared/__tests__/import-hygiene.test.ts.
 * Narrative + the US-3 plan: packages/core/docs/logic-boundary-classification.md
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC_DIR = 'packages/babylon/src/engine/game-engine/logic';
const CORE_SRC = 'packages/core/src';
const BABYLON_SRC = 'packages/babylon/src';
const RENDERING_DIR = 'packages/babylon/src/engine/game-engine/rendering';
const OUT = join(ROOT, 'shared', 'LOGIC_BOUNDARY.json');

const rel = (abs) => relative(ROOT, abs).split(sep).join('/');

/**
 * The prescribed resolution for every class-(b) blocker. AC3 of US-2: a blocker is
 * resolved by MOVING it into core or INVERTING it — the `via: 're-export-from-babylon'`
 * escape hatch does not exist, and the drift guard fails if a `moveTo` target ever
 * points anywhere but packages/core/src.
 *
 * Keys must match the computed blocker set EXACTLY (the guard asserts both directions),
 * so a newly-introduced blocker cannot slip into US-3 undocumented.
 */
const BLOCKER_RESOLUTIONS = {
  'packages/babylon/src/engine/game-engine/types.ts': {
    via: 'move-subset',
    moveTo: 'packages/core/src/game-engine/runtime-types.ts',
    why:
      'US-3 DID this move: the 52-declaration engine-agnostic closure logic/ depends on ' +
      '(Action*, ACTION_UI_CONFIGS, InventoryItem, Container*, Crafting*, Rule*, Need*, ' +
      'GameSaveState + its Saved* closure, AnimationState, NPCRole, NoticeArticle, ' +
      'ILocalAIProvider, ...) now lives in packages/core/src/game-engine/runtime-types.ts as a ' +
      'REAL, CHECKED module, and this file re-exports it explicitly. What is left blocking is ' +
      'ONE module, StreetNetworkLayout.ts, whose imported symbols (StreetNode, StreetNetwork, ' +
      'StreetSegment) ARE among the duplicate-interface bugs the @ts-nocheck here quarantines — ' +
      'StreetNode is declared twice with divergent shapes ({position,elevation,type} vs ' +
      '{x,z,intersectionOf}), which is why StreetNetworkLayout casts every literal through ' +
      '`as unknown as`. Lifting those would either drag the @ts-nocheck into core or silently ' +
      'change the shape other Babylon consumers see. It is also street GEOMETRY generation, ' +
      'which US-4 keeps per-engine by design. So it stays until US-RS4 dedupes the interfaces.',
  },
};

/**
 * The human decision for every class-(c) module. AC2: named with the specific coupling,
 * not papered over. Keys must match the computed class-(c) set exactly.
 *
 * `disposition` is one of:
 *   stays          — genuinely a Babylon-layer module; the other engines write their own.
 *   invert         — the coupling is thin enough to become an interface core owns, with
 *                    the Babylon module as the reference implementation (US-4's subject).
 *   platform-surface — a .d.ts type surface, not an implementation; nothing to move.
 */
const COUPLING_VERDICTS = {
  'packages/babylon/src/engine/game-engine/logic/GamePrologEngine.ts': {
    disposition: 'invert',
    summary:
      'Two value imports and nothing else: isDebugLabelsEnabled() from rendering/DebugLabelUtils ' +
      '(a boolean flag getter living in a 332-line Babylon GUI module) and getDebugEventBus() from ' +
      'debug-event-bus (whose own Babylon tie is a single `import type DebugLogCategory`). 2,267 ' +
      'lines of Prolog runtime held behind the boundary by a debug-logging seam. Invert both into ' +
      'a core-owned debug sink interface; the Babylon bus becomes the reference implementation.',
  },
  'packages/babylon/src/engine/game-engine/logic/AssessmentEngine.ts': {
    disposition: 'invert',
    summary:
      'Inherits GamePrologEngine\'s debug seam and adds one `window` reference of its own. Both ' +
      'go away with the same debug-sink inversion plus a host-capability check; nothing here ' +
      'touches a scene graph.',
  },
  'packages/babylon/src/engine/game-engine/logic/RadiantQuestDirector.ts': {
    disposition: 'invert',
    summary:
      'Owns no coupling at all. Its single edge is `import type { GamePrologEngine }` — the engine ' +
      'is already constructor-injected, so the import erases at runtime and only the TYPE crosses ' +
      'the boundary. Becomes class (a) the moment GamePrologEngine\'s debug seam is inverted.',
  },
  'packages/babylon/src/engine/game-engine/logic/LanguageProgressTracker.ts': {
    disposition: 'invert',
    summary:
      'Value import of the LanguageDebugLogger (a rendering module) plus ' +
      'window.addEventListener("beforeunload") for flush-on-exit. The debug logger folds into ' +
      'the same core debug sink; the beforeunload hook is a PERSISTENCE lifecycle hook the ' +
      'adapter must provide (US-4 lists it), not something core can own.',
  },
  'packages/babylon/src/engine/game-engine/logic/EquipmentManager.ts': {
    disposition: 'invert',
    summary:
      'One TYPE-ONLY import: `import type { CombatSystem } from "../rendering/CombatSystem"`. ' +
      'Erases at runtime, so a structural stand-in in core (the US-CE6 visual-types.ts ' +
      'precedent) breaks it outright — the cheapest class-(c) file on the list.',
  },
  'packages/babylon/src/engine/game-engine/logic/AmbientLifeBehaviorSystem.ts': {
    disposition: 'invert',
    summary:
      'One TYPE-ONLY import (`type NPCPersonality` from rendering/NPCScheduleSystem) that drags ' +
      'the whole interior-generation subtree into the closure. Same structural stand-in fix as ' +
      'EquipmentManager; the enormous @babylonjs path list below is the type import\'s shadow, ' +
      'not a runtime dependency.',
  },
  'packages/babylon/src/engine/game-engine/logic/CraftingSystem.ts': {
    disposition: 'invert',
    summary:
      'Value import of ResourceType + ResourceSystem from rendering/ResourceSystem. ResourceType ' +
      'is world data and belongs in core; ResourceSystem is a harvestable-node manager that is ' +
      'genuinely rendering-side, so it inverts to an interface core calls.',
  },
  'packages/babylon/src/engine/game-engine/logic/ActionHotspotIntegration.ts': {
    disposition: 'stays',
    summary:
      'Value import and construction of PlayerActionSystem. This module exists to wire hotspots ' +
      'into the Babylon player-action loop — it is adapter glue by purpose, not runtime logic ' +
      'trapped on the wrong side. Its sibling ActionHotspotGenerator IS class (a) and moves.',
  },
  'packages/babylon/src/engine/game-engine/logic/WorldObjectActionManager.ts': {
    disposition: 'stays',
    summary:
      'Value import of getItemTranslation from rendering/OnboardingLauncher, which pulls in the ' +
      'assessment modal UI and @babylonjs/gui. The manager mediates between world objects and ' +
      'on-screen prompts; splitting it is a rewrite, not a move. Revisit after US-4 defines the ' +
      'prompt/UI adapter surface.',
  },
  'packages/babylon/src/engine/game-engine/logic/GameQuestManager.d.ts': {
    disposition: 'platform-surface',
    summary:
      'Not an implementation — a .d.ts type surface whose concrete class is injected by the ' +
      'platform at export time (the CLAUDE.md ".d.ts rather than vendoring" rule). It is class ' +
      '(c) only because it references the GamePrologEngine shim. Nothing to move; it follows ' +
      'whatever GamePrologEngine does.',
  },
};

/** Browser globals that cannot exist in core (its tsconfig omits the `dom` lib). */
const DOM_GLOBALS =
  /\b(window|document|localStorage|sessionStorage|navigator|requestAnimationFrame|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|AudioContext)\b/;

/** Strip comments so a `@babylonjs` named in a header note is not counted as a coupling. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Additionally strip string literals, so a `document` inside a message is not a DOM use. */
function stripCommentsAndStrings(src) {
  return stripComments(src)
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

const SPECIFIER_RE = /(import|export|require)\s+(type\s+)?([\s\S]*?)?['"]([^'"]+)['"]/g;

/**
 * Import/export/require specifiers with a type-only flag.
 * A statement is type-only when it is `import type` / `export type`; a mixed
 * `import { type A, B }` is NOT, because B crosses at runtime.
 */
function specifiersOf(src) {
  const body = stripComments(src);
  const out = [];
  // Match statement-by-statement so the `type` keyword is attributed correctly.
  const stmt = /(?:^|[;}\n])\s*(import|export)\s+(type\s+)?(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = stmt.exec(body))) out.push({ spec: m[3], typeOnly: Boolean(m[2]) });
  // Dynamic import()/require() are always value edges.
  const dyn = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(body))) out.push({ spec: m[1], typeOnly: false });
  return out;
}

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];

/** Resolve a module path (no extension) to a real first-party file, or null. */
function resolveFile(base) {
  for (const candidate of [base, base.replace(/\.js$/, '')]) {
    for (const suffix of CANDIDATE_SUFFIXES) {
      const p = candidate + suffix;
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return null;
}

/** Resolve one specifier to an absolute first-party file, or null when external. */
function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith('.')) return resolveFile(resolve(dirname(fromFile), spec));
  if (spec.startsWith('@shared/')) return resolveFile(join(ROOT, 'shared', spec.slice('@shared/'.length)));
  if (spec === '@insimul/core') return resolveFile(join(ROOT, CORE_SRC, 'index'));
  if (spec.startsWith('@insimul/core/')) return resolveFile(join(ROOT, CORE_SRC, spec.slice('@insimul/core/'.length)));
  if (spec === '@insimul/babylon') return resolveFile(join(ROOT, BABYLON_SRC, 'index'));
  if (spec.startsWith('@insimul/babylon/')) return resolveFile(join(ROOT, BABYLON_SRC, spec.slice('@insimul/babylon/'.length)));
  return null;
}

/** Which class-(c) marker, if any, an EXTERNAL specifier carries. */
function externalKind(spec) {
  if (spec.startsWith('@babylonjs')) return 'babylonjs';
  if (/^react(-dom)?(\/|$)/.test(spec)) return 'react';
  return null;
}

/**
 * A shim is a file whose entire body is import/export-from statements — it carries no
 * source of its own, so it is transparent for blocker purposes (US-BC5's shim rule).
 * `packages/babylon/src/engine/game-engine/data-source.ts` is one: a single
 * `export * from '@insimul/core/game-engine/data-source'`. Counting it as a blocker
 * would claim core depends on babylon when the arrow runs the other way.
 */
function isShim(src) {
  const rest = stripComments(src)
    .replace(/(?:^|[;}\n])\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\bfrom\s*)?['"][^'"]+['"]\s*;?/g, '\n')
    .replace(/[\s;]/g, '');
  return rest.length === 0;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Where a first-party file lives, for classification purposes. */
function zoneOf(relPath) {
  if (relPath.startsWith(`${LOGIC_DIR}/`)) return 'logic';
  if (relPath.startsWith(`${CORE_SRC}/`)) return 'core';
  if (relPath.startsWith(`${RENDERING_DIR}/`)) return 'rendering';
  if (relPath.startsWith(`${BABYLON_SRC}/`)) return 'babylon';
  if (relPath.startsWith('shared/')) return 'shared';
  return 'other';
}

/** Per-file facts, memoized: resolved first-party edges, own markers, shim-ness. */
function makeFileReader() {
  const cache = new Map();
  return function read(abs) {
    if (cache.has(abs)) return cache.get(abs);
    let src = '';
    try {
      src = readFileSync(abs, 'utf8');
    } catch {
      /* unreadable — treat as a leaf */
    }
    const edges = [];
    const own = [];
    for (const { spec, typeOnly } of specifiersOf(src)) {
      const target = resolveSpecifier(spec, abs);
      if (target) {
        edges.push({ spec, target, typeOnly });
        continue;
      }
      const kind = externalKind(spec);
      if (kind) own.push({ kind, detail: spec, typeOnly });
    }
    const stripped = stripCommentsAndStrings(src);
    const domMatch = stripped.match(DOM_GLOBALS);
    if (domMatch) own.push({ kind: 'dom', detail: domMatch[0], typeOnly: false });
    const record = { edges, own, shim: isShim(src) };
    cache.set(abs, record);
    return record;
  };
}

/**
 * Closure walk from one logic/ file.
 *
 * State is keyed by (file, typeOnly-so-far) so a module reached by both a value path and
 * a type-only path is analysed under both — otherwise whichever path happened to be
 * visited first would decide, and a value coupling could be reported as erasable.
 */
function analyse(entry, read) {
  const seen = new Set();
  const couplings = [];
  const blockers = new Map();
  const stack = [{ abs: entry, path: [], typeOnly: false }];

  while (stack.length) {
    const { abs, path, typeOnly } = stack.pop();
    const key = `${abs}::${typeOnly ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const relPath = rel(abs);
    const zone = zoneOf(relPath);
    const { edges, own, shim } = read(abs);
    const here = [...path, relPath];

    for (const marker of own) {
      // A DOM global only counts when the logic/ file ITSELF uses it — a browser global
      // deep inside an unrelated module is that module's problem, and is already
      // captured as a class-(b) blocker or a rendering coupling.
      if (marker.kind === 'dom' && abs !== entry) continue;
      couplings.push({ kind: marker.kind, detail: marker.detail, via: relPath, path: here, typeOnly: typeOnly || marker.typeOnly });
    }
    if (zone === 'rendering') {
      couplings.push({ kind: 'babylon-runtime', detail: relPath, via: relPath, path: here, typeOnly });
    }
    // Real source outside logic/ and outside core is what US-3 has to move first.
    // Shims carry no source, so they are transparent.
    if ((zone === 'shared' || zone === 'babylon') && abs !== entry && !shim) {
      const prev = blockers.get(relPath);
      if (!prev || (prev.typeOnly && !typeOnly) || (prev.typeOnly === typeOnly && here.length < prev.path.length)) {
        blockers.set(relPath, { path: here, typeOnly });
      }
    }

    for (const edge of edges) {
      stack.push({ abs: edge.target, path: here, typeOnly: typeOnly || edge.typeOnly });
    }
  }

  return { couplings, blockers };
}

/** Dedupe by (kind, detail), preferring a value path, then the shortest path. */
function dedupe(couplings) {
  const byKey = new Map();
  for (const c of couplings) {
    const key = `${c.kind}::${c.detail}`;
    const prev = byKey.get(key);
    const better = !prev || (prev.typeOnly && !c.typeOnly) || (prev.typeOnly === c.typeOnly && c.path.length < prev.path.length);
    if (better) byKey.set(key, c);
  }
  return [...byKey.values()].sort((x, y) => `${x.kind}${x.detail}`.localeCompare(`${y.kind}${y.detail}`));
}

export function classify() {
  const read = makeFileReader();
  const entries = walk(join(ROOT, LOGIC_DIR)).sort();
  const files = [];

  for (const abs of entries) {
    const relPath = rel(abs);
    const { couplings, blockers } = analyse(abs, read);
    const unique = dedupe(couplings);

    const cls = unique.length > 0 ? 'c' : blockers.size > 0 ? 'b' : 'a';
    const record = { file: relPath, class: cls };
    if (cls === 'c') {
      const verdict = COUPLING_VERDICTS[relPath];
      record.disposition = verdict?.disposition ?? null;
      record.verdict = verdict?.summary ?? null;
      record.valueCoupled = unique.some((c) => !c.typeOnly);
      record.couplings = unique.map((c) => ({
        kind: c.kind,
        detail: c.detail,
        typeOnly: c.typeOnly,
        via: c.via,
        path: c.path.join(' -> '),
      }));
    }
    if (cls === 'b') {
      record.blockers = [...blockers.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, info]) => ({ file, typeOnly: info.typeOnly, path: info.path.join(' -> ') }));
    }
    files.push(record);
  }

  const counts = { a: 0, b: 0, c: 0 };
  for (const f of files) counts[f.class] += 1;

  // The class-(b) work queue: every distinct blocker, who waits on it, and the
  // prescribed resolution (AC3).
  const blockerIndex = new Map();
  for (const f of files) {
    for (const b of f.blockers ?? []) {
      if (!blockerIndex.has(b.file)) blockerIndex.set(b.file, new Set());
      blockerIndex.get(b.file).add(f.file);
    }
  }
  const blockers = [...blockerIndex.entries()]
    .map(([file, waiters]) => ({
      file,
      zone: zoneOf(file),
      blocks: waiters.size,
      resolution: BLOCKER_RESOLUTIONS[file] ?? null,
      blocked: [...waiters].sort(),
    }))
    .sort((x, y) => y.blocks - x.blocks || x.file.localeCompare(y.file));

  return {
    description:
      'Classification of every module under packages/babylon/src/engine/game-engine/logic/ by ' +
      'what its transitive first-party closure actually reaches. Generated by ' +
      'scripts/classify-logic-boundary.mjs (npm run logic:classify); drift-guarded by ' +
      'shared/__tests__/import-hygiene.test.ts. Excludes __tests__/ and *.test.ts. ' +
      'Narrative and the US-3 execution plan: packages/core/docs/logic-boundary-classification.md',
    legend: {
      a: 'Engine-agnostic and moving — whole closure is already in logic/ or packages/core/src.',
      b: 'Engine-agnostic but blocked — closure reaches real source not yet in core. Resolve by moving or inverting that dependency, NEVER by re-exporting from babylon back into core.',
      c: 'Babylon-coupled despite the @babylonjs import scan. Do not move; see `couplings` and `disposition`.',
      typeOnly:
        'The coupling/blocker is reached only through `import type` edges, which erase at runtime — breakable with a structural stand-in in core (the US-CE6 visual-types.ts precedent). A value edge is a real runtime dependency.',
    },
    counts: { ...counts, total: files.length },
    blockers,
    files,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = classify();
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  const { a, b, c, total } = result.counts;
  console.log(`shared/LOGIC_BOUNDARY.json written: ${total} modules — ${a} class (a), ${b} class (b), ${c} class (c).`);
  console.log(`${result.blockers.length} distinct class-(b) blockers.`);
  const typeOnlyC = result.files.filter((f) => f.class === 'c' && !f.valueCoupled).length;
  console.log(`${typeOnlyC} of the ${c} class-(c) modules are coupled ONLY through type imports.`);
}
