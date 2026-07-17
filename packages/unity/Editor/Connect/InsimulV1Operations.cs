// InsimulV1Operations.cs — the v1 operation table for the in-editor clients (US-UE1).
//
// The Unity mirror of packages/core/openapi/operations.json (generated from
// openapi/insimul-v1.yaml by `npm run codegen`) and its engine-agnostic sibling
// packages/core/src/editor/operations.ts. Every native engine's hand-written
// editor client declares the same {operationId -> method, path} table; the core
// conformance test (packages/core/src/editor/__tests__/operations.test.ts) pins
// the Godot table to the spec, and this C# table follows the same source of
// truth. Keep it in lock step: a spec change that regenerates operations.json
// must update this table too.
//
// Deliberately UnityEngine/UnityEditor-free so the pure session logic
// (InsimulEditorSession) is unit-testable headless against a mocked transport.

using System.Collections.Generic;

namespace Insimul.Editor.Connect
{
    /// <summary>One REST operation: the HTTP verb + path template keyed by its operationId.</summary>
    public readonly struct InsimulV1Operation
    {
        public readonly string OperationId;
        public readonly string Method;
        public readonly string Path;

        public InsimulV1Operation(string operationId, string method, string path)
        {
            OperationId = operationId;
            Method = method;
            Path = path;
        }

        public bool IsValid => !string.IsNullOrEmpty(OperationId);
    }

    /// <summary>
    /// The v1 operation table, mirroring <c>openapi/operations.json</c> verbatim on
    /// method + path. Keyed by operationId. Keep in sync with the generated file.
    /// </summary>
    public static class InsimulV1Operations
    {
        private static readonly Dictionary<string, InsimulV1Operation> Table =
            new Dictionary<string, InsimulV1Operation>
            {
                { "streamConversation", new InsimulV1Operation("streamConversation", "POST", "/api/conversation/stream") },
                { "streamConversationAudio", new InsimulV1Operation("streamConversationAudio", "POST", "/api/conversation/stream-audio") },
                { "endConversation", new InsimulV1Operation("endConversation", "POST", "/api/conversation/end") },
                { "healthCheck", new InsimulV1Operation("healthCheck", "GET", "/api/conversation/health") },
                { "listWorlds", new InsimulV1Operation("listWorlds", "GET", "/api/worlds") },
                { "getWorldDetail", new InsimulV1Operation("getWorldDetail", "POST", "/api/worlds/detail") },
                { "importWorld", new InsimulV1Operation("importWorld", "POST", "/api/generation/import") },
                { "startGenerationJob", new InsimulV1Operation("startGenerationJob", "POST", "/api/generation/jobs") },
                { "getGenerationJob", new InsimulV1Operation("getGenerationJob", "POST", "/api/generation/jobs/status") },
                { "streamGenerationJob", new InsimulV1Operation("streamGenerationJob", "POST", "/api/generation/jobs/events") },
                { "syncGenerationJob", new InsimulV1Operation("syncGenerationJob", "POST", "/api/generation/jobs/sync") },
            };

        /// <summary>
        /// The operations the editor panels actively invoke (US-UE1 health/verify;
        /// later stories extend this set as they wire in the World Browser,
        /// Generation Console, and Conversation Tester). Every id here MUST resolve.
        /// </summary>
        public static readonly IReadOnlyList<string> UsedOperationIds = new[]
        {
            "healthCheck",
            "listWorlds",
            "getWorldDetail",
            "importWorld",
            "startGenerationJob",
            "getGenerationJob",
            "streamGenerationJob",
            "syncGenerationJob",
            "streamConversation",
            "endConversation",
        };

        /// <summary>
        /// Resolve an operationId to its <see cref="InsimulV1Operation"/>. The returned
        /// struct's <see cref="InsimulV1Operation.IsValid"/> is false for an unknown id.
        /// </summary>
        public static InsimulV1Operation Resolve(string operationId)
        {
            return Table.TryGetValue(operationId, out var op) ? op : default;
        }
    }
}
