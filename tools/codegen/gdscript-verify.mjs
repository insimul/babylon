// gdscript-verify.mjs — structural validation for generated GDScript.
//
// No `godot` binary is available in this harness, so the primary syntax gate is a
// structural self-test (per the US-CG3 fallback): balanced brackets, tab-only
// indentation, the expected `class_name`, from_dict/to_dict presence, and that
// every source-schema field key appears in the emitted script. The verify runner
// (verify-gdscript/run.mjs) prefers a real `godot --headless --check-only` when a
// binary IS on PATH and uses this as the fallback; the fixture unit test reuses
// `structuralCheck` directly on emitter output.

/**
 * Strip `#` comments and the CONTENTS of string literals so bracket-balance and
 * indentation checks don't trip over `[`/`{`/`(` that live inside text.
 * @param {string} source
 * @returns {string}
 */
export function stripCommentsAndStrings(source) {
  const out = [];
  for (const rawLine of source.split('\n')) {
    let line = '';
    let quote = null; // active string delimiter, or null
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (quote) {
        if (ch === '\\') {
          i++; // skip the escaped char
          continue;
        }
        if (ch === quote) quote = null;
        continue; // drop string contents
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '#') break; // rest of line is a comment
      line += ch;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Recursively collect every property key declared anywhere in a JSON Schema node. */
export function collectSchemaKeys(schema, acc = new Set()) {
  if (!schema || typeof schema !== 'object') return acc;
  if (schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      acc.add(key);
      collectSchemaKeys(sub, acc);
    }
  }
  if (schema.items) collectSchemaKeys(schema.items, acc);
  if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((s) => collectSchemaKeys(s, acc));
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    collectSchemaKeys(schema.additionalProperties, acc);
  }
  return acc;
}

/**
 * Structurally validate a generated GDScript source string.
 * @param {string} source
 * @param {{className?: string, jsonKeys?: string[]}} [opts]
 * @returns {{ok: boolean, errors: string[]}}
 */
export function structuralCheck(source, opts = {}) {
  const errors = [];
  const code = stripCommentsAndStrings(source);

  // 1. Balanced brackets (outside strings/comments).
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const opens = new Set(['(', '[', '{']);
  const stack = [];
  for (const ch of code) {
    if (opens.has(ch)) stack.push(ch);
    else if (pairs[ch]) {
      if (stack.pop() !== pairs[ch]) {
        errors.push(`unbalanced bracket: stray '${ch}'`);
        break;
      }
    }
  }
  if (stack.length) errors.push(`unbalanced bracket: ${stack.length} unclosed '${stack.join('')}'`);

  // 2. Tab-only indentation — a GDScript block indented with spaces is a parse error.
  source.split('\n').forEach((line, i) => {
    if (/^ +\S/.test(line)) errors.push(`line ${i + 1} is space-indented (GDScript requires tabs)`);
  });

  // 3. Required structural members.
  if (opts.className && !new RegExp(`(^|\\n)class_name ${opts.className}(\\s|$)`).test(source)) {
    errors.push(`missing 'class_name ${opts.className}'`);
  }
  if (!/static func from_dict\(/.test(source)) errors.push("missing 'static func from_dict('");
  if (!/func to_dict\(/.test(source)) errors.push("missing 'func to_dict('");

  // 4. Every schema field key must be present in the emitted script.
  for (const key of opts.jsonKeys ?? []) {
    if (!source.includes(`"${key}"`)) errors.push(`schema field '${key}' not present in output`);
  }

  return { ok: errors.length === 0, errors };
}
