// emit-gdscript.mjs — emit GDScript (Godot 4) DTOs for the core save/world schemas.
//
// Target: packages/godot/addons/insimul/generated/Insimul{SaveFile,SaveFileEnvelope,WorldIR}.gd
//
// quicktype has NO GDScript target, so this is a small hand-rolled emitter that
// walks the SAME merged JSON Schema document the C#/C++ generators use
// (build-merged-schema.mjs) and emits, per top-level schema, one Godot 4 script:
//   - `class_name Insimul<Name>` extending RefCounted,
//   - typed member vars (snake_case; nested objects become inner classes,
//     freeform objects -> Dictionary, arrays -> Array),
//   - `static func from_dict(d: Dictionary)` with per-field validation
//     (push_warning on a missing required field, an unknown field, or an invalid
//     enum value),
//   - `func to_dict() -> Dictionary`.
//
// Determinism: output is a pure function of the committed core schemas — property
// order follows the schema, inner-class names are derived from property keys, and
// there are no timestamps. The drift guard diffs the committed .gd byte-for-byte.
//
// A `$ref` to another top-level definition (the envelope's `saveFile` -> SaveFile)
// is emitted as a reference to that definition's global class (`InsimulSaveFile`),
// which resolves through Godot's class_name registry across files.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMergedSchema } from './build-merged-schema.mjs';

const OUT_REL_DIR = join('packages', 'godot', 'addons', 'insimul', 'generated');

// The three top-level definitions to emit (name in the merged schema -> class_name).
const TOP_LEVEL = ['SaveFile', 'SaveFileEnvelope', 'WorldIR'];

const BANNER = [
  '# -----------------------------------------------------------------------------',
  '# GENERATED FILE — DO NOT EDIT BY HAND.',
  '#   Regenerate with:  npm run codegen   (from the insimul-runtime root)',
  '#   Source of truth:  packages/core/schemas/{save-file,save-envelope,world-ir}.schema.json',
  '#   Emitter:          tools/codegen/emit-gdscript.mjs (Godot 4 GDScript)',
  '#',
  '#   These mirror the core save/world JSON contract for the Godot SDK. Freeform',
  '#   sub-objects (additionalProperties) are typed as Dictionary; opaque lists as',
  '#   Array. See generated/README.md for the hand-written boundary convention.',
  '# -----------------------------------------------------------------------------',
  '',
].join('\n');

/** camelCase / PascalCase -> snake_case for GDScript member names. */
function snakeCase(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/** camelCase / snake_case -> PascalCase for inner-class names. */
function pascalCase(s) {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

const GD_LITERAL = (v) => JSON.stringify(v); // strings/numbers -> valid GDScript literals

/**
 * Resolve a property schema to a GDScript field descriptor, registering an inner
 * class when the property is an object with its own declared properties.
 *
 * @returns {{kind:string, gdType:string|null, defaultExpr:string, nullable:boolean, values?:string[]}}
 */
function resolveField(schema, nameHint, registerInner) {
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return { kind: 'ref', gdType: `Insimul${refName}`, defaultExpr: 'null', nullable: true };
  }
  if (Array.isArray(schema.anyOf)) {
    const nonNull = schema.anyOf.find((s) => s.type !== 'null') ?? schema.anyOf[0];
    const inner = resolveField(nonNull, nameHint, registerInner);
    return { ...inner, nullable: true };
  }
  switch (schema.type) {
    case 'string':
      if (Array.isArray(schema.enum)) {
        return { kind: 'enum', gdType: 'String', defaultExpr: '""', nullable: false, values: schema.enum };
      }
      return { kind: 'string', gdType: 'String', defaultExpr: '""', nullable: false };
    case 'integer':
      return { kind: 'int', gdType: 'int', defaultExpr: '0', nullable: false };
    case 'number':
      return { kind: 'float', gdType: 'float', defaultExpr: '0.0', nullable: false };
    case 'boolean':
      return { kind: 'bool', gdType: 'bool', defaultExpr: 'false', nullable: false };
    case 'array':
      return { kind: 'array', gdType: 'Array', defaultExpr: '[]', nullable: false };
    case 'object': {
      const hasProps = schema.properties && Object.keys(schema.properties).length > 0;
      if (hasProps) {
        const innerName = registerInner(nameHint, schema);
        return { kind: 'inner', gdType: innerName, defaultExpr: 'null', nullable: true };
      }
      return { kind: 'dict', gdType: 'Dictionary', defaultExpr: '{}', nullable: false };
    }
    default:
      return { kind: 'variant', gdType: null, defaultExpr: 'null', nullable: true };
  }
}

/** Build the ordered field list for a class body, registering inner classes as needed. */
function buildFields(schema, registerInner) {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([jsonKey, propSchema]) => ({
    jsonKey,
    varName: snakeCase(jsonKey),
    required: required.has(jsonKey),
    ...resolveField(propSchema, jsonKey, registerInner),
    enumConst: `${snakeCase(jsonKey).toUpperCase()}_VALUES`,
  }));
}

