using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Insimul.Services
{
    /// <summary>
    /// P/Invoke wrapper for llama.cpp, Whisper, and Piper native plugins.
    /// Provides low-level access to LLM inference, STT, and TTS.
    /// Use LocalAIService for the high-level MonoBehaviour API.
    ///
    /// Required native libraries:
    ///   - llama.dll/.so/.dylib   (from llama.cpp, build with LLAMA_BUILD_COMMON=ON)
    ///   - whisper.dll/.so/.dylib (from whisper.cpp)
    ///   - piper_phonemize.dll/.so/.dylib (optional, for native TTS — subprocess fallback used otherwise)
    ///
    /// Place compiled libraries in Assets/Plugins/ (platform-specific subfolders).
    /// </summary>
    public static class LlamaNativePlugin
    {
#if UNITY_IOS && !UNITY_EDITOR
        private const string LlamaLib = "__Internal";
        private const string WhisperLib = "__Internal";
#else
        private const string LlamaLib = "llama";
        private const string WhisperLib = "whisper";
#endif

        // ─── llama.cpp backend lifecycle ───

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void llama_backend_init();

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void llama_backend_free();

        // ─── llama.cpp model ───

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_model_default_params();

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_load_model_from_file(
            [MarshalAs(UnmanagedType.LPStr)] string path_model,
            IntPtr model_params);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void llama_free_model(IntPtr model);

        // ─── llama.cpp context ───

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_context_default_params();

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_new_context_with_model(IntPtr model, IntPtr ctx_params);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void llama_free(IntPtr ctx);

        // ─── llama.cpp tokenization ───

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int llama_tokenize(
            IntPtr model,
            [MarshalAs(UnmanagedType.LPStr)] string text,
            int text_len,
            [Out] int[] tokens,
            int n_tokens_max,
            [MarshalAs(UnmanagedType.I1)] bool add_special,
            [MarshalAs(UnmanagedType.I1)] bool parse_special);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int llama_token_to_piece(
            IntPtr model,
            int token,
            [Out] byte[] buf,
            int length,
            int lstrip,
            [MarshalAs(UnmanagedType.I1)] bool special);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int llama_token_eos(IntPtr model);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int llama_n_vocab(IntPtr model);

        // ─── llama.cpp sampling ───

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_sampler_chain_default_params();

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_sampler_chain_init(IntPtr chain_params);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void llama_sampler_chain_add(IntPtr chain, IntPtr sampler);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_sampler_init_temp(float temp);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_sampler_init_top_p(float p, int min_keep);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr llama_sampler_init_dist(int seed);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int llama_sampler_sample(IntPtr smpl, IntPtr ctx, int idx);

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void llama_sampler_free(IntPtr smpl);

        // ─── llama.cpp decode ───

        [DllImport(LlamaLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int llama_decode(IntPtr ctx, IntPtr batch);

        // ─── Whisper bindings ───

        [DllImport(WhisperLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr whisper_init_from_file(
            [MarshalAs(UnmanagedType.LPStr)] string path_model);

        [DllImport(WhisperLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern void whisper_free(IntPtr ctx);

        [DllImport(WhisperLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr whisper_full_default_params(int strategy);

        [DllImport(WhisperLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int whisper_full(
            IntPtr ctx,
            IntPtr wparams,
            [In] float[] samples,
            int n_samples);

        [DllImport(WhisperLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern int whisper_full_n_segments(IntPtr ctx);

        [DllImport(WhisperLib, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr whisper_full_get_segment_text(IntPtr ctx, int i_segment);

        // ─── Availability checks ───

        /// <summary>
        /// Tests whether the llama.cpp native library is loadable.
        /// </summary>
        public static bool IsLlamaAvailable()
        {
            try
            {
                llama_backend_init();
                llama_backend_free();
                return true;
            }
            catch (DllNotFoundException) { return false; }
            catch (EntryPointNotFoundException) { return false; }
        }

        /// <summary>
        /// Tests whether the whisper native library is loadable.
        /// </summary>
        public static bool IsWhisperAvailable()
        {
            try
            {
                // Just check if the DLL is loadable by calling a harmless function
                var ptr = whisper_full_default_params(0);
                return ptr != IntPtr.Zero;
            }
            catch (DllNotFoundException) { return false; }
            catch (EntryPointNotFoundException) { return false; }
        }

        /// <summary>
        /// Tests whether any native AI library is available.
        /// </summary>
        public static bool IsAvailable()
        {
            return IsLlamaAvailable();
        }
    }
}
