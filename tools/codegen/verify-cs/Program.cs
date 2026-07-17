// Program.cs — minimal compile/roundtrip check for the generated Insimul DTOs.
// Compiled together with packages/unity/Runtime/Generated/*.cs (see the .csproj).
// This is a PURE DTO check: no Unity, no network — just prove the generated types
// build and roundtrip through System.Text.Json.

using System;
using System.Collections.Generic;
using System.Text.Json;
using Insimul.Generated;

internal static class Program
{
    private static int Main()
    {
        // Construct one of each top-level generated type to prove the members exist.
        var envelope = new SaveFileEnvelope
        {
            Format = Format.InsimulSaveV2,
            ExportedAt = "2026-01-01T00:00:00Z",
            InsimulVersion = "0.1.0",
            Integrity = "sha256:deadbeef",
            SaveFile = new SaveFile
            {
                Id = "save-1",
                SlotIndex = 0,
                UserId = "user-1",
                WorldId = "world-1",
                Name = "Test Save",
                Version = 2,
                Status = Status.Active,
                CreatedAt = "2026-01-01T00:00:00Z",
                LastSavedAt = "2026-01-01T00:00:00Z",
                TotalPlaytime = 12.5,
                SaveCount = 3,
                Conversations = Array.Empty<object>(),
                WorldSnapshot = new WorldSnapshot
                {
                    World = new World { Id = "world-1", Name = "Test World" },
                },
                CurrentState = new CurrentState
                {
                    Player = new Dictionary<string, object>(),
                    Quests = new Dictionary<string, object>(),
                    Npcs = new Dictionary<string, object>(),
                    LanguageProgress = new Dictionary<string, object>(),
                    PrologFacts = Array.Empty<object>(),
                    Extensions = new Dictionary<string, object>(),
                },
            },
        };

        var worldIr = new WorldIr
        {
            Meta = new Meta
            {
                InsimulVersion = "0.1.0",
                WorldId = "world-1",
                WorldName = "Test World",
                WorldType = "fantasy",
                ExportTimestamp = "2026-01-01T00:00:00Z",
                ExportVersion = 1,
                Seed = "seed-1",
            },
        };

        // Roundtrip the bundle through the generated helpers (InsimulSchemas is the
        // single top-level type quicktype emits FromJson/ToJson for).
        var bundle = new InsimulSchemas
        {
            SaveFile = envelope.SaveFile,
            SaveFileEnvelope = envelope,
            WorldIr = worldIr,
        };
        string bundleJson = bundle.ToJson();
        InsimulSchemas back = InsimulSchemas.FromJson(bundleJson);

        // Individual DTOs roundtrip via the shared serializer settings.
        string envelopeJson = JsonSerializer.Serialize(envelope, Converter.Settings);
        SaveFileEnvelope envBack =
            JsonSerializer.Deserialize<SaveFileEnvelope>(envelopeJson, Converter.Settings)!;

        Console.WriteLine(
            $"OK: envelope={envBack.Format} save={back.SaveFileEnvelope.SaveFile.Id} "
            + $"world={back.WorldIr.Meta.WorldName} bundleBytes={bundleJson.Length}");
        return 0;
    }
}