/** Indent a block of `lines` by `depth` tabs (blank lines stay empty). */
function indent(lines, depth) {
  const pad = '\t'.repeat(depth);
  return lines.map((l) => (l.length ? pad + l : l));
}

/** Render one class body (const/var/from_dict/to_dict) as lines at indent 0. */
function renderClassBody(className, fields) {
  const lines = [];

  // Enum value constants (one per enum field).
  for (const f of fields) {
    if (f.kind === 'enum') {
      lines.push(`const ${f.enumConst} := [${f.values.map((v) => GD_LITERAL(v)).join(', ')}]`);
    }
  }
  lines.push(`const _KNOWN_KEYS := [${fields.map((f) => GD_LITERAL(f.jsonKey)).join(', ')}]`);
  const requiredKeys = fields.filter((f) => f.required).map((f) => GD_LITERAL(f.jsonKey));
  lines.push(`const _REQUIRED_KEYS := [${requiredKeys.join(', ')}]`);
  lines.push('');

  // Member vars. Object types (inner classes / cross-file refs) accept `null`, so
  // they stay typed; a `Variant` field, or a nullable primitive/array/dict (whose
  // typed form cannot hold `null` in Godot 4), is emitted untyped.
  for (const f of fields) {
    const objectKind = f.kind === 'inner' || f.kind === 'ref';
    if (f.gdType === null || (f.nullable && !objectKind)) {
      lines.push(`var ${f.varName} = ${f.defaultExpr}`);
    } else {
      lines.push(`var ${f.varName}: ${f.gdType} = ${f.defaultExpr}`);
    }
  }
  lines.push('');

  // from_dict.
  lines.push(`static func from_dict(d: Dictionary) -> ${className}:`);
  lines.push(`\tvar o := ${className}.new()`);
  lines.push('\tif typeof(d) != TYPE_DICTIONARY:');
  lines.push(`\t\tpush_warning("${className}.from_dict: expected Dictionary")`);
  lines.push('\t\treturn o');
  lines.push('\tfor __key in _REQUIRED_KEYS:');
  lines.push('\t\tif not d.has(__key):');
  lines.push(`\t\t\tpush_warning("${className}.from_dict: missing required field '" + str(__key) + "'")`);
  lines.push('\tfor __key in d.keys():');
  lines.push('\t\tif not _KNOWN_KEYS.has(__key):');
  lines.push(`\t\t\tpush_warning("${className}.from_dict: unknown field '" + str(__key) + "'")`);
  for (const f of fields) {
    lines.push(`\tif d.has(${GD_LITERAL(f.jsonKey)}):`);
    for (const l of assignFromDict(f, className)) lines.push('\t\t' + l);
  }
  lines.push('\treturn o');
  lines.push('');

  // to_dict.
  lines.push('func to_dict() -> Dictionary:');
  lines.push('\tvar d := {}');
  for (const f of fields) {
    for (const l of assignToDict(f)) lines.push('\t' + l);
  }
  lines.push('\treturn d');

  return lines;
}

