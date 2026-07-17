// StreamingAssetsWorldSource.cs — the thin Unity adapter over InsimulWorldSource
// (US-UC1).
//
// The engine-agnostic loading + version-compatibility logic all lives in
// InsimulWorldSource.cs (UnityEngine-free, host-tested by tools/verify-unity).
// This file adds ONLY the platform glue: reading the JSON bytes off disk from
// Application.streamingAssetsPath (which on Android is inside the APK and must be
// fetched via UnityWebRequest, hence the two entry points). It intentionally holds
// no parsing logic of its own so the two runtimes can never diverge.
//
// It is UnityEngine-coupled, so it is covered by the C# STRUCTURAL syntax gate
// only (no editor/SDK in this harness); the parsing behavior is proven on the
// pure core.

using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace Insimul.World
{
    /// <summary>
    /// Loads an <see cref="InsimulWorldSource"/> from files under
    /// <c>Application.streamingAssetsPath</c>. Use <see cref="LoadSave"/> /
    /// <see cref="LoadWorldIr"/> on desktop/editor, or the <c>*Async</c> coroutine
    /// variants on platforms where StreamingAssets is not a plain file path (Android).
    /// </summary>
    public static class StreamingAssetsWorldSource
    {
        /// <summary>Load a world from a SaveFile JSON under StreamingAssets.</summary>
        public static InsimulWorldSource LoadSave(string relativePath, int? currentWorldVersion = null)
        {
            string full = Path.Combine(Application.streamingAssetsPath, relativePath);
            return InsimulWorldSource.FromSaveJson(File.ReadAllText(full), currentWorldVersion);
        }

        /// <summary>Load a world from a WorldIR export JSON under StreamingAssets.</summary>
        public static InsimulWorldSource LoadWorldIr(string relativePath)
        {
            string full = Path.Combine(Application.streamingAssetsPath, relativePath);
            return InsimulWorldSource.FromWorldIrJson(File.ReadAllText(full));
        }

        /// <summary>
        /// Read raw JSON bytes from StreamingAssets on any platform (Android bundles
        /// them inside the APK, so a plain <see cref="File"/> read fails there — this
        /// routes through <see cref="UnityWebRequest"/>). Yields the text via
        /// <paramref name="onLoaded"/>; the caller passes it to
        /// <see cref="InsimulWorldSource.FromSaveJson"/> /
        /// <see cref="InsimulWorldSource.FromWorldIrJson"/>.
        /// </summary>
        public static System.Collections.IEnumerator ReadTextAsync(
            string relativePath, System.Action<string> onLoaded, System.Action<string> onError = null)
        {
            string full = Path.Combine(Application.streamingAssetsPath, relativePath);
            using (UnityWebRequest req = UnityWebRequest.Get(full))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    onError?.Invoke(req.error);
                    yield break;
                }
                onLoaded?.Invoke(req.downloadHandler.text);
            }
        }
    }
}
