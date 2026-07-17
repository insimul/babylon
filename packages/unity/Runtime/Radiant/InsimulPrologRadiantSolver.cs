// InsimulPrologRadiantSolver — the native-engine backing for the radiant engine
// (US-UC4). Wraps an InsimulProlog session so InsimulRadiantEngine.Generate solves
// preconditions / exclusions / cooldowns against the REAL libinsimul KB (the same
// engine the Prolog conformance corpus runs through).
//
// The caller consults the program (kb ⧺ templates) into the session, then hands
// the session to Generate via this adapter. UnityEngine-free (System.* only) so it
// host-tests under tools/verify-unity alongside the corpus runner.

using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Insimul.Prolog;

namespace Insimul.Radiant
{
    /// <summary>An <see cref="IRadiantSolver"/> backed by a native <see cref="InsimulProlog"/>
    /// session. Does NOT own the session — the caller consults + disposes it.</summary>
    public sealed class InsimulPrologRadiantSolver : IRadiantSolver
    {
        private readonly InsimulProlog _kb;

        public InsimulPrologRadiantSolver(InsimulProlog kb)
        {
            _kb = kb ?? throw new System.ArgumentNullException(nameof(kb));
        }

        public IReadOnlyList<IReadOnlyDictionary<string, JsonElement>> SolveAll(string goal)
        {
            // Materialize eagerly — the engine's lazy iterator must not outlive this call.
            return _kb.Query(goal).ToList();
        }

        public bool Succeeds(string goal) => _kb.Holds(goal);
    }
}
