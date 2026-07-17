// InsimulUIThemeAsset.cs — the UGUI face of the shared design tokens (US-UU1).
//
// A ScriptableObject that materializes the engine-neutral tokens
// (InsimulUITheme, mirroring packages/core/conformance/ui/theme-tokens.json) as
// UnityEngine.Color / int font-size fields a creator can inspect + reference from
// prefabs. Defaults are seeded FROM the tokens (ResetToTokens), so a fresh asset
// is on-palette; a creator may retint it, and the parity guard only pins the
// token constants — not this asset's mutated copy.
//
// UnityEngine-COUPLED — structural-gate-only. The token VALUES it reads are
// host-tested against the JSON via InsimulUITheme.Colors.

using UnityEngine;

namespace Insimul.UI
{
    [CreateAssetMenu(menuName = "Insimul/UI Theme", fileName = "InsimulUITheme")]
    public sealed class InsimulUIThemeAsset : ScriptableObject
    {
        [Header("Colors")]
        public Color Background = ToColor("background");
        public Color Surface = ToColor("surface");
        public Color SurfaceAlt = ToColor("surface_alt");
        public Color Overlay = ToColor("overlay");
        public Color Border = ToColor("border");
        public Color TextPrimary = ToColor("text_primary");
        public Color TextSecondary = ToColor("text_secondary");
        public Color TextDisabled = ToColor("text_disabled");
        public Color Accent = ToColor("accent");
        public Color AccentHover = ToColor("accent_hover");
        public Color AccentPressed = ToColor("accent_pressed");
        public Color Success = ToColor("success");
        public Color Warning = ToColor("warning");
        public Color Danger = ToColor("danger");
        public Color Quest = ToColor("quest");

        [Header("Spacing (px)")]
        public int SpacingXs = InsimulUITheme.Spacing["xs"];
        public int SpacingSm = InsimulUITheme.Spacing["sm"];
        public int SpacingMd = InsimulUITheme.Spacing["md"];
        public int SpacingLg = InsimulUITheme.Spacing["lg"];
        public int SpacingXl = InsimulUITheme.Spacing["xl"];

        [Header("Radius (px)")]
        public int RadiusSm = InsimulUITheme.Radius["sm"];
        public int RadiusMd = InsimulUITheme.Radius["md"];
        public int RadiusLg = InsimulUITheme.Radius["lg"];

        [Header("Font size (px)")]
        public int FontCaption = InsimulUITheme.FontSize["caption"];
        public int FontBody = InsimulUITheme.FontSize["body"];
        public int FontTitle = InsimulUITheme.FontSize["title"];
        public int FontDisplay = InsimulUITheme.FontSize["display"];

        /// <summary>Convert a pure <see cref="ThemeColor"/> into a UnityEngine.Color.</summary>
        public static Color ToColor(ThemeColor c) => new Color(c.Rf, c.Gf, c.Bf, c.Af);

        /// <summary>Resolve a token color name straight to a UnityEngine.Color.</summary>
        public static Color ToColor(string token) => ToColor(InsimulUITheme.Color(token));

        /// <summary>Re-seed every field from the canonical tokens (undo a creator retint).</summary>
        public void ResetToTokens()
        {
            Background = ToColor("background");
            Surface = ToColor("surface");
            SurfaceAlt = ToColor("surface_alt");
            Overlay = ToColor("overlay");
            Border = ToColor("border");
            TextPrimary = ToColor("text_primary");
            TextSecondary = ToColor("text_secondary");
            TextDisabled = ToColor("text_disabled");
            Accent = ToColor("accent");
            AccentHover = ToColor("accent_hover");
            AccentPressed = ToColor("accent_pressed");
            Success = ToColor("success");
            Warning = ToColor("warning");
            Danger = ToColor("danger");
            Quest = ToColor("quest");
            SpacingXs = InsimulUITheme.Spacing["xs"];
            SpacingSm = InsimulUITheme.Spacing["sm"];
            SpacingMd = InsimulUITheme.Spacing["md"];
            SpacingLg = InsimulUITheme.Spacing["lg"];
            SpacingXl = InsimulUITheme.Spacing["xl"];
            RadiusSm = InsimulUITheme.Radius["sm"];
            RadiusMd = InsimulUITheme.Radius["md"];
            RadiusLg = InsimulUITheme.Radius["lg"];
            FontCaption = InsimulUITheme.FontSize["caption"];
            FontBody = InsimulUITheme.FontSize["body"];
            FontTitle = InsimulUITheme.FontSize["title"];
            FontDisplay = InsimulUITheme.FontSize["display"];
        }
    }
}
