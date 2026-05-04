#include "InsimulHUDWidget.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

void UInsimulHUDWidget::NativeConstruct()
{
    Super::NativeConstruct();
}

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────

void UInsimulHUDWidget::InitializeHUD(bool bShowHealthBar, bool bShowStaminaBar, bool bShowCompass, bool bHasSurvival)
{
    if (bInitialized) return;
    bInitialized = true;

    UCanvasPanel* Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("RootCanvas"));
    WidgetTree->RootWidget = Root;

    // ── Top-left: Health + Energy + Gold ──
    if (bShowHealthBar)
    {
        UVerticalBox* StatsBox = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("StatsBox"));
        UCanvasPanelSlot* StatsSlot = Root->AddChildToCanvas(StatsBox);
        StatsSlot->SetAnchors(FAnchors(0.f, 0.f, 0.f, 0.f));
        StatsSlot->SetOffsets(FMargin(20.f, 20.f, 250.f, 0.f));
        StatsSlot->SetAutoSize(true);

        // Health row
        HealthText = CreateLabel(StatsBox, TEXT("HP 100/100"), 16);
        HealthBar = CreateStatBar(StatsBox, FLinearColor(0.8f, 0.1f, 0.1f));

        // Energy row
        EnergyText = CreateLabel(StatsBox, TEXT("EP 100/100"), 16);
        EnergyBar = CreateStatBar(StatsBox, FLinearColor(0.2f, 0.5f, 0.9f));

        // Gold
        GoldText = CreateLabel(StatsBox, TEXT("Gold: 0"), 16);
    }

    // ── Top-center: Compass ──
    if (bShowCompass)
    {
        CompassText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("CompassText"));
        UCanvasPanelSlot* CompassSlot = Root->AddChildToCanvas(CompassText);
        CompassSlot->SetAnchors(FAnchors(0.5f, 0.f, 0.5f, 0.f));
        CompassSlot->SetAlignment(FVector2D(0.5f, 0.f));
        CompassSlot->SetOffsets(FMargin(0.f, 20.f, 0.f, 0.f));
        CompassSlot->SetAutoSize(true);

        FSlateFontInfo Font = CompassText->GetFont();
        Font.Size = 20;
        CompassText->SetFont(Font);
        CompassText->SetText(FText::FromString(TEXT("N")));
        CompassText->SetColorAndOpacity(FSlateColor(FLinearColor::White));
    }

    // ── Bottom-left: Survival bars ──
    if (bHasSurvival && bShowStaminaBar)
    {
        SurvivalContainer = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("SurvivalBox"));
        UCanvasPanelSlot* SurvSlot = Root->AddChildToCanvas(SurvivalContainer);
        SurvSlot->SetAnchors(FAnchors(0.f, 1.f, 0.f, 1.f));
        SurvSlot->SetAlignment(FVector2D(0.f, 1.f));
        SurvSlot->SetOffsets(FMargin(20.f, 0.f, 200.f, -20.f));
        SurvSlot->SetAutoSize(true);

        // Default survival needs
        AddSurvivalBar(TEXT("hunger"),      TEXT("Hunger"),      FLinearColor(0.9f, 0.6f, 0.1f));
        AddSurvivalBar(TEXT("thirst"),      TEXT("Thirst"),      FLinearColor(0.2f, 0.6f, 0.9f));
        AddSurvivalBar(TEXT("temperature"), TEXT("Temperature"), FLinearColor(0.9f, 0.3f, 0.3f));
        AddSurvivalBar(TEXT("stamina"),     TEXT("Stamina"),     FLinearColor(0.3f, 0.9f, 0.3f));
        AddSurvivalBar(TEXT("sleep"),       TEXT("Sleep"),       FLinearColor(0.6f, 0.4f, 0.8f));
    }
}

// ─────────────────────────────────────────────
// Updates
// ─────────────────────────────────────────────

void UInsimulHUDWidget::UpdateHealth(float Current, float Max)
{
    if (!HealthBar) return;
    float Pct = (Max > 0.f) ? FMath::Clamp(Current / Max, 0.f, 1.f) : 0.f;
    HealthBar->SetPercent(Pct);

    // Color shift: green > 60%, yellow > 30%, red below
    FLinearColor Color = (Pct > 0.6f)
        ? FLinearColor(0.2f, 0.8f, 0.2f)
        : (Pct > 0.3f)
            ? FLinearColor(0.9f, 0.8f, 0.1f)
            : FLinearColor(0.8f, 0.1f, 0.1f);
    HealthBar->SetFillColorAndOpacity(Color);

    if (HealthText)
    {
        HealthText->SetText(FText::FromString(FString::Printf(TEXT("HP %d/%d"), FMath::RoundToInt(Current), FMath::RoundToInt(Max))));
    }
}

void UInsimulHUDWidget::UpdateEnergy(float Current, float Max)
{
    if (!EnergyBar) return;
    float Pct = (Max > 0.f) ? FMath::Clamp(Current / Max, 0.f, 1.f) : 0.f;
    EnergyBar->SetPercent(Pct);

    if (EnergyText)
    {
        EnergyText->SetText(FText::FromString(FString::Printf(TEXT("EP %d/%d"), FMath::RoundToInt(Current), FMath::RoundToInt(Max))));
    }
}

