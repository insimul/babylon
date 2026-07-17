// InsimulSaveSlotModel.cs — save / load slot view-model (US-UU5).
//
// The Unity mirror of the engine-neutral save/load slot contract
// (packages/core/src/ui/save-slot-model.ts + the Godot save_slot_model.gd). A save
// slot is loaded by the codec (the InsimulSaveSystem envelope validator here, the
// platform on Babylon) into an OUTCOME — empty, ok (+ a summary), or one of the
// envelope validation failures. This model turns each outcome into a display row
// (status + title + user message + load/save affordances), so the integrity-failure
// MESSAGING is a shared, cross-engine contract rather than per-UI copy.
//
// The shared cases live in packages/core/conformance/ui/save-slot-cases.json. The
// ClassifyEnvelope helper additionally runs the REAL SHA-256 integrity chain (via
// InsimulSaveSystem.ValidateEnvelope) and maps its verdict to an outcome — so the
// corrupted-envelope path is proven end-to-end while the outcome→view matrix stays
// shared. The EnvelopeValidation error codes (invalid_format / missing_save_file /
// integrity_mismatch) line up 1:1 with the slot outcomes on purpose.
//
// UnityEngine-FREE so it host-tests on a bare .NET SDK (tools/verify-unity). The thin
// UGUI views (InsimulSaveLoadPanel / InsimulMainMenu, structural-gate-only) reflect
// Slots()/HasAnyLoadable() into widgets.

using System.Collections.Generic;

namespace Insimul.UI
{
    /// <summary>Present-only summary shown on a healthy slot. Null fields are omitted
    /// from the rendered title.</summary>
    public sealed class SlotSummary
    {
        public string PlayerName;
        public bool HasLevel;
        public int Level;
        public string LocationName;
        public bool HasGold;
        public int Gold;
        public string SavedAt;
    }

    /// <summary>What the codec reports for one slot index: empty | ok | invalid_format |
    /// missing_save_file | integrity_mismatch (+ an optional summary on ok).</summary>
    public sealed class SlotLoadResult
    {
        public int Index;
        public string Outcome = "empty";
        public SlotSummary Summary;

        public SlotLoadResult() { }

        public SlotLoadResult(int index, string outcome, SlotSummary summary = null)
        {
            Index = index;
            Outcome = outcome ?? "empty";
            Summary = summary;
        }
    }

    /// <summary>A rendered slot row the panel binds to.</summary>
    public sealed class SlotView
    {
        public int Index;
        /// <summary>empty | ok | corrupted.</summary>
        public string Status = string.Empty;
        public string Title = string.Empty;
        public string Message = string.Empty;
        public bool CanLoad;
        public bool CanSave;
        public SlotSummary Summary;
    }

    /// <summary>Save / load slot view-model. Pure; no Unity types.</summary>
    public sealed class InsimulSaveSlotModel
    {
        /// <summary>Human, cross-engine messaging for each non-ok outcome. Keep in
        /// lockstep with SLOT_MESSAGES (TS) / MESSAGES (GDScript).</summary>
        public static readonly IReadOnlyDictionary<string, string> Messages =
            new Dictionary<string, string>
            {
                ["empty"] = "",
                ["ok"] = "",
                ["invalid_format"] = "Unrecognized save format — this slot cannot be loaded.",
                ["missing_save_file"] = "Save data is missing or unreadable.",
                ["integrity_mismatch"] = "Save file integrity check failed — file may be corrupted or tampered.",
            };

        private readonly List<SlotLoadResult> _results = new List<SlotLoadResult>();

        public InsimulSaveSlotModel(IEnumerable<SlotLoadResult> results = null)
        {
            SetSlots(results);
        }

        public void SetSlots(IEnumerable<SlotLoadResult> results)
        {
            _results.Clear();
            if (results == null) return;
            foreach (SlotLoadResult r in results)
                _results.Add(new SlotLoadResult(r.Index, r.Outcome, r.Summary));
        }

        private static string SummaryTitle(int index, SlotSummary s)
        {
            if (s == null) return $"Slot {index + 1}";
            var bits = new List<string>();
            if (!string.IsNullOrEmpty(s.PlayerName)) bits.Add(s.PlayerName);
            if (s.HasLevel) bits.Add($"Lv {s.Level}");
            if (!string.IsNullOrEmpty(s.LocationName)) bits.Add(s.LocationName);
            return bits.Count > 0 ? string.Join(" · ", bits) : $"Slot {index + 1}";
        }

        private static SlotView View(SlotLoadResult r)
        {
            if (r.Outcome == "empty")
                return new SlotView { Index = r.Index, Status = "empty", Title = "Empty Slot", Message = "", CanLoad = false, CanSave = true };
            if (r.Outcome == "ok")
                return new SlotView
                {
                    Index = r.Index,
                    Status = "ok",
                    Title = SummaryTitle(r.Index, r.Summary),
                    Message = (r.Summary != null && !string.IsNullOrEmpty(r.Summary.SavedAt)) ? $"Saved {r.Summary.SavedAt}" : "",
                    CanLoad = true,
                    CanSave = true,
                    Summary = r.Summary,
                };
            // Any validation failure -> corrupted. Cannot load, but can overwrite.
            return new SlotView
            {
                Index = r.Index,
                Status = "corrupted",
                Title = "Corrupted Save",
                Message = Messages.TryGetValue(r.Outcome, out var m) ? m : "",
                CanLoad = false,
                CanSave = true,
            };
        }

        /// <summary>The rendered rows, in slot-index order.</summary>
        public List<SlotView> Slots()
        {
            var sorted = new List<SlotLoadResult>(_results);
            sorted.Sort((a, b) => a.Index.CompareTo(b.Index));
            var outList = new List<SlotView>();
            foreach (SlotLoadResult r in sorted) outList.Add(View(r));
            return outList;
        }

        public SlotView Slot(int index)
        {
            foreach (SlotLoadResult r in _results)
                if (r.Index == index) return View(r);
            return null;
        }

        /// <summary>True when any slot is loadable — the main-menu Continue gate.</summary>
        public bool HasAnyLoadable()
        {
            foreach (SlotLoadResult r in _results)
                if (r.Outcome == "ok") return true;
            return false;
        }

        /// <summary>Run the REAL envelope validator over a loaded slot candidate and map
        /// its verdict to a <see cref="SlotLoadResult"/>. A null/empty candidate = empty
        /// slot. This is the corrupted-envelope integrity chain (SHA-256) end-to-end;
        /// the outcome→view matrix stays shared with the corpus.</summary>
        public static SlotLoadResult ClassifyEnvelope(
            int index, string envelopeJson, SlotSummary summary = null)
        {
            if (string.IsNullOrEmpty(envelopeJson))
                return new SlotLoadResult(index, "empty");
            Insimul.Save.EnvelopeValidation res = Insimul.Save.InsimulSaveSystem.ValidateEnvelope(envelopeJson);
            return res.Ok
                ? new SlotLoadResult(index, "ok", summary)
                : new SlotLoadResult(index, res.Code);
        }
    }
}
