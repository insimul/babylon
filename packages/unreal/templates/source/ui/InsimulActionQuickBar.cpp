#include "InsimulActionQuickBar.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/VerticalBox.h"
#include "Components/Image.h"
#include "Components/TextBlock.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Components/Border.h"
#include "Engine/Texture2D.h"

void UInsimulActionQuickBar::NativeConstruct()
{
    Super::NativeConstruct();

    // Initialize slots
    Slots.SetNum(NUM_SLOTS);
    CooldownRemaining.SetNum(NUM_SLOTS);
    CooldownTotal.SetNum(NUM_SLOTS);
    SlotIcons.SetNum(NUM_SLOTS);
    CooldownOverlays.SetNum(NUM_SLOTS);
    SlotKeyLabels.SetNum(NUM_SLOTS);

    for (int32 i = 0; i < NUM_SLOTS; ++i)
    {
        Slots[i].SlotIndex = i;
        CooldownRemaining[i] = 0.0f;
        CooldownTotal[i] = 0.0f;
    }

    RebuildSlotWidgets();
}

void UInsimulActionQuickBar::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
    Super::NativeTick(MyGeometry, InDeltaTime);

    // Update cooldowns
    for (int32 i = 0; i < NUM_SLOTS; ++i)
    {
        if (Slots[i].bOnCooldown && CooldownRemaining[i] > 0.0f)
        {
            CooldownRemaining[i] -= InDeltaTime;

            if (CooldownRemaining[i] <= 0.0f)
            {
                CooldownRemaining[i] = 0.0f;
                Slots[i].bOnCooldown = false;
            }

            UpdateSlotVisual(i);
        }
    }
}

void UInsimulActionQuickBar::AssignAction(int32 SlotIndex, const FString& ActionId, const FString& IconPath)
{
    if (!IsValidSlotIndex(SlotIndex)) return;

    Slots[SlotIndex].ActionId = ActionId;
    Slots[SlotIndex].IconPath = IconPath;
    Slots[SlotIndex].bOnCooldown = false;
    CooldownRemaining[SlotIndex] = 0.0f;

    // Load and set icon texture
    if (SlotIcons.IsValidIndex(SlotIndex) && SlotIcons[SlotIndex])
    {
        if (!IconPath.IsEmpty())
        {
            UTexture2D* IconTexture = Cast<UTexture2D>(
                StaticLoadObject(UTexture2D::StaticClass(), nullptr, *IconPath));
            if (IconTexture)
            {
                SlotIcons[SlotIndex]->SetBrushFromTexture(IconTexture);
            }
        }
        SlotIcons[SlotIndex]->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
    }

    UpdateSlotVisual(SlotIndex);

    UE_LOG(LogTemp, Log, TEXT("[InsimulQuickBar] Assigned action '%s' to slot %d"), *ActionId, SlotIndex);
}

void UInsimulActionQuickBar::ClearSlot(int32 SlotIndex)
{
    if (!IsValidSlotIndex(SlotIndex)) return;

    Slots[SlotIndex].ActionId = TEXT("");
    Slots[SlotIndex].IconPath = TEXT("");
    Slots[SlotIndex].bOnCooldown = false;
    CooldownRemaining[SlotIndex] = 0.0f;

    if (SlotIcons.IsValidIndex(SlotIndex) && SlotIcons[SlotIndex])
    {
        SlotIcons[SlotIndex]->SetVisibility(ESlateVisibility::Collapsed);
    }

    UpdateSlotVisual(SlotIndex);
}

void UInsimulActionQuickBar::TriggerSlot(int32 SlotIndex)
{
    if (!IsValidSlotIndex(SlotIndex)) return;

    // Cannot trigger empty or cooling-down slots
    if (Slots[SlotIndex].ActionId.IsEmpty())
    {
        return;
    }

    if (Slots[SlotIndex].bOnCooldown)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[InsimulQuickBar] Slot %d is on cooldown"), SlotIndex);
        return;
    }

    OnSlotTriggered.Broadcast(SlotIndex);

    UE_LOG(LogTemp, Log, TEXT("[InsimulQuickBar] Triggered slot %d (action: %s)"), SlotIndex, *Slots[SlotIndex].ActionId);
}

void UInsimulActionQuickBar::StartCooldown(int32 SlotIndex, float Duration)
{
    if (!IsValidSlotIndex(SlotIndex)) return;
    if (Duration <= 0.0f) return;

    Slots[SlotIndex].bOnCooldown = true;
    Slots[SlotIndex].Cooldown = Duration;
    CooldownRemaining[SlotIndex] = Duration;
    CooldownTotal[SlotIndex] = Duration;

    UpdateSlotVisual(SlotIndex);

    UE_LOG(LogTemp, Log, TEXT("[InsimulQuickBar] Cooldown started on slot %d (%.1fs)"), SlotIndex, Duration);
}