/** Lines that assign field `f` from `d[jsonKey]` into `o.<var>` (indent handled by caller). */
function assignFromDict(f, className) {
  const src = `d[${GD_LITERAL(f.jsonKey)}]`;
  switch (f.kind) {
    case 'string':
      return [`o.${f.varName} = str(${src})`];
    case 'enum':
      return [
        `o.${f.varName} = str(${src})`,
        `if not ${f.enumConst}.has(o.${f.varName}):`,
        `\tpush_warning("${className}.from_dict: field '${f.jsonKey}' has invalid value '" + o.${f.varName} + "'")`,
      ];
    case 'int':
      return [`o.${f.varName} = int(${src})`];
    case 'float':
      return [`o.${f.varName} = float(${src})`];
    case 'bool':
      return [`o.${f.varName} = bool(${src})`];
    case 'inner':
    case 'ref':
      return [`if ${src} != null:`, `\to.${f.varName} = ${f.gdType}.from_dict(${src})`];
    default: // array, dict, variant, nullable passthrough
      return [`o.${f.varName} = ${src}`];
  }
}

/** Lines that write field `f` into `d[jsonKey]` for to_dict (indent handled by caller). */
function assignToDict(f) {
  if (f.kind === 'inner' || f.kind === 'ref') {
    return [`if ${f.varName} != null:`, `\td[${GD_LITERAL(f.jsonKey)}] = ${f.varName}.to_dict()`];
  }
  return [`d[${GD_LITERAL(f.jsonKey)}] = ${f.varName}`];
}

/**
 * Generate the GDScript source for one top-level definition (deterministic; no I/O).
 * @returns {string}
 */
export function generateGdscriptFor(defName, def) {
  const className = `Insimul${defName}`;

  // Register inner classes on demand; children register after parents, so emitting
  // in reverse-registration order defines every referenced class before its user.
  const inner = []; // { name, schema }
  const nameBySchema = new Map();
  const usedNames = new Set([className]);
  function registerInner(nameHint, schema) {
    if (nameBySchema.has(schema)) return nameBySchema.get(schema);
    const base = pascalCase(nameHint) || 'Nested';
    let name = base;
    let n = 2;
    while (usedNames.has(name)) name = base + n++;
    usedNames.add(name);
    nameBySchema.set(schema, name);
    inner.push({ name, schema });
    return name;
  }

  const topFields = buildFields(def, registerInner);
  // buildFields on inner classes may grow `inner`; iterate by index.
  const innerFields = [];
  for (let i = 0; i < inner.length; i++) {
    innerFields.push({ name: inner[i].name, fields: buildFields(inner[i].schema, registerInner) });
  }

  const parts = [BANNER, `class_name ${className}`, 'extends RefCounted', ''];

  // Inner classes first (reverse registration order = children before parents).
  for (let i = innerFields.length - 1; i >= 0; i--) {
    const ic = innerFields[i];
    parts.push(`class ${ic.name} extends RefCounted:`);
    parts.push(...indent(renderClassBody(ic.name, ic.fields), 1));
    parts.push('');
  }

  parts.push(...renderClassBody(className, topFields));

  return parts.join('\n').replace(/\s*$/, '') + '\n';
}

/**
 * Write the GDScript DTOs under `baseDir` and return the written relative paths.
 * @param {string} baseDir
 * @returns {string[]}
 */
export function emitGdscript(baseDir) {
  const merged = buildMergedSchema();
  const outDir = join(baseDir, OUT_REL_DIR);
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const defName of TOP_LEVEL) {
    const def = merged.definitions[defName];
    const file = `Insimul${defName}.gd`;
    writeFileSync(join(outDir, file), generateGdscriptFor(defName, def));
    written.push(join(OUT_REL_DIR, file));
  }
  return written;
}
