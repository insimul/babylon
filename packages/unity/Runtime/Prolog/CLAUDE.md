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
