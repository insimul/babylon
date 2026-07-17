# Runtime/Plugins — native libinsimul binaries

The real Prolog engine (`Runtime/Prolog/InsimulProlog.cs`) P/Invokes the native
**libinsimul** library. Those binaries are **fetched, not committed** (see
`.gitignore`): run the fetch script to populate this folder from a local
`insimul-native` build or a release archive.

```bash
# from a local insimul-native build (../insimul-native/dist by default)
packages/unity/scripts/fetch-native.sh
# explicit dist root
packages/unity/scripts/fetch-native.sh --dist /path/to/insimul-native/dist
# from a release archive
packages/unity/scripts/fetch-native.sh --url https://…/insimul-native-dist.tar.gz
```

## Folder layout → Unity import settings

`fetch-native.sh` drops each platform's library into the folder the
`Editor/InsimulNativeImporter.cs` post-processor keys its `PluginImporter`
settings off of. Because the binaries are fetched, their `.meta` files can't be
hand-authored ahead of time — the importer derives the settings from the folder
on first import (or via **Insimul > Reimport Native Plugins**).

| Folder                          | File                | Platform             | CPU     | Editor |
|---------------------------------|---------------------|----------------------|---------|--------|
| `macOS/`                        | `libinsimul.dylib`  | Standalone macOS     | x64+ARM64 (universal2) | ✔ on macOS |
| `Windows/x86_64/`               | `insimul.dll`       | Standalone Windows64 | x86_64  | ✔ on Windows |
| `Windows/arm64/`                | `insimul.dll`       | Standalone Windows64 | ARM64   | — |
| `Linux/x86_64/`                 | `libinsimul.so`     | Standalone Linux64   | x86_64  | ✔ on Linux |
| `Linux/arm64/`                  | `libinsimul.so`     | Standalone Linux64   | ARM64   | — |

- **macOS is a single universal2 dylib** (`lipo`-combined x86_64 + arm64) — Unity
  prefers one fat binary for the macOS plugin. If only one arch was built, the
  fetch script ships that slice as-is.
- **Editor compatibility** is enabled only for the binary matching the host
  editor OS/CPU, so the same library loads in-editor for the EditMode conformance
  tests (`Tests/Editor/`).
- The `DllImport` base name is **`insimul`** (`NativeMethods.Lib`). The loader
  resolves it to `libinsimul.dylib` / `insimul.dll` / `libinsimul.so`. Keep the
  file names above in sync with that base name.

## Version handshake

The C# wrapper (`NativeMethods.cs`) is a hand-maintained mirror of the libinsimul
C ABI, so a mismatched binary can silently corrupt marshaling.
`InsimulProlog.ExpectedNativeSemver` records the ABI this wrapper was built
against, and `InsimulProlog.VerifyNativeVersion()` throws
`InsimulPrologException` on a MAJOR.MINOR mismatch (a differing PATCH is
compatible). Call it once at startup to fail loudly:

```csharp
var check = InsimulProlog.VerifyNativeVersion(); // throws on ABI drift
Debug.Log(check.Message);
```

`fetch-native.sh` cross-checks the fetched `dist/VERSION` against
`ExpectedNativeSemver` (grepped straight out of `InsimulProlog.cs`) and **warns
loudly** on drift, so mismatches surface at fetch time too.

## IL2CPP notes

- The C ABI is **poll-only** (`insimul_query_next`) — no callbacks / function
  pointers cross the boundary, so there is nothing to `[MonoPInvokeCallback]`.
  The wrapper is IL2CPP-safe as written; if a callback-based entry point is ever
  added, revisit this.
- Keep the `DllImport` base name a **compile-time constant** (`NativeMethods.Lib`)
  — IL2CPP resolves native entry points at build time.
- `System.Text.Json.dll` (+ its transitive deps) must be dropped into a `Plugins/`
  folder for the `Insimul.Runtime` asmdef to compile in-editor and for IL2CPP
  builds to link it — see `Runtime/Prolog/CLAUDE.md`. It is a human drop-in
  (not fetched by this script).
