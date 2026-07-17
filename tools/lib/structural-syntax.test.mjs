// Regression suite for the native-tree structural syntax scanner (US-EP3).
// Guards two things: (1) the lexer accepts the real committed corpus with ZERO
// false positives, and (2) it rejects each class of gross structural breakage.
import { describe, it, expect } from 'vitest';
import { scanText } from './structural-syntax.mjs';
import { run as runUnity, GATE as UNITY } from '../verify-unity/check.mjs';
import { run as runGodot, GATE as GODOT } from '../verify-godot/check.mjs';
import { run as runUnreal, GATE as UNREAL } from '../verify-unreal/check.mjs';

const ok = (src, lang) => expect(scanText(src, lang)).toEqual([]);
const bad = (src, lang) => expect(scanText(src, lang).length).toBeGreaterThan(0);

describe('scanText — accepts valid source', () => {
  it('C# interpolation, verbatim, char, nested braces', () => {
    ok('void f(){ var s=$"x={a+b} y={g("z")}"; var v=@"C:\\p"; char c=\'}\'; if(t){h();} }', 'cs');
  });
  it('C++ raw string with delimiter + char literal + array init', () => {
    ok('auto s = R"tok(a")b{[(unbalanced)tok"; char c = \'}\'; int x[3] = {1,2,3};', 'cpp');
  });
  it('GDScript triple-quoted string spanning braces + brackets', () => {
    ok('func f():\n\tvar s = """a { ( unbalanced """\n\tif x:\n\t\tprint([1, 2])', 'gd');
  });
});

describe('scanText — rejects gross breakage', () => {
  it('C# dropped closing brace', () => bad('void f(){ if(x){ y(); }', 'cs'));
  it('C# unterminated string', () => bad('var s = "hello;', 'cs'));
  it('C# stray closer', () => bad('void f(){ } }', 'cs'));
  it('C++ dropped paren', () => bad('int f(int a { return a; }', 'cpp'));
  it('C++ mismatched closer', () => bad('int a[ = ( };', 'cpp'));
  it('GDScript dropped bracket', () => bad('var a = [1, 2, 3', 'gd'));
  it('GDScript unterminated string', () => bad('var s = "oops', 'gd'));
});

describe('committed corpus is structurally sound (no false positives)', () => {
  for (const [name, run] of [['unity', runUnity], ['godot', runGodot], ['unreal', runUnreal]]) {
    it(`${name} gate green`, () => {
      const res = run();
      // Surface offending files in the assertion message if this ever regresses.
      expect(res.failures.map((f) => f.file)).toEqual([]);
      expect(res.ok).toBe(true);
      expect(res.scanned).toBeGreaterThan(0);
    });
  }
  it('gates cover the expected extensions', () => {
    expect(UNITY.exts).toContain('.cs');
    expect(GODOT.exts).toContain('.gd');
    expect(UNREAL.exts).toEqual(expect.arrayContaining(['.h', '.cpp']));
  });
});