bool UInsimulActionQuickBar::IsSlotOnCooldown(int32 SlotIndex) const
{
    if (!IsValidSlotIndex(SlotIndex)) return false;
    return Slots[SlotIndex].bOnCooldown;
}

bool UInsimulActionQuickBar::IsValidSlotIndex(int32 SlotIndex) const
{
    return SlotIndex >= 0 && SlotIndex < NUM_SLOTS;
}

void UInsimulActionQuickBar::RebuildSlotWidgets()
{
    if (!SlotsContainer) return;

    SlotsContainer->ClearChildren();

    for (int32 i = 0; i < NUM_SLOTS; ++i)
    {
        // Each slot is an overlay: icon + cooldown overlay + key label
        UOverlay* SlotOverlay = NewObject<UOverlay>(SlotsContainer);

        // Background border
        UBorder* SlotBorder = NewObject<UBorder>(SlotOverlay);
        SlotBorder->SetBrushColor(FLinearColor(0.1f, 0.1f, 0.12f, 0.85f));
        SlotBorder->SetPadding(FMargin(4.0f));
        UOverlaySlot* BorderSlot = SlotOverlay->AddChildToOverlay(SlotBorder);
        BorderSlot->SetHorizontalAlignment(HAlign_Fill);
        BorderSlot->SetVerticalAlignment(VAlign_Fill);

        // Icon image
        UImage* Icon = NewObject<UImage>(SlotOverlay);
        Icon->SetDesiredSizeOverride(FVector2D(48.0f, 48.0f));
        Icon->SetVisibility(Slots[i].ActionId.IsEmpty() ? ESlateVisibility::Collapsed : ESlateVisibility::SelfHitTestInvisible);
        UOverlaySlot* IconSlot = SlotOverlay->AddChildToOverlay(Icon);
        IconSlot->SetHorizontalAlignment(HAlign_Center);
        IconSlot->SetVerticalAlignment(VAlign_Center);
        SlotIcons[i] = Icon;

        // Cooldown overlay (semi-transparent dark overlay for radial sweep)
        UImage* CooldownOverlay = NewObject<UImage>(SlotOverlay);
        CooldownOverlay->SetColorAndOpacity(FLinearColor(0.0f, 0.0f, 0.0f, 0.6f));
        CooldownOverlay->SetVisibility(ESlateVisibility::Collapsed);
        UOverlaySlot* CooldownSlot = SlotOverlay->AddChildToOverlay(CooldownOverlay);
        CooldownSlot->SetHorizontalAlignment(HAlign_Fill);
        CooldownSlot->SetVerticalAlignment(VAlign_Fill);
        CooldownOverlays[i] = CooldownOverlay;

        // Key number label (1-9)
        UTextBlock* KeyLabel = NewObject<UTextBlock>(SlotOverlay);
        KeyLabel->SetText(FText::FromString(FString::Printf(TEXT("%d"), i + 1)));
        FSlateFontInfo KeyFont = KeyLabel->GetFont();
        KeyFont.Size = 10;
        KeyLabel->SetFont(KeyFont);
        KeyLabel->SetColorAndOpacity(FSlateColor(FLinearColor(0.7f, 0.7f, 0.7f)));
        UOverlaySlot* KeySlot = SlotOverlay->AddChildToOverlay(KeyLabel);
        KeySlot->SetHorizontalAlignment(HAlign_Left);
        KeySlot->SetVerticalAlignment(VAlign_Top);
        SlotKeyLabels[i] = KeyLabel;

        // Add slot to container with spacing
        UHorizontalBoxSlot* HSlot = SlotsContainer->AddChildToHorizontalBox(SlotOverlay);
        HSlot->SetPadding(FMargin(2.0f, 0.0f));
        HSlot->SetHorizontalAlignment(HAlign_Center);
        HSlot->SetVerticalAlignment(VAlign_Center);
    }
}

void UInsimulActionQuickBar::UpdateSlotVisual(int32 SlotIndex)
{
    if (!IsValidSlotIndex(SlotIndex)) return;

    // Update cooldown overlay visibility and opacity
    if (CooldownOverlays.IsValidIndex(SlotIndex) && CooldownOverlays[SlotIndex])
    {
        if (Slots[SlotIndex].bOnCooldown && CooldownTotal[SlotIndex] > 0.0f)
        {
            float CooldownPercent = CooldownRemaining[SlotIndex] / CooldownTotal[SlotIndex];
            CooldownOverlays[SlotIndex]->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
            CooldownOverlays[SlotIndex]->SetRenderOpacity(CooldownPercent);
        }
        else
        {
            CooldownOverlays[SlotIndex]->SetVisibility(ESlateVisibility::Collapsed);
        }
    }
}
