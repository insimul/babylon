// InsimulProlog.cs — engine-agnostic C# wrapper over libinsimul.
//
// This is the REAL Prolog engine for the Unity SDK: a thin, safe façade over
// the native P/Invoke surface in NativeMethods.cs. It replaces the substring-
// matching fact-store stub (templates/scripts/systems/PrologEngine.cs, retired
// in US-UP4) with genuine unification via libinsimul.
//
// Deliberately UnityEngine-free: nothing in Runtime/Prolog/ references
// UnityEngine, so the dotnet verify project (tools/verify-unity/) can compile
// and exercise this code against a locally built libinsimul dylib with no
// Unity editor present. The only external dependency is System.Text.Json (a
// Plugins DLL is required for the Unity asmdef to compile in-editor — see
// Runtime/Prolog/CLAUDE.md).
//
// Threading: a KB is bound to the thread that created it. Every public method
// asserts thread affinity and throws InvalidOperationException on cross-thread
// use — libinsimul is single-threaded per KB and the poll-only iterator model
// has no safe interleaving story.

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Insimul.Prolog
{
    /// <summary>Raised for libinsimul-level failures (consult/assert/query errors, version mismatch).</summary>
    public sealed class InsimulPrologException : Exception
    {
        public InsimulPrologException(string message) : base(message) { }
        public InsimulPrologException(string message, Exception inner) : base(message, inner) { }
    }

    /// <summary>
    /// A real Prolog knowledge base backed by native libinsimul. Owns the KB
    /// lifetime via a SafeHandle; dispose it (or use a <c>using</c>) to release
    /// the native memory deterministically.
    /// </summary>
    public sealed class InsimulProlog : IDisposable
    {
        private readonly KbHandle _kb;
        private readonly int _ownerThreadId;

        // Live query iterators, tracked so Dispose can close them BEFORE the KB
        // is destroyed (closing an iterator whose KB is already freed would be a
        // use-after-free). Single-threaded by construction (thread affinity), so
        // no locking is required.
        private readonly HashSet<IntPtr> _liveQueries = new HashSet<IntPtr>();

        private bool _disposed;

        /// <summary>Creates a fresh, empty knowledge base bound to the current thread.</summary>
        public InsimulProlog()
        {
            _ownerThreadId = Environment.CurrentManagedThreadId;
            _kb = NativeMethods.insimul_kb_create();
            if (_kb == null || _kb.IsInvalid)
            {
                throw new InsimulPrologException(
                    "libinsimul: insimul_kb_create returned a null handle (is the native library loadable?).");
            }
        }

        /// <summary>
        /// The native library's semver string (e.g. "0.1.0"). Static because it
        /// is a property of the loaded library, not of any KB.
        /// </summary>
        public static string NativeVersion
        {
            get
            {
                IntPtr p = NativeMethods.insimul_version();
                string v = Marshal.PtrToStringUTF8(p);
                if (string.IsNullOrEmpty(v))
                {
                    throw new InsimulPrologException("libinsimul: insimul_version returned an empty string.");
                }
                return v;
            }
        }

        // --- Version handshake (US-UP3) --------------------------------------
        //
        // The C# wrapper (NativeMethods.cs) is a hand-maintained mirror of the
        // libinsimul C ABI, so a mismatched native binary can silently corrupt
        // marshaling. The handshake below turns that into a loud, early failure.
        //
        // ExpectedNativeSemver is the ABI this build of the wrapper was written
        // against — keep it in lockstep with insimul-native/VERSION (the fetch
        // script cross-checks the two). Compatibility is judged on MAJOR.MINOR
        // only: a differing PATCH is a bug-fix-compatible native build, but any
        // MAJOR or MINOR drift is treated as a breaking ABI change (this is the
        // pre-1.0 convention where MINOR is the breaking axis).

        /// <summary>The libinsimul ABI version this wrapper was authored against.</summary>
        public const string ExpectedNativeSemver = "0.1.0";

        /// <summary>A parsed semantic version (pre-release / build metadata are ignored).</summary>
        public readonly struct Semver
        {
            public Semver(int major, int minor, int patch)
            {
                Major = major;
                Minor = minor;
                Patch = patch;
            }

            public int Major { get; }
            public int Minor { get; }
            public int Patch { get; }

            public override string ToString() => $"{Major}.{Minor}.{Patch}";
        }

        /// <summary>The outcome of comparing a native version stamp against an expectation.</summary>
        public readonly struct NativeVersionCheck
        {
            public NativeVersionCheck(bool compatible, string actualSemver, string expectedSemver, string message)
            {
                Compatible = compatible;
                ActualSemver = actualSemver;
                ExpectedSemver = expectedSemver;
                Message = message;
            }

            /// <summary>True if the actual ABI is compatible with the expectation (MAJOR.MINOR match).</summary>
            public bool Compatible { get; }
            /// <summary>The native library's reported version string.</summary>
            public string ActualSemver { get; }
            /// <summary>The version this wrapper was built against.</summary>
            public string ExpectedSemver { get; }
            /// <summary>A human-readable summary (loud on mismatch, quiet on match).</summary>
            public string Message { get; }
        }

        /// <summary>
        /// Parses a <c>MAJOR.MINOR.PATCH</c> semver string. A leading <c>v</c> and
        /// any trailing <c>-prerelease</c> / <c>+build</c> metadata are tolerated
        /// and ignored. Pure and native-free, so it is unit testable without a
        /// loaded library. Throws <see cref="InsimulPrologException"/> on malformed
        /// input.
        /// </summary>
        public static Semver ParseSemver(string version)
        {
            if (string.IsNullOrWhiteSpace(version))
                throw new InsimulPrologException("libinsimul: empty version string.");

            string core = version.Trim();
            if (core.StartsWith("v", StringComparison.OrdinalIgnoreCase)) core = core.Substring(1);
            // Drop pre-release / build metadata (SemVer §9-10) — ABI parity keys on
            // the numeric core only.
            int cut = core.IndexOfAny(new[] { '-', '+' });
            if (cut >= 0) core = core.Substring(0, cut);

            string[] parts = core.Split('.');
            if (parts.Length != 3)
                throw new InsimulPrologException($"libinsimul: malformed semver '{version}' (expected MAJOR.MINOR.PATCH).");

            if (!int.TryParse(parts[0], out int major) ||
                !int.TryParse(parts[1], out int minor) ||
                !int.TryParse(parts[2], out int patch) ||
                major < 0 || minor < 0 || patch < 0)
            {
                throw new InsimulPrologException($"libinsimul: malformed semver '{version}' (non-numeric component).");
            }

            return new Semver(major, minor, patch);
        }

        /// <summary>
        /// Compares a native version <paramref name="actualStamp"/> against an
        /// <paramref name="expectedStamp"/> without touching the native library —
        /// the stamp is passed in, so the mismatch path is unit testable with a
        /// mocked version. Compatibility keys on MAJOR.MINOR (a differing PATCH is
        /// compatible).
        /// </summary>
        public static NativeVersionCheck CheckNativeVersion(string actualStamp, string expectedStamp)
        {
            Semver expected = ParseSemver(expectedStamp);

            Semver actual;
            try
            {
                actual = ParseSemver(actualStamp);
            }
            catch (InsimulPrologException ex)
            {
                return new NativeVersionCheck(
                    compatible: false,
                    actualSemver: actualStamp,
                    expectedSemver: expectedStamp,
                    message: $"libinsimul: could not parse native version '{actualStamp}': {ex.Message}");
            }

            bool compatible = actual.Major == expected.Major && actual.Minor == expected.Minor;
            string message = compatible
                ? $"libinsimul {actual} is compatible with the wrapper (expected {expected}.x)."
                : $"libinsimul ABI mismatch: native library reports {actual} but this wrapper was built " +
                  $"against {expected} (compatible: {expected.Major}.{expected.Minor}.x). Re-fetch the native " +
                  $"binaries with scripts/fetch-native.sh or update the wrapper.";

            return new NativeVersionCheck(compatible, actual.ToString(), expected.ToString(), message);
        }

        /// <summary>
        /// Reads the loaded library's version and throws
        /// <see cref="InsimulPrologException"/> if it is ABI-incompatible with
        /// <see cref="ExpectedNativeSemver"/>. Call once at startup to fail loudly
        /// on a stale or mismatched native binary. Returns the (compatible) check
        /// result so callers can log the confirmed version.
        /// </summary>
        public static NativeVersionCheck VerifyNativeVersion()
        {
            NativeVersionCheck check = CheckNativeVersion(NativeVersion, ExpectedNativeSemver);
            if (!check.Compatible) throw new InsimulPrologException(check.Message);
            return check;
        }

        /// <summary>Loads a Prolog program (facts + rules) into the KB.</summary>
        public void Consult(string program)
        {
            if (program == null) throw new ArgumentNullException(nameof(program));
            CheckThread();
            CheckNotDisposed();
            int rc = NativeMethods.insimul_consult(_kb, program);
            if (rc != 0) throw Fail("consult");
        }

        /// <summary>Asserts a single clause (fact or rule), without the trailing period.</summary>
        public void Assert(string clause)
        {
            if (clause == null) throw new ArgumentNullException(nameof(clause));
            CheckThread();
            CheckNotDisposed();
            int rc = NativeMethods.insimul_assert(_kb, clause);
            if (rc != 0) throw Fail("assert");
        }

        /// <summary>
        /// Retracts clauses matching <paramref name="clause"/> (which may contain
        /// variables). Returns true if at least one clause was removed.
        /// </summary>
        public bool Retract(string clause)
        {
            if (clause == null) throw new ArgumentNullException(nameof(clause));
            CheckThread();
            CheckNotDisposed();
            int rc = NativeMethods.insimul_retract(_kb, clause);
            // rc == 0 -> removed something; a positive rc means "nothing matched"
            // (not an error); negative means a real failure.
            if (rc < 0) throw Fail("retract");
            return rc == 0;
        }

        /// <summary>
        /// Lazily enumerates the solutions to <paramref name="goal"/>. Each
        /// solution is a variable-name → value binding set; a solution with no
        /// bindings yields an empty dictionary, and a goal that fails yields no
        /// elements. Enumeration streams directly from insimul_query_next, so
        /// the native iterator is opened when enumeration begins and closed when
        /// it ends (or when the enumerator is disposed).
        /// </summary>
        public IEnumerable<IReadOnlyDictionary<string, JsonElement>> Query(string goal)
        {
            if (goal == null) throw new ArgumentNullException(nameof(goal));
            CheckThread();
            CheckNotDisposed();
            // Deferred execution: validation above runs eagerly (fail fast on the
            // calling frame); the iterator body below runs on first MoveNext.
            return QueryImpl(goal);
        }

        private IEnumerable<IReadOnlyDictionary<string, JsonElement>> QueryImpl(string goal)
        {
            CheckThread();
            CheckNotDisposed();

            IntPtr iterator = NativeMethods.insimul_query(_kb, goal);
            if (iterator == IntPtr.Zero) throw Fail("query");
            _liveQueries.Add(iterator);

            try
            {
                while (true)
                {
                    // Guard EVERY step: if the KB was disposed while this
                    // enumerator was suspended at a yield, throw cleanly instead
                    // of touching freed native memory. Dispose() will already
                    // have closed this iterator (removing it from _liveQueries),
                    // so the finally below must not double-close it.
                    CheckThread();
                    CheckNotDisposed();

                    IntPtr next = NativeMethods.insimul_query_next(iterator);
                    if (next == IntPtr.Zero) yield break;

                    string json = Marshal.PtrToStringUTF8(next);
                    yield return ParseBindingSet(json);
                }
            }
            finally
            {
                // Only close if WE still own it. If Dispose ran, it already
                // closed and removed the iterator — Remove returns false and we
                // skip the (unsafe) close.
                if (_liveQueries.Remove(iterator))
                {
                    NativeMethods.insimul_query_close(iterator);
                }
            }
        }

        /// <summary>
        /// Convenience: returns true if <paramref name="goal"/> has at least one
        /// solution. Streams lazily and stops after the first.
        /// </summary>
        public bool Holds(string goal)
        {
            foreach (var _ in Query(goal)) return true;
            return false;
        }

        /// <summary>Serializes the full KB state to an opaque string for later <see cref="Restore"/>.</summary>
        public string Snapshot()
        {
            CheckThread();
            CheckNotDisposed();
            IntPtr p = NativeMethods.insimul_snapshot(_kb);
            if (p == IntPtr.Zero) throw Fail("snapshot");
            // Copy eagerly — the native buffer is only valid until the next call.
            return Marshal.PtrToStringUTF8(p) ?? string.Empty;
        }

        /// <summary>Restores KB state from a string produced by <see cref="Snapshot"/>.</summary>
        public void Restore(string snapshot)
        {
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
            CheckThread();
            CheckNotDisposed();
            int rc = NativeMethods.insimul_restore(_kb, snapshot);
            if (rc != 0) throw Fail("restore");
        }

        /// <summary>The library-owned message from the most recent failed call on this KB, or null.</summary>
        public string LastError
        {
            get
            {
                if (_disposed) return null;
                IntPtr p = NativeMethods.insimul_last_error(_kb);
                return p == IntPtr.Zero ? null : Marshal.PtrToStringUTF8(p);
            }
        }

        /// <summary>
        /// Parses a libinsimul binding-set JSON object (e.g. <c>{"X":"foo","N":42}</c>)
        /// into a variable-name → value map. Pure and native-free, so it is unit
        /// testable without a loaded library.
        /// </summary>
        public static IReadOnlyDictionary<string, JsonElement> ParseBindingSet(string json)
        {
            if (string.IsNullOrEmpty(json)) return EmptyBindings;

            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(json);
                root = doc.RootElement.Clone(); // clone so it outlives the disposed doc
            }
            catch (JsonException ex)
            {
                throw new InsimulPrologException($"libinsimul: malformed binding-set JSON: {json}", ex);
            }

            if (root.ValueKind != JsonValueKind.Object)
            {
                throw new InsimulPrologException(
                    $"libinsimul: expected a JSON object for a binding set, got {root.ValueKind}: {json}");
            }

            var result = new Dictionary<string, JsonElement>();
            foreach (JsonProperty prop in root.EnumerateObject())
            {
                result[prop.Name] = prop.Value;
            }
            return result;
        }

        private static readonly IReadOnlyDictionary<string, JsonElement> EmptyBindings =
            new Dictionary<string, JsonElement>();

        // --- Disposal ---------------------------------------------------------

        /// <summary>
        /// Releases the native KB. Idempotent — safe to call multiple times.
        /// Live query iterators are closed FIRST so no iterator outlives its KB.
        /// </summary>
        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            // Close any live iterators before the KB goes away. Snapshot the set
            // because closing does not mutate _liveQueries here (the enumerators'
            // finally blocks will find their iterator already removed).
            if (_liveQueries.Count > 0)
            {
                var live = new List<IntPtr>(_liveQueries);
                _liveQueries.Clear();
                foreach (IntPtr it in live)
                {
                    NativeMethods.insimul_query_close(it);
                }
            }

            _kb.Dispose(); // ReleaseHandle -> insimul_kb_destroy, exactly once
        }

        // --- Guards / helpers -------------------------------------------------

        private void CheckThread()
        {
            if (Environment.CurrentManagedThreadId != _ownerThreadId)
            {
                throw new InvalidOperationException(
                    $"InsimulProlog is bound to thread {_ownerThreadId} but was used from thread " +
                    $"{Environment.CurrentManagedThreadId}. A KB may only be touched from the thread that created it.");
            }
        }

        private void CheckNotDisposed()
        {
            if (_disposed) throw new ObjectDisposedException(nameof(InsimulProlog));
        }

        private InsimulPrologException Fail(string op)
        {
            string detail = LastError;
            return new InsimulPrologException(
                detail != null
                    ? $"libinsimul: {op} failed: {detail}"
                    : $"libinsimul: {op} failed with no diagnostic.");
        }
    }
}
