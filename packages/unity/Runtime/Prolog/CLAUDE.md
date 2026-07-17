# Runtime/Prolog — the real native Prolog engine (agent notes)

`InsimulProlog.cs` + `NativeMethods.cs` are the C# wrapper over **libinsimul**
(P/Invoke), replacing the substring-matching fact-store stub. They are the
engine-agnostic core of the Unity native-Prolog work (US-UP1…UP4).

## Invariants

- **Zero `UnityEngine` references in this folder.** These files are pure C# so
  the dotnet verify project (`tools/verify-unity/`) compiles and runs them
  against a locally built libinsimul dylib with no Unity present. Enforced by
  eye + the `grep` in the story notes; keep it that way — any Unity glue goes in
  a sibling file outside `Runtime/Prolog/`.
- **The C ABI is poll-only** (no callbacks / function pointers): query results
  are pulled via `insimul_query_next`. This is deliberate — it means there is
  nothing to `[MonoPInvokeCallback]`, so the wrapper is IL2CPP-safe as written.
  If you ever add a callback-based ABI entry point you must revisit IL2CPP.
- **String ownership**: strings passed *in* use `UnmanagedType.LPUTF8Str` (the
  marshaler frees its temp buffer). Strings returned *out* are `IntPtr` + manual
  `Marshal.PtrToStringUTF8` — **the native library owns them**; never marshal a
  returned string as a `string` (the CLR would try to free native memory).
  Returned pointers are only valid until the next call on the same handle, so
  copy eagerly.
- **KB lifetime is a `SafeHandle`** (`KbHandle`): destroyed exactly once even
  under finalization. `Dispose()` is idempotent and **closes live query
  iterators before destroying the KB** (closing an iterator whose KB is already
  freed is a use-after-free). Every `Query` `MoveNext` re-checks disposal, so a
  query iterator used after `Dispose()` throws `ObjectDisposedException` instead
  of touching freed memory.
- **Thread affinity**: a KB is bound to its creating thread; every public method
  throws `InvalidOperationException` on cross-thread use. libinsimul is
  single-threaded per KB.

## Game adapter (US-UP4)

`PrologGameAdapter.cs` is the real-engine backing for the game template's Prolog
surface. It owns an `InsimulProlog` KB and exposes the game-facing methods
(`AssertFact`/`Query`/`QueryColumn`/`CanPerformAction`/quest checks/save
round-trip) with genuine unification, replacing the retired substring fact-store
stub (`templates/scripts/systems/PrologEngine.cs`, now a thin MonoBehaviour shell
that delegates here). Also UnityEngine-free, so `tools/verify-unity/` compiles
and tests it host-side. Key conventions:

- **Atom encoders are the single source of truth**: `Sanitize` / `Escape` /
  `NormalizeFact` are `public static` here and the shell calls straight through —
  do not re-implement them in the template.
- **Graceful degradation**: `Query` / `Holds` / `TryEvaluate` catch
  `InsimulPrologException` and treat it as "no solutions" (an undeclared
  predicate's existence_error). `TryEvaluate(goal, out undeclared)` exposes the
  distinction so callers can allow-by-default when a rule set was never loaded
  (e.g. `CanPerformAction`). **Assumption**: this relies on libinsimul raising on
  an unknown predicate (ISO `unknown=error`); if it silently fails instead, the
  "undeclared => allowed" adapter test flags it on CI.
- **`RetractAll(term)`** loops the native retract until nothing matches, so it
  removes ALL clauses unifying with a term-with-`_` regardless of whether the ABI
  retract is `retract/1` or `retractall/1`. Callers pass a well-formed term with
  anonymous vars for value positions (`personality(bob, _, _)`).
- Save: `SnapshotState()`/`RestoreState()` are the full-KB native round-trip;
  `GetPlayerFacts()`/`RestorePlayerFacts()` remain for the legacy `prologFacts`
  string-list save. See `templates/MIGRATION.md`.

## Version handshake (US-UP3)

`InsimulProlog` carries a `const ExpectedNativeSemver` (the ABI this wrapper was
authored against — keep it in lockstep with `insimul-native/VERSION`). The
comparison surface is **pure and stamp-driven** so the mismatch path is unit
tested with mocked versions (no native lib): `ParseSemver(string)` →
`Semver`, `CheckNativeVersion(actualStamp, expectedStamp)` → `NativeVersionCheck`
(compatibility keys on MAJOR.MINOR; a differing PATCH is compatible), and
`VerifyNativeVersion()` which reads the loaded library and **throws
`InsimulPrologException` loudly on drift**. `packages/unity/scripts/fetch-native.sh`
greps `ExpectedNativeSemver` out of this file to cross-check the fetched
`dist/VERSION` — if you bump the constant, the fetch drift check follows
automatically. Binaries + import settings live under `Runtime/Plugins/` (fetched,
not committed; see its README).

## Gotcha: System.Text.Json in the Unity asmdef

`InsimulProlog.cs` uses `System.Text.Json` (`JsonElement`, `JsonDocument`).
`net8`/the dotnet verify project gets this for free, but the **Unity `asmdef`
(`Insimul.Runtime`) needs `System.Text.Json.dll` (+ its transitive deps) dropped
into a `Plugins/` folder** to compile in-editor. That DLL is a human drop-in
(cannot be produced in this harness) and is documented for US-UP3
(`Runtime/Plugins/README.md`). Until it is present the asmdef will not compile
in-editor, but the logic is fully verified host-side via `tools/verify-unity/`.

## The native ABI (mirror of insimul-native/include/insimul.h)

`insimul-native` (from libinsimul-bootstrap) is not vendored into this repo;
`NativeMethods.cs` is the C# mirror of its C ABI. If the header's signatures
change, update `NativeMethods.cs` to match. Current surface:

| C entry point          | purpose                                             |
|------------------------|-----------------------------------------------------|
| `insimul_version`      | library-owned semver string                         |
| `insimul_kb_create/_destroy` | KB lifecycle (owned by `KbHandle`)            |
| `insimul_consult`      | load a program (facts + rules)                      |
| `insimul_assert/_retract` | add / remove a clause (retract may bind vars)    |
| `insimul_query` / `_query_next` / `_query_close` | poll-only solution iterator |
| `insimul_snapshot/_restore` | serialize / restore full KB state              |
| `insimul_last_error`   | diagnostic for the most recent failed call          |
