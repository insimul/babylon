"""
GenerateInsimulContent.py — Unreal Editor Python Script

Generates the editor assets that an Insimul export needs in order to *render*,
but which cannot be expressed as plain C++ or JSON:

  1. Widget Blueprints (WBP_*) for the generated C++ UI widgets.
     The C++ UMG widgets (UDialogueWidget, UInsimulChatPanel, ...) declare their
     sub-widgets with `meta = (BindWidgetOptional)` / `meta = (BindWidget)` and do
     ALL of their behaviour in C++, binding the sub-widgets *by name*. When the
     game does `CreateWidget<UDialogueWidget>(this, UDialogueWidget::StaticClass())`
     against the bare C++ class there is no widget tree, every bound pointer is
     null, and the UI renders an empty root. This script creates a concrete
     WidgetBlueprint per C++ widget whose widget tree contains the correctly-named
     bound children, so the bindings resolve and the UI renders. No event graph is
     needed — the logic already lives in C++.

  2. Font assets imported from Content/Fonts/ and applied to the text widgets this
     script creates, so non-Latin target-language text (CJK / Arabic / Devanagari /
     ...) renders glyphs instead of tofu boxes.

Run order: this runs AFTER the C++ modules are built (so the InsimulExport classes
are loaded) and AFTER ImportInsimulAssets.py. setup.sh handles the ordering.

Targets the UE 5.4–5.7 Python API. Every step is guarded and logged; a failure on
one asset never aborts the rest. Re-running is safe (idempotent — existing assets
are skipped/overwritten in place).

Usage:
  Automated (recommended): run by setup.sh.
  Manual: File > Execute Python Script (browse to this file), or
          exec(open("Scripts/GenerateInsimulContent.py").read())
"""

import os
import unreal

MODULE = "InsimulExport"          # generated game module name
UI_PACKAGE = "/Game/UI"           # where WBP assets are created
FONT_PACKAGE = "/Game/Fonts"      # where fonts are imported

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
editor_asset = unreal.EditorAssetLibrary


# ─────────────────────────────────────────────────────────────────────────────
# Logging helpers
# ─────────────────────────────────────────────────────────────────────────────

def log(msg):
    unreal.log("[InsimulContent] " + msg)


def warn(msg):
    unreal.log_warning("[InsimulContent] " + msg)


def err(msg):
    unreal.log_error("[InsimulContent] " + msg)


# ─────────────────────────────────────────────────────────────────────────────
# Class / type resolution
# ─────────────────────────────────────────────────────────────────────────────

def load_widget_class(class_name):
    """Resolve a UMG widget UClass by name.

    Tries the C++ game module first (/Script/InsimulExport.<Name>), then the
    engine UMG module (/Script/UMG.<Name>) for stock panels/leaves, then the
    `unreal` python stub as a last resort.
    """
    for pkg in (MODULE, "UMG", "Slate"):
        cls = unreal.load_class(None, "/Script/{0}.{1}".format(pkg, class_name))
        if cls:
            return cls
    stub = getattr(unreal, class_name, None)
    if stub is not None:
        try:
            return stub.static_class()
        except Exception:
            return stub
    return None


# Stock UMG widget python types (used to construct tree nodes).
UMG = {
    "UCanvasPanel": unreal.CanvasPanel,
    "UVerticalBox": unreal.VerticalBox,
    "UHorizontalBox": unreal.HorizontalBox,
    "UScrollBox": unreal.ScrollBox,
    "UOverlay": unreal.Overlay,
    "UWidgetSwitcher": unreal.WidgetSwitcher,
    "UTextBlock": unreal.TextBlock,
    "UEditableTextBox": unreal.EditableTextBox,
    "UButton": unreal.Button,
    "UImage": unreal.Image,
}

TEXT_TYPES = ("UTextBlock", "UEditableTextBox")


# ─────────────────────────────────────────────────────────────────────────────
# Bound-widget specs — one entry per generated C++ UI widget.
# Each child is (TypeName, WidgetName). The names MUST match the
# UPROPERTY(meta=(BindWidget[Optional])) names in the C++ headers exactly.
# A synthetic CanvasPanel root holds a full-screen VerticalBox that stacks the
# bound widgets; designers can re-parent/skin afterwards. Bound container widgets
# (ScrollBox, VerticalBox, ...) are created empty — the C++ fills them at runtime.
# ─────────────────────────────────────────────────────────────────────────────

