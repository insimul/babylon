// PersistentDataSaveStore.cs — the thin Unity adapter over InsimulSaveSystem
// for local slot management + optional server sync (US-UC2).
//
// All portable logic (canonical JSON, SHA-256 integrity, migration,
// snapshot/restore, envelope build+validate) lives in InsimulSaveSystem.cs
// (UnityEngine-free, host-tested by tools/verify-unity). This file adds ONLY the
// platform glue: envelope files under Application.persistentDataPath and an
// optional server-sync seam. It holds no save-format logic of its own so the
// two runtimes can never diverge.
//
// It is UnityEngine-coupled, so it is covered by the C# STRUCTURAL syntax gate
// only (no editor/SDK in this harness); the save contract is proven on the pure
// core.

using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Insimul.Save
{
    /// <summary>Optional server-sync seam. The v1 saves API client is not part of
    /// the currently-generated OpenAPI surface (only the conversation endpoints
    /// are emitted), so a game wires its own uploader/downloader here. Envelopes
    /// are the wire format — build with <see cref="InsimulSaveSystem.BuildEnvelopeJson"/>,
    /// validate incoming ones with <see cref="InsimulSaveSystem.ValidateEnvelope"/>.</summary>
    public interface IInsimulSaveSync
    {
        /// <summary>Upload a save envelope for the given slot. Returns success.</summary>
        System.Threading.Tasks.Task<bool> UploadAsync(int slotIndex, string envelopeJson);

        /// <summary>Download the latest envelope for a slot, or null if none.</summary>
        System.Threading.Tasks.Task<string> DownloadAsync(int slotIndex);
    }

    /// <summary>
    /// Local slot store: reads/writes save envelopes as files under
    /// <c>Application.persistentDataPath/saves/slot-N.json</c>. Save writes the
    /// current <see cref="InsimulSaveSystem"/> as a canonical, integrity-stamped
    /// envelope; load verifies integrity (and migrates on the way in) before
    /// handing back a loaded system.
    /// </summary>
    public sealed class PersistentDataSaveStore
    {
        private readonly string _dir;
        private readonly string _insimulVersion;

        public PersistentDataSaveStore(string insimulVersion = "unknown", string subDir = "saves")
        {
            _insimulVersion = insimulVersion;
            _dir = Path.Combine(Application.persistentDataPath, subDir);
        }

        private string SlotPath(int slotIndex) => Path.Combine(_dir, $"slot-{slotIndex}.json");

        /// <summary>Slot indices with a save file present, ascending.</summary>
        public IReadOnlyList<int> ListSlots()
        {
            var slots = new List<int>();
            if (!Directory.Exists(_dir)) return slots;
            foreach (string path in Directory.GetFiles(_dir, "slot-*.json"))
            {
                string name = Path.GetFileNameWithoutExtension(path); // slot-N
                if (name.Length > 5 && int.TryParse(name.Substring(5), out int idx))
                    slots.Add(idx);
            }
            slots.Sort();
            return slots;
        }

        /// <summary>Whether a slot has a save file.</summary>
        public bool HasSlot(int slotIndex) => File.Exists(SlotPath(slotIndex));

        /// <summary>
        /// Write <paramref name="system"/> to <paramref name="slotIndex"/> as a
        /// canonical, integrity-stamped envelope (ISO-8601 exportedAt supplied by
        /// the caller so the write stays deterministic/testable). Bumps nothing on
        /// the save itself — call <see cref="InsimulSaveSystem.SnapshotFacts"/> and
        /// update currentState BEFORE saving.
        /// </summary>
        public void Save(int slotIndex, InsimulSaveSystem system, string exportedAt)
        {
            Directory.CreateDirectory(_dir);
            string envelope = system.BuildEnvelopeJson(_insimulVersion, exportedAt);
            // Atomic-ish write: temp then move, so a crash mid-write can't corrupt a slot.
            string path = SlotPath(slotIndex);
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, envelope);
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }

        /// <summary>
        /// Load slot <paramref name="slotIndex"/>: verify the envelope integrity,
        /// then Load (+migrate) its saveFile into a fresh system. Throws
        /// <see cref="SaveLoadException"/> on a missing slot or a failed integrity
        /// check.
        /// </summary>
        public InsimulSaveSystem Load(int slotIndex)
        {
            string path = SlotPath(slotIndex);
            if (!File.Exists(path))
                throw new SaveLoadException($"No save in slot {slotIndex} ({path}).");
            string envelope = File.ReadAllText(path);
            var validation = InsimulSaveSystem.ValidateEnvelope(envelope);
            if (!validation.Ok)
                throw new SaveLoadException($"Slot {slotIndex} envelope invalid: {validation.Message}");

            using var doc = System.Text.Json.JsonDocument.Parse(envelope);
            string saveFileJson = doc.RootElement.GetProperty("saveFile").GetRawText();
            var system = new InsimulSaveSystem();
            system.Load(saveFileJson);
            return system;
        }

        /// <summary>Delete a slot's save file. Returns true if one existed.</summary>
        public bool Delete(int slotIndex)
        {
            string path = SlotPath(slotIndex);
            if (!File.Exists(path)) return false;
            File.Delete(path);
            return true;
        }
    }
}