void UInsimulHUDWidget::UpdateGold(int32 Amount)
{
    if (GoldText)
    {
        GoldText->SetText(FText::FromString(FString::Printf(TEXT("Gold: %d"), Amount)));
    }
}

void UInsimulHUDWidget::UpdateSurvivalNeed(const FString& NeedId, float Current, float Max)
{
    UProgressBar** BarPtr = SurvivalBars.Find(NeedId);
    if (!BarPtr) return;

    float Pct = (Max > 0.f) ? FMath::Clamp(Current / Max, 0.f, 1.f) : 0.f;
    (*BarPtr)->SetPercent(Pct);

    // Warning color when below 30%
    if (Pct < 0.3f)
    {
        (*BarPtr)->SetFillColorAndOpacity(FLinearColor(0.9f, 0.2f, 0.2f));
    }
}

void UInsimulHUDWidget::UpdateCompassHeading(float YawDegrees)
{
    if (!CompassText) return;

    // Normalize to 0-360
    float Heading = FMath::Fmod(YawDegrees + 360.f, 360.f);

    FString Direction;
    if (Heading >= 337.5f || Heading < 22.5f)       Direction = TEXT("N");
    else if (Heading < 67.5f)                         Direction = TEXT("NE");
    else if (Heading < 112.5f)                        Direction = TEXT("E");
    else if (Heading < 157.5f)                        Direction = TEXT("SE");
    else if (Heading < 202.5f)                        Direction = TEXT("S");
    else if (Heading < 247.5f)                        Direction = TEXT("SW");
    else if (Heading < 292.5f)                        Direction = TEXT("W");
    else                                               Direction = TEXT("NW");

    CompassText->SetText(FText::FromString(FString::Printf(TEXT("%s  %d°"), *Direction, FMath::RoundToInt(Heading))));
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

UProgressBar* UInsimulHUDWidget::CreateStatBar(UPanelWidget* Parent, FLinearColor Color)
{
    UProgressBar* Bar = WidgetTree->ConstructWidget<UProgressBar>(UProgressBar::StaticClass());
    Parent->AddChild(Bar);

    Bar->SetPercent(1.f);
    Bar->SetFillColorAndOpacity(Color);

    UVerticalBoxSlot* Slot = Cast<UVerticalBoxSlot>(Bar->Slot);
    if (Slot)
    {
        Slot->SetPadding(FMargin(0.f, 2.f, 0.f, 4.f));
    }

    return Bar;
}

UTextBlock* UInsimulHUDWidget::CreateLabel(UPanelWidget* Parent, const FString& DefaultText, int32 FontSize)
{
    UTextBlock* Text = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    Parent->AddChild(Text);

    Text->SetText(FText::FromString(DefaultText));
    Text->SetColorAndOpacity(FSlateColor(FLinearColor::White));

    FSlateFontInfo Font = Text->GetFont();
    Font.Size = FontSize;
    Text->SetFont(Font);

    return Text;
}

void UInsimulHUDWidget::AddSurvivalBar(const FString& NeedId, const FString& DisplayName, FLinearColor Color)
{
    if (!SurvivalContainer) return;

    UHorizontalBox* Row = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
    SurvivalContainer->AddChild(Row);

    UTextBlock* Label = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    Row->AddChild(Label);
    Label->SetText(FText::FromString(DisplayName));
    Label->SetColorAndOpacity(FSlateColor(FLinearColor::White));
    FSlateFontInfo Font = Label->GetFont();
    Font.Size = 12;
    Label->SetFont(Font);
    UHorizontalBoxSlot* LabelSlot = Cast<UHorizontalBoxSlot>(Label->Slot);
    if (LabelSlot)
    {
        LabelSlot->SetPadding(FMargin(0.f, 0.f, 8.f, 0.f));
    }

    UProgressBar* Bar = WidgetTree->ConstructWidget<UProgressBar>(UProgressBar::StaticClass());
    Row->AddChild(Bar);
    Bar->SetPercent(1.f);
    Bar->SetFillColorAndOpacity(Color);
    UHorizontalBoxSlot* BarSlot = Cast<UHorizontalBoxSlot>(Bar->Slot);
    if (BarSlot)
    {
        BarSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
    }

    SurvivalBars.Add(NeedId, Bar);
    SurvivalLabels.Add(NeedId, Label);
}

void UInsimulHUDWidget::UpdateInteractionPrompt(const FString& Prompt)
{
    if (!InteractionPromptText)
    {
        // Lazy-create the prompt text block at bottom-center of screen
        InteractionPromptText = NewObject<UTextBlock>(this);
        InteractionPromptText->SetText(FText::GetEmpty());
        FSlateFontInfo PromptFont = InteractionPromptText->GetFont();
        PromptFont.Size = 18;
        InteractionPromptText->SetFont(PromptFont);
        InteractionPromptText->SetColorAndOpacity(FSlateColor(FLinearColor::White));
        InteractionPromptText->SetJustification(ETextJustify::Center);

        // Add to viewport via canvas panel if available
        UPanelWidget* Root = Cast<UPanelWidget>(GetRootWidget());
        if (Root) Root->AddChild(InteractionPromptText);
    }

    if (Prompt.IsEmpty())
    {
        InteractionPromptText->SetVisibility(ESlateVisibility::Collapsed);
    }
    else
    {
        InteractionPromptText->SetText(FText::FromString(Prompt));
        InteractionPromptText->SetVisibility(ESlateVisibility::Visible);
    }
}
