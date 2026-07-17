# packages/unity/Runtime/Generated/Api — generated REST client

`InsimulApiClient.cs` is **generated** by `npm run codegen` from the vendored
OpenAPI spec (`packages/core/openapi/insimul-v1.yaml`, a mirror of the platform's
`insimul-platform/openapi/insimul-v1.yaml`). **Do not edit it by hand** — a vitest
drift guard regenerates it into a temp dir and fails on any diff.

## Transport-agnostic by design

The client targets **`System.Net.Http`** (`HttpClient`), not
`UnityEngine.Networking.UnityWebRequest`, so it is engine-neutral and compile-checks
on a stock .NET SDK (`npm run codegen:verify-cs`).

The Unity plugin **adapts transport at the boundary**: `InsimulHttpClient.cs`
(hand-written, Unity `UnityWebRequest` + coroutines + SSE parsing) remains the live
runtime path today. The generated `System.Net.Http` client is the codegen-owned
contract surface that a future async/HttpClient-based Unity transport can consume
directly, and it documents the exact operation set the hand-written client mirrors.

- **JSON operations** (`EndConversationAsync`, `HealthCheckAsync`) deserialize the
  response into the generated model type.
- **Streaming operations** (`StreamConversationAsync`, `StreamConversationAudioAsync`)
  return the raw `HttpResponseMessage` (`HttpCompletionOption.ResponseHeadersRead`) so
  the caller reads the `text/event-stream` (SSE) frames itself.

## Machine-readable operation table

The C++ (Unreal) and GDScript (Godot) HTTP wrappers stay hand-written thin (per the
platform-split plan §3.2). They check themselves against
`packages/core/openapi/operations.json` — the machine-readable operation table
(`operationId` / `method` / `path` / params) emitted from the same spec, so all
three engines stay pinned to one operation set.

## Regenerating

1. If the platform spec changed: `npm run openapi:sync -- --write` (needs the
   platform checkout) to refresh the vendored copy.
2. `npm run codegen` at the runtime root; commit the regenerated `Api/` +
   `operations.json`.
3. `npm test` (drift guard) and `npm run codegen:verify-cs` (needs a .NET SDK).
