// NativeMethods.cs — raw P/Invoke surface for libinsimul.
//
// This file mirrors the C ABI declared in insimul-native/include/insimul.h
// (from libinsimul-bootstrap). The ABI is intentionally POLL-ONLY (no
// callbacks / function pointers) so it is IL2CPP-safe: there is nothing to
// [MonoPInvokeCallback]-annotate. All entry points use the C calling
// convention (Cdecl).
//
// String conventions:
//   * Strings passed INTO the library are marshaled as UTF-8
//     (UnmanagedType.LPUTF8Str) — the marshaler owns the temporary buffer.
//   * Strings returned FROM the library are declared as IntPtr and read with
//     Marshal.PtrToStringUTF8. The native library owns that memory; the
//     marshaler must NEVER try to free it. Returned pointers are only
//     guaranteed valid until the next call on the same handle, so callers copy
//     eagerly.
//
// NO UnityEngine references live in this file — it is pure C# so the dotnet
// verify project (tools/verify-unity/) can compile and run it against a
// locally built libinsimul dylib with no Unity present.

using System;
using System.Runtime.InteropServices;

namespace Insimul.Prolog
{
    /// <summary>
    /// Direct 1:1 bindings to the libinsimul C ABI. Internal on purpose — all
    /// lifetime and threading discipline lives in <see cref="InsimulProlog"/>.
    /// </summary>
    internal static class NativeMethods
    {
        /// <summary>
        /// Base name of the native library. The platform loader resolves this to
        /// <c>libinsimul.dylib</c> (macOS), <c>insimul.dll</c> (Windows), or
        /// <c>libinsimul.so</c> (Linux). Keep this name in sync with the Plugins
        /// folder layout documented in Runtime/Plugins/README.md (US-UP3).
        /// </summary>
        internal const string Lib = "insimul";

        // --- Library metadata -------------------------------------------------

        /// <summary>Returns a library-owned semver C string (never NULL).</summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_version")]
        internal static extern IntPtr insimul_version();

        // --- Knowledge-base lifecycle ----------------------------------------

        /// <summary>
        /// Creates a fresh knowledge base. Marshaled directly into a
        /// <see cref="KbHandle"/> so the raw pointer is never exposed unwrapped.
        /// </summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_kb_create")]
        internal static extern KbHandle insimul_kb_create();

        /// <summary>Destroys a knowledge base. Called only from the SafeHandle.</summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_kb_destroy")]
        internal static extern void insimul_kb_destroy(IntPtr kb);

        // --- Program / clause management -------------------------------------
        // All return 0 on success and a non-zero error code otherwise; the
        // human-readable reason is available via insimul_last_error(kb).

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_consult")]
        internal static extern int insimul_consult(KbHandle kb, [MarshalAs(UnmanagedType.LPUTF8Str)] string program);

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_assert")]
        internal static extern int insimul_assert(KbHandle kb, [MarshalAs(UnmanagedType.LPUTF8Str)] string clause);

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_retract")]
        internal static extern int insimul_retract(KbHandle kb, [MarshalAs(UnmanagedType.LPUTF8Str)] string clause);

        /// <summary>
        /// Returns a library-owned UTF-8 error string for the most recent failed
        /// call on this KB, or <see cref="IntPtr.Zero"/> if there is none. Valid
        /// only until the next call on the KB.
        /// </summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_last_error")]
        internal static extern IntPtr insimul_last_error(KbHandle kb);

        // --- Query iterator (poll-only) --------------------------------------

        /// <summary>
        /// Opens a query iterator for <paramref name="goal"/>. Returns an opaque
        /// iterator pointer, or <see cref="IntPtr.Zero"/> on immediate error
        /// (e.g. a syntactically invalid goal — see insimul_last_error).
        /// </summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_query")]
        internal static extern IntPtr insimul_query(KbHandle kb, [MarshalAs(UnmanagedType.LPUTF8Str)] string goal);

        /// <summary>
        /// Advances the iterator. Returns a library-owned UTF-8 JSON object
        /// string for the next solution's binding set (e.g. <c>{"X":"foo"}</c>,
        /// or <c>{}</c> for a solution with no variable bindings), or
        /// <see cref="IntPtr.Zero"/> when the solution stream is exhausted. The
        /// returned pointer is valid only until the next call on this iterator.
        /// </summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_query_next")]
        internal static extern IntPtr insimul_query_next(IntPtr iterator);

        /// <summary>Frees a query iterator. Safe to call on any live iterator.</summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_query_close")]
        internal static extern void insimul_query_close(IntPtr iterator);

        // --- Snapshot / restore ----------------------------------------------

        /// <summary>
        /// Serializes the full KB state and returns a library-owned UTF-8 string,
        /// or <see cref="IntPtr.Zero"/> on error. Valid until the next call on
        /// the KB, so callers copy eagerly.
        /// </summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_snapshot")]
        internal static extern IntPtr insimul_snapshot(KbHandle kb);

        /// <summary>Restores KB state from a prior snapshot. Returns 0 on success.</summary>
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl, EntryPoint = "insimul_restore")]
        internal static extern int insimul_restore(KbHandle kb, [MarshalAs(UnmanagedType.LPUTF8Str)] string snapshot);
    }

    /// <summary>
    /// SafeHandle owning a libinsimul knowledge-base pointer. Guarantees the KB
    /// is destroyed exactly once even under GC finalization, and closes the
    /// window in which a raw handle could leak (the create P/Invoke marshals
    /// straight into this type).
    /// </summary>
    internal sealed class KbHandle : SafeHandle
    {
        // Required parameterless ctor so the P/Invoke marshaler can construct
        // the handle before SetHandle-ing the returned pointer.
        public KbHandle() : base(invalidHandleValue: IntPtr.Zero, ownsHandle: true) { }

        public override bool IsInvalid => handle == IntPtr.Zero;

        protected override bool ReleaseHandle()
        {
            NativeMethods.insimul_kb_destroy(handle);
            return true;
        }
    }
}
