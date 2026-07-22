/**
 * US-PB3 — Release-workflow guard.
 *
 * `.github/workflows/release-web-packages.yml` is the only automation that can reach
 * the npm registry, so its guards are load-bearing: a publish must be impossible
 * without the INSIMUL_PUBLISH_ENABLED repository variable, the `npm-release`
 * environment's reviewers, AND the release script's own `--execute` + INSIMUL_PUBLISH
 * opt-ins. This test parses the workflow and asserts exactly that — plus that the
 * verification job still runs every gate (check / test / export-shell / publish gate /
 * release dry-run) before anything is released.
 *
 * If this fails, do NOT relax the assertion: the failure means a code path that can
 * publish has lost one of its guards. See docs/PUBLISHING.md § "The release workflow".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

// Repo root is two levels up from shared/__tests__.
const ROOT = resolve(__dirname, '..', '..');
const WORKFLOW_PATH = '.github/workflows/release-web-packages.yml';

const raw = readFileSync(join(ROOT, WORKFLOW_PATH), 'utf8');
interface Step {
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  needs?: string | string[];
  environment?: string;
  steps: Step[];
}
// `on:` is YAML 1.1's boolean `true` once parsed — see the accessor below.
const workflow = parse(raw) as { jobs: Record<string, Job> };
// js-yaml/yaml resolve the bare key `on` to the boolean true (YAML 1.1 compatibility),
// so read the trigger block through both spellings.
const triggers = ((workflow as Record<string, unknown>).on ?? (workflow as Record<string, unknown>)[true as unknown as string]) as {
  push?: { tags?: string[] };
  workflow_dispatch?: unknown;
};

const runs = (jobName: string) => (workflow.jobs[jobName].steps ?? []).map((s) => s.run ?? '').filter(Boolean);

/** Every `run:` line in the workflow, paired with the job that owns it. */
const allRuns = Object.entries(workflow.jobs).flatMap(([jobName, job]) =>
  (job.steps ?? []).map((step) => ({ jobName, job, run: step.run ?? '' })),
);

describe('release workflow', () => {
  it('triggers on a web-v* tag', () => {
    expect(triggers.push?.tags).toContain('web-v*');
    expect(triggers).toHaveProperty('workflow_dispatch');
  });

  it('verifies with every gate before any publish job runs', () => {
    const verifySteps = runs('verify').join('\n');
    for (const gate of ['npm run check', 'npm test', 'npm run test:export-shell', 'npm run publish:dry-run']) {
      expect(verifySteps).toContain(gate);
    }
    // The rehearsal: the release script itself, without --execute.
    expect(verifySteps).toMatch(/publish-web-packages\.mjs(?!.*--execute)/);
    expect(workflow.jobs.publish.needs ?? []).toContain('verify');
  });

  it('never publishes from an unguarded step', () => {
    const publishing = allRuns.filter(({ run }) => /--execute\b|npm (publish|deprecate)\b/.test(run));
    expect(publishing.length).toBeGreaterThan(0);

    for (const { jobName, job, run } of publishing) {
      // Guard 1: the repository variable. Unset (the default) ⇒ the job never runs.
      expect(job.if, `${jobName} runs "${run}" without an if: guard`).toBeTruthy();
      expect(job.if, `${jobName} must be gated on INSIMUL_PUBLISH_ENABLED`).toContain("vars.INSIMUL_PUBLISH_ENABLED == 'true'");
      // Guard 2: a protected environment (reviewer approval).
      expect(job.environment, `${jobName} must run in a protected environment`).toBe('npm-release');
    }
  });

  it('supplies the release script both of its own opt-ins together', () => {
    for (const { job, run } of allRuns) {
      if (!/--execute\b/.test(run)) continue;
      const step = (job.steps ?? []).find((s) => s.run === run);
      expect(step?.env?.INSIMUL_PUBLISH, '--execute is inert without INSIMUL_PUBLISH=1').toBe('1');
    }
  });

  it('has no `npm publish` outside the guarded job', () => {
    // A bare `npm publish` anywhere else (e.g. added to the verify job) would upload.
    const unguarded = allRuns.filter(
      ({ jobName, run }) => jobName !== 'publish' && /\bnpm publish\b/.test(run) && !/--dry-run\b/.test(run),
    );
    expect(unguarded.map((u) => `${u.jobName}: ${u.run}`)).toEqual([]);
  });
});
