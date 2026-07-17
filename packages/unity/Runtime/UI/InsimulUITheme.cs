// InsimulUITheme.cs — shared UI design tokens (US-UU1).
//
// These constants are the Unity mirror of the engine-neutral token set in
// packages/core/conformance/ui/theme-tokens.json — the single source of truth
// every default-UI mirror (Babylon CSS vars, Godot Theme, Unreal Slate, Unity
// UGUI) maps into its native representation. The token→UGUI mapping is documented
// in packages/unity/docs/ui.md; keep the two in lockstep with the JSON. A native
// theme that diverges from a token here is a parity bug (the host corpus test
// InsimulUITheme.Colors vs theme-tokens.json → colors catches it).
//
// UnityEngine-FREE so it host-tests on a bare .NET SDK: colors are hex strings +
// a small RGBA struct. The InsimulUIThemeAsset ScriptableObject
// (structural-gate-only) maps these into UnityEngine.Color / TMP font sizes.

using System;
using System.Collections.Generic;
using System.Globalization;

namespace Insimul.UI
{
    /// <summary>An RGBA color parsed from a token hex string. Bytes 0–255; A
    /// defaults to 255 (opaque) when the hex omits it.</summary>
    public readonly struct ThemeColor
    {
        public readonly byte R;
        public readonly byte G;
        public readonly byte B;
        public readonly byte A;

        public ThemeColor(byte r, byte g, byte b, byte a)
        {
            R = r;
            G = g;
            B = b;
            A = a;
        }

        /// <summary>Normalized [0,1] channels (the form a UnityEngine.Color wants).</summary>
        public float Rf => R / 255f;
        public float Gf => G / 255f;
        public float Bf => B / 255f;
        public float Af => A / 255f;

        public override string ToString() => $"#{R:x2}{G:x2}{B:x2}{A:x2}";
    }

    /// <summary>The design-token set + a hex→RGBA parser. Static data mirroring
    /// theme-tokens.json.</summary>
    public static class InsimulUITheme
    {
        /// <summary>Semantic color tokens (hex), matching theme-tokens.json → colors.</summary>
        public static readonly IReadOnlyDictionary<string, string> Colors =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                { "background",     "#12141c" },
                { "surface",        "#1b1e2a" },
                { "surface_alt",    "#242838" },
                { "overlay",        "#0a0b10cc" },
                { "border",         "#333a52" },
                { "text_primary",   "#eef1f8" },
                { "text_secondary", "#9aa3bd" },
                { "text_disabled",  "#5a6076" },
                { "accent",         "#5b8cff" },
                { "accent_hover",   "#7aa2ff" },
                { "accent_pressed", "#3f6fe0" },
                { "success",        "#4ecb8d" },
                { "warning",        "#e6b34d" },
                { "danger",         "#e05a6a" },
                { "quest",          "#c9a24b" },
            };

        /// <summary>Spacing tokens (px), matching theme-tokens.json → spacing.</summary>
        public static readonly IReadOnlyDictionary<string, int> Spacing =
            new Dictionary<string, int>(StringComparer.Ordinal)
            {
                { "xs", 4 }, { "sm", 8 }, { "md", 12 }, { "lg", 16 }, { "xl", 24 },
            };

        /// <summary>Corner-radius tokens (px), matching theme-tokens.json → radius.</summary>
        public static readonly IReadOnlyDictionary<string, int> Radius =
            new Dictionary<string, int>(StringComparer.Ordinal)
            {
                { "sm", 4 }, { "md", 8 }, { "lg", 12 },
            };

        /// <summary>Font-size tokens (px), matching theme-tokens.json → font_size.</summary>
        public static readonly IReadOnlyDictionary<string, int> FontSize =
            new Dictionary<string, int>(StringComparer.Ordinal)
            {
                { "caption", 12 }, { "body", 16 }, { "title", 22 }, { "display", 32 },
            };

        /// <summary>Parse a token color by name into RGBA (defaults to opaque white
        /// for an unknown name, so the UI degrades visibly rather than invisibly).</summary>
        public static ThemeColor Color(string name) =>
            Colors.TryGetValue(name, out string hex)
                ? ParseHex(hex)
                : new ThemeColor(255, 255, 255, 255);

        /// <summary>Parse a <c>#rrggbb</c> or <c>#rrggbbaa</c> hex string into RGBA.
        /// Throws <see cref="FormatException"/> on a malformed value.</summary>
        public static ThemeColor ParseHex(string hex)
        {
            if (string.IsNullOrEmpty(hex)) throw new FormatException("empty color hex");
            string h = hex[0] == '#' ? hex.Substring(1) : hex;
            if (h.Length != 6 && h.Length != 8)
                throw new FormatException($"expected #rrggbb or #rrggbbaa, got '{hex}'");
            byte r = ByteAt(h, 0);
            byte g = ByteAt(h, 2);
            byte b = ByteAt(h, 4);
            byte a = h.Length == 8 ? ByteAt(h, 6) : (byte)255;
            return new ThemeColor(r, g, b, a);
        }

        private static byte ByteAt(string h, int i) =>
            byte.Parse(h.Substring(i, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
    }
}
