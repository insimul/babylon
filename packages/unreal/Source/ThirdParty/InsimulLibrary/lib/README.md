# InsimulLibrary — prebuilt native binaries

The platform binaries staged here are **build artifacts**, not checked into git.
They are copied from `insimul-native/dist/<platform>/` when the plugin is
packaged (see `packages/unreal/scripts/release/build-plugin-zip.mjs`) so that the
`ThirdParty/InsimulLibrary` module can link and stage them per `Target.Platform`:

```
lib/
  Mac/libinsimul.dylib      # dist/macos-arm64 or macos-x64
  Linux/libinsimul.so       # dist/linux-x64
  Win64/insimul.dll  insimul.lib   # dist/windows-x64
```

The stable public header — `../include/insimul.h` — **is** committed (it is the
ABI contract the C++ wrapper compiles against). The host-side wrapper unit tests
(`tools/verify-unreal/host-test`) link a locally built `libinsimul` directly from
an `insimul-native` checkout, so they do not depend on these staged binaries.
