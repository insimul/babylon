// gdscript-emitter.test.ts — unit tests for the GDScript emitter (US-CG3 AC3).
//
// Drives the emitter against a synthetic fixture schema exercising the shapes the
// real core schemas contain: a nested object (-> inner class), arrays, a string
// enum, and optional (non-required) fields. Asserts the emitted GDScript is
// structurally valid and reflects each shape correctly, and that emission is
// deterministic.

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/extensions -- .mjs codegen modules imported by the TS test
import { generateGdscriptFor } from '../emit-gdscript.mjs';
// eslint-disable-next-line import/extensions
import { collectSchemaKeys, structuralCheck } from '../gdscript-verify.mjs';

// A fixture def covering: nested object, arrays, enum, optionals, freeform + nullable objects.
const FIXTURE_DEF = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['alpha', 'beta', 'gamma'] },
    count: { type: 'integer' },
    ratio: { type: 'number' },
    active: { type: 'boolean' },
    tags: { type: 'array', items: {} },
    profile: {
      type: 'object',
      properties: {
        nickName: { type: 'string' },
        level: { type: 'integer' },
      },
      required: ['nickName'],
      additionalProperties: true,
    },
    metadata: { type: 'object', additionalProperties: true },
    maybe: {
      anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
    },
  },
  required: ['id', 'kind', 'count'],
  additionalProperties: true,
};

const source = generateGdscriptFor('Fixture', FIXTURE_DEF);

describe('gdscript emitter (fixture schema)', () => {
  it('passes the structural self-test with all schema keys present', () => {
    const jsonKeys = [...collectSchemaKeys(FIXTURE_DEF)];
    const { ok, errors } = structuralCheck(source, { className: 'InsimulFixture', jsonKeys });
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('emits a nested object as an inner class with camelCase keys mapped to snake_case vars', () => {
    expect(source).toContain('class Profile extends RefCounted:');
    expect(source).toContain('var nick_name: String = ""');
    // The top-level field references the inner class and round-trips via from_dict/to_dict.
    expect(source).toContain('var profile: Profile = null');
    expect(source).toContain('o.profile = Profile.from_dict(d["profile"])');
    expect(source).toContain('d["profile"] = profile.to_dict()');
  });

  it('emits a string enum as a value constant with from_dict validation', () => {
    expect(source).toContain('const KIND_VALUES := ["alpha", "beta", "gamma"]');
    expect(source).toContain('if not KIND_VALUES.has(o.kind):');
  });

  it('types arrays as Array and freeform objects as Dictionary; nullable objects stay untyped', () => {
    expect(source).toContain('var tags: Array = []');
    expect(source).toContain('var metadata: Dictionary = {}');
    expect(source).toContain('var maybe = {}'); // nullable -> untyped so `null` is assignable
  });

  it('distinguishes required from optional fields in _REQUIRED_KEYS', () => {
    expect(source).toContain('const _REQUIRED_KEYS := ["id", "kind", "count"]');
    // A non-required field is still a known key but not a required one.
    expect(source).toContain('"ratio"');
    expect(source).not.toContain('const _REQUIRED_KEYS := ["id", "kind", "count", "ratio"');
  });

  it('is deterministic (two emissions are byte-identical)', () => {
    expect(generateGdscriptFor('Fixture', FIXTURE_DEF)).toBe(source);
  });
});
