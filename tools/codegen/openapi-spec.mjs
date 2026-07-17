// openapi-spec.mjs — load & normalize the vendored OpenAPI v1 spec.
//
// The vendored spec lives at packages/core/openapi/insimul-v1.yaml (a mirror of
// the platform's insimul-platform/openapi/insimul-v1.yaml — see US-CG4 and the
// provenance header in that file). Both the C# client emitter, the operations.json
// emitter, and the drift-guard test read the spec through THIS module so they can
// never disagree on how it is parsed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');

/** Path (relative to repo root) of the vendored OpenAPI spec. */
export const VENDORED_SPEC_REL = join('packages', 'core', 'openapi', 'insimul-v1.yaml');

/** HTTP methods OpenAPI path items may declare, in a stable canonical order. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

/** Read the vendored spec text (raw YAML, provenance header included). */
export function readVendoredSpecText(baseDir = REPO_ROOT) {
  return readFileSync(join(baseDir, VENDORED_SPEC_REL), 'utf8');
}

/** Parse the vendored spec into a plain object. */
export function loadSpec(baseDir = REPO_ROOT) {
  return parseYaml(readVendoredSpecText(baseDir));
}

/** Resolve a local `#/components/schemas/Name` $ref to its schema name (or null). */
export function refName(ref) {
  if (typeof ref !== 'string') return null;
  const m = ref.match(/^#\/components\/schemas\/(.+)$/);
  return m ? m[1] : null;
}

/**
 * Flatten the spec into a deterministic, machine-readable operation list.
 * Order: paths in document order, methods in canonical HTTP order. Pure function
 * of the spec, so the emitted operations.json is byte-stable.
 *
 * @returns {Array<{operationId,method,path,summary,tags,parameters,requestBody,responseSchema}>}
 */
export function collectOperations(spec) {
  const ops = [];
  const paths = spec.paths ?? {};
  for (const path of Object.keys(paths)) {
    const item = paths[path] ?? {};
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;

      // Path- and operation-level parameters (query/path/header/cookie).
      const rawParams = [...(item.parameters ?? []), ...(op.parameters ?? [])];
      const parameters = rawParams.map((p) => ({
        name: p.name,
        in: p.in,
        required: Boolean(p.required),
        type: p.schema?.type ?? 'string',
      }));

      // Request body: pick the single declared content type (json or multipart).
      let requestBody = null;
      if (op.requestBody?.content) {
        const contentType = Object.keys(op.requestBody.content)[0];
        const schema = op.requestBody.content[contentType]?.schema;
        requestBody = {
          required: Boolean(op.requestBody.required),
          contentType,
          schema: refName(schema?.$ref) ?? (schema?.type ?? null),
        };
      }

      // Success response body (2xx), if it references a component schema.
      let responseContentType = null;
      let responseSchema = null;
      const responses = op.responses ?? {};
      const okCode = Object.keys(responses).find((c) => c.startsWith('2'));
      if (okCode && responses[okCode]?.content) {
        responseContentType = Object.keys(responses[okCode].content)[0];
        const schema = responses[okCode].content[responseContentType]?.schema;
        responseSchema = refName(schema?.$ref) ?? (schema?.type ?? null);
      }

      ops.push({
        operationId: op.operationId ?? `${method}${path.replace(/[^A-Za-z0-9]+/g, '_')}`,
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? '',
        tags: op.tags ?? [],
        parameters,
        requestBody,
        responseContentType,
        responseSchema,
      });
    }
  }
  return ops;
}