WIDGET_SPECS = {
    "WBP_Dialogue": {
        "parent": "DialogueWidget",
        "children": [
            ("UVerticalBox", "DialogueRoot"),
            ("UTextBlock", "NPCNameText"),
            ("UTextBlock", "GreetingText"),
            ("UScrollBox", "ChatScrollBox"),
            ("UEditableTextBox", "PlayerInputBox"),
            ("UButton", "SendButton"),
            ("UButton", "CloseButton"),
            ("UVerticalBox", "ActionsContainer"),
            ("UTextBlock", "HintText"),
        ],
    },
    "WBP_ChatPanel": {
        "parent": "InsimulChatPanel",
        "children": [
            ("UTextBlock", "NPCNameText"),
            ("UImage", "NPCPortraitImage"),
            ("UScrollBox", "ConversationScrollBox"),
            ("UTextBlock", "TypingIndicatorText"),
            ("UEditableTextBox", "MessageInputBox"),
            ("UButton", "SendButton"),
            ("UVerticalBox", "ActionButtonsContainer"),
            ("UButton", "AskAboutQuestButton"),
            ("UButton", "TradeButton"),
            ("UButton", "RequestHelpButton"),
            ("UButton", "SayGoodbyeButton"),
        ],
    },
    "WBP_ActionQuickBar": {
        "parent": "InsimulActionQuickBar",
        "children": [
            ("UHorizontalBox", "SlotsContainer"),
        ],
    },
    "WBP_DocumentReader": {
        "parent": "InsimulDocumentReader",
        "children": [
            ("UTextBlock", "TitleText"),
            ("UTextBlock", "ContentText"),
            ("UTextBlock", "PageCounterText"),
            ("UButton", "PrevPageButton"),
            ("UButton", "NextPageButton"),
            ("UButton", "CloseButton"),
        ],
    },
    "WBP_GameMenu": {
        "parent": "InsimulGameMenuWidget",
        "children": [
            ("UWidgetSwitcher", "TabContentSwitcher"),
            ("UButton", "ResumeButton"),
            ("UButton", "InventoryButton"),
            ("UButton", "QuestJournalButton"),
            ("UButton", "MapButton"),
            ("UButton", "SkillsButton"),
            ("UButton", "RulesButton"),
            ("UButton", "SettingsButton"),
            ("UButton", "SaveLoadButton"),
            ("UButton", "QuitButton"),
        ],
    },
    "WBP_IntroSequence": {
        "parent": "InsimulIntroSequence",
        "children": [
            ("UImage", "PortraitImage"),
            ("UTextBlock", "CharacterNameText"),
            ("UTextBlock", "NarrativeText"),
            ("UTextBlock", "SkipHintText"),
        ],
    },
    "WBP_Minimap": {
        "parent": "InsimulMinimap",
        "children": [
            # Required BindWidget — the widget fails to construct without these.
            ("UImage", "MinimapImage"),
            ("UCanvasPanel", "MarkerCanvas"),
            ("UImage", "PlayerArrow"),
            ("UOverlay", "CompassOverlay"),
            # Optional
            ("UButton", "LegendButton"),
            ("UButton", "FullscreenButton"),
            ("UButton", "CollapseButton"),
            ("UVerticalBox", "LegendPanel"),
        ],
    },
    "WBP_QuestOfferPanel": {
        "parent": "InsimulQuestOfferPanel",
        "children": [
            ("UTextBlock", "TitleText"),
            ("UTextBlock", "DescriptionText"),
            ("UVerticalBox", "ObjectivesListBox"),
            ("UVerticalBox", "RewardsListBox"),
            ("UButton", "AcceptButton"),
            ("UButton", "DeclineButton"),
        ],
    },
    "WBP_QuestTracker": {
        "parent": "InsimulQuestTrackerWidget",
        "children": [
            ("UTextBlock", "TrackerHeaderText"),
            ("UVerticalBox", "ObjectiveListBox"),
        ],
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Widget-tree construction
# ─────────────────────────────────────────────────────────────────────────────

def _construct(tree, py_type, name):
    """Construct a widget node in the tree and give it the bound name.

    The bind resolves on the widget's FName, so naming is what matters. We also
    flag it as a variable to mirror designer-authored bindings.
    """
    # FName params auto-coerce from str in the UE Python API; passing the plain
    # string is the most portable form across 5.x.
    widget = tree.construct_widget(py_type, name)
    try:
        widget.set_editor_property("is_variable", True)
    except Exception:
        pass
    return widget


def _full_screen_canvas_slot(slot):
    """Anchor a CanvasPanelSlot to fill its parent."""
    try:
        slot.set_editor_property("anchors", unreal.Anchors(unreal.Vector2D(0.0, 0.0),
                                                           unreal.Vector2D(1.0, 1.0)))
        slot.set_editor_property("offsets", unreal.Margin(0.0, 0.0, 0.0, 0.0))
    except Exception:
        pass


def apply_font(widget, type_name, font_info):
    """Apply the bundled font to a text widget so non-Latin glyphs render."""
    if font_info is None or type_name not in TEXT_TYPES:
        return
    try:
        widget.set_editor_property("font", font_info)
    except Exception:
        # EditableTextBox stores font on its WidgetStyle; best-effort only.
        try:
            style = widget.get_editor_property("widget_style")
            style.set_editor_property("font", font_info)
            widget.set_editor_property("widget_style", style)
        except Exception:
            pass


def build_widget_blueprint(asset_name, spec, font_info):
    parent = load_widget_class(spec["parent"])
    if parent is None:
        warn("Parent class not found for {0} ({1}); is the C++ module built? "
             "Skipping.".format(asset_name, spec["parent"]))
        return False

    asset_path = "{0}/{1}".format(UI_PACKAGE, asset_name)
    if editor_asset.does_asset_exist(asset_path):
        editor_asset.delete_asset(asset_path)

    factory = unreal.WidgetBlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    wbp = asset_tools.create_asset(asset_name, UI_PACKAGE, unreal.WidgetBlueprint, factory)
    if wbp is None:
        err("Failed to create WidgetBlueprint {0}".format(asset_name))
        return False

    tree = wbp.get_editor_property("widget_tree")

    # Root canvas → full-screen vertical stack that holds the bound widgets.
    root = _construct(tree, unreal.CanvasPanel, "RootCanvas")
    tree.set_editor_property("root_widget", root)
    stack = _construct(tree, unreal.VerticalBox, "AutoLayout")
    root_slot = root.add_child(stack)
    _full_screen_canvas_slot(root_slot)

    bound = []
    for type_name, widget_name in spec["children"]:
        py_type = UMG.get(type_name)
        if py_type is None:
            warn("Unknown widget type {0} for {1}.{2}".format(type_name, asset_name, widget_name))
            continue
        node = _construct(tree, py_type, widget_name)
        if type_name in TEXT_TYPES:
            apply_font(node, type_name, font_info)
        stack.add_child(node)
        bound.append(widget_name)

    unreal.BlueprintEditorLibrary.compile_blueprint(wbp)
    editor_asset.save_loaded_asset(wbp)
    log("Created {0} (parent {1}) with bound widgets: {2}".format(
        asset_name, spec["parent"], ", ".join(bound)))
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Fonts
# ─────────────────────────────────────────────────────────────────────────────

FONT_EXTENSIONS = {".ttf", ".otf", ".ttc"}


def import_fonts():
    """Import every font under Content/Fonts/ as a Font asset.

    Returns an FSlateFontInfo for the preferred face (the base Latin Noto if
    present, else the first imported), or None if no fonts were bundled.
    """
    content_dir = unreal.Paths.project_content_dir()
    fonts_dir = os.path.join(content_dir, "Fonts")
    if not os.path.isdir(fonts_dir):
        log("No Content/Fonts/ directory — skipping font import (UI uses engine default).")
        return None

    tasks = []
    names = []
    for filename in sorted(os.listdir(fonts_dir)):
        ext = os.path.splitext(filename)[1].lower()
        if ext not in FONT_EXTENSIONS:
            continue
        task = unreal.AssetImportTask()
        task.filename = os.path.join(fonts_dir, filename)
        task.destination_path = FONT_PACKAGE
        task.automated = True
        task.replace_existing = True
        task.save = True
        tasks.append(task)
        names.append(os.path.splitext(filename)[0])

    if not tasks:
        log("No font files under Content/Fonts/ — skipping.")
        return None

    asset_tools.import_asset_tasks(tasks)
    log("Imported {0} font(s): {1}".format(len(names), ", ".join(names)))

    # Prefer a base Latin face for the default UI font; the per-script faces
    # (Arabic/CJK/Devanagari/...) are present in the project for designers to
    # compose into a fallback font where target-language text appears.
    preferred = None
    for n in names:
        if "NotoSans-" in n or n.endswith("NotoSans") or "Regular" in n:
            preferred = n
            break
    if preferred is None:
        preferred = names[0]

    font_obj = editor_asset.load_asset("{0}/{1}".format(FONT_PACKAGE, preferred))
    if font_obj is None:
        warn("Could not load imported font {0}".format(preferred))
        return None
    try:
        info = unreal.SlateFontInfo()
        info.set_editor_property("font_object", font_obj)
        info.set_editor_property("typeface_font_name", "Regular")
        info.set_editor_property("size", 18)
        log("Default UI font set to {0}".format(preferred))
        return info
    except Exception as e:
        warn("Could not build SlateFontInfo from {0}: {1}".format(preferred, e))
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    log("===== Generating Insimul editor content =====")

    if not editor_asset.does_directory_exist(UI_PACKAGE):
        editor_asset.make_directory(UI_PACKAGE)

    font_info = import_fonts()

    ok = 0
    for asset_name, spec in WIDGET_SPECS.items():
        try:
            if build_widget_blueprint(asset_name, spec, font_info):
                ok += 1
        except Exception as e:
            err("Exception building {0}: {1}".format(asset_name, e))

    log("===== Done — {0}/{1} widget blueprints created. =====".format(ok, len(WIDGET_SPECS)))
    log("These WBPs render the generated C++ UI. Re-skin them in UMG as desired;")
    log("the bound widget *names* must be preserved for the C++ bindings to resolve.")


main()
