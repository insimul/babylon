#include "InsimulMinimap.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Components/TextBlock.h"
#include "Components/Button.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/PlayerController.h"
#include "Blueprint/WidgetLayoutLibrary.h"

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

void UInsimulMinimap::NativeConstruct()
{
    Super::NativeConstruct();

    // Default zoom levels: 5000, 10000, 20000 (UE units ~ 50m, 100m, 200m)
    if (ZoomLevels.Num() == 0)
    {
        ZoomLevels.Add(5000.f);
        ZoomLevels.Add(10000.f);
        ZoomLevels.Add(20000.f);
    }

    // Bind optional button delegates
    if (LegendButton)
    {
        LegendButton->OnClicked.AddDynamic(this, &UInsimulMinimap::ToggleLegend);
    }
    if (FullscreenButton)
    {
        FullscreenButton->OnClicked.AddDynamic(this, &UInsimulMinimap::HandleFullscreenClicked);
    }
    if (CollapseButton)
    {
        CollapseButton->OnClicked.AddDynamic(this, &UInsimulMinimap::ToggleCollapse);
    }

    // Legend starts hidden
    if (LegendPanel)
    {
        LegendPanel->SetVisibility(ESlateVisibility::Collapsed);
    }

    InitializeMinimap();
}

void UInsimulMinimap::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
    Super::NativeTick(MyGeometry, InDeltaTime);
    UpdateCapturePosition(InDeltaTime);
    RefreshMarkers();
    UpdateCompass();
    UpdatePulsingMarkers(InDeltaTime);
}

// ─────────────────────────────────────────────
// Right-click teleport
// ─────────────────────────────────────────────

FReply UInsimulMinimap::NativeOnMouseButtonDown(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent)
{
    if (InMouseEvent.GetEffectingButton() == EKeys::RightMouseButton)
    {
        // Convert click to local minimap coordinates
        FVector2D LocalPos = InGeometry.AbsoluteToLocal(InMouseEvent.GetScreenSpacePosition());
        float HalfSize = MinimapSize * 0.5f;
        float CenteredX = LocalPos.X - HalfSize;
        float CenteredY = LocalPos.Y - HalfSize;

        if (FMath::Abs(CenteredX) <= HalfSize && FMath::Abs(CenteredY) <= HalfSize)
        {
            float ZoomRange = ZoomLevels.IsValidIndex(CurrentZoomIndex) ? ZoomLevels[CurrentZoomIndex] : 10000.f;
            float WorldX = (CenteredX / HalfSize) * (ZoomRange * 0.5f);
            float WorldY = -(CenteredY / HalfSize) * (ZoomRange * 0.5f);

            // Offset by player position
            APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
            if (Pawn)
            {
                FVector PlayerPos = Pawn->GetActorLocation();
                WorldX += PlayerPos.X;
                WorldY += PlayerPos.Y;
            }

            ShowTeleportDialog(WorldX, WorldY);
        }
        return FReply::Handled();
    }
    return Super::NativeOnMouseButtonDown(InGeometry, InMouseEvent);
}

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────

void UInsimulMinimap::InitializeMinimap()
{
    // Create render target if not assigned
    if (!MinimapRenderTarget)
    {
        MinimapRenderTarget = NewObject<UTextureRenderTarget2D>(this);
        MinimapRenderTarget->InitAutoFormat(512, 512);
        MinimapRenderTarget->UpdateResourceImmediate(true);
    }

    CreateSceneCapture();

    // Bind render target to the minimap image widget
    if (MinimapImage && MinimapRenderTarget)
    {
        FSlateBrush Brush;
        Brush.SetResourceObject(MinimapRenderTarget);
        Brush.ImageSize = FVector2D(MinimapSize, MinimapSize);
        MinimapImage->SetBrush(Brush);
    }
}

void UInsimulMinimap::CreateSceneCapture()
{
    UWorld* World = GetWorld();
    if (!World) return;

    // Spawn a helper actor to hold the scene capture component
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    CaptureActor = World->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
    if (!CaptureActor) return;

    USceneComponent* Root = NewObject<USceneComponent>(CaptureActor, TEXT("Root"));
    CaptureActor->SetRootComponent(Root);
    Root->RegisterComponent();

    USceneCaptureComponent2D* Capture = NewObject<USceneCaptureComponent2D>(CaptureActor, TEXT("MinimapCapture"));
    Capture->SetupAttachment(Root);
    Capture->RegisterComponent();

    // Orthographic top-down
    Capture->ProjectionType = ECameraProjectionMode::Orthographic;
    Capture->OrthoWidth = ZoomLevels.IsValidIndex(CurrentZoomIndex) ? ZoomLevels[CurrentZoomIndex] : 10000.f;
    Capture->SetRelativeRotation(FRotator(-90.f, 0.f, 0.f)); // Look straight down
    Capture->TextureTarget = MinimapRenderTarget;
    Capture->CaptureSource = ESceneCaptureSource::SCS_FinalColorLDR;

    // Smart capture: don't capture every frame — we trigger manually
    Capture->bCaptureEveryFrame = false;
    Capture->bCaptureOnMovement = false;

    // Hide player pawn from minimap capture
    APawn* PlayerPawn = UGameplayStatics::GetPlayerPawn(World, 0);
    if (PlayerPawn)
    {
        Capture->HiddenActors.Add(PlayerPawn);
    }

    // Initial capture
    ScheduleCapture();
}

// ─────────────────────────────────────────────
// Smart capture scheduling
// ─────────────────────────────────────────────

void UInsimulMinimap::ScheduleCapture()
{
    if (!CaptureActor) return;

    USceneCaptureComponent2D* Capture = CaptureActor->FindComponentByClass<USceneCaptureComponent2D>();
    if (Capture)
    {
        Capture->CaptureScene();
    }
}

// ─────────────────────────────────────────────
// Per-tick updates
// ─────────────────────────────────────────────

void UInsimulMinimap::UpdateCapturePosition(float DeltaTime)
{
    if (!CaptureActor) return;

    APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
    if (!Pawn) return;

    FVector Pos = Pawn->GetActorLocation();
    float Height = ZoomLevels.IsValidIndex(CurrentZoomIndex) ? ZoomLevels[CurrentZoomIndex] : 10000.f;

    // Smart capture: only re-render when player moves > CaptureThreshold or enough time passes
    float DistSq = FVector::DistSquared(FVector(Pos.X, Pos.Y, 0.f), FVector(LastCapturePosition.X, LastCapturePosition.Y, 0.f));
    double Now = FPlatformTime::Seconds();

    if (DistSq > CaptureThreshold * CaptureThreshold && (Now - LastCaptureTime) > CaptureInterval)
    {
        CaptureActor->SetActorLocation(FVector(Pos.X, Pos.Y, Pos.Z + Height));
        LastCapturePosition = Pos;
        LastCaptureTime = Now;
        ScheduleCapture();
    }
}

void UInsimulMinimap::RefreshMarkers()
{
    if (!MarkerCanvas) return;

    // Clear existing dynamic marker widgets
    MarkerCanvas->ClearChildren();

    // Re-add player arrow
    if (PlayerArrow)
    {
        MarkerCanvas->AddChild(PlayerArrow);
        UCanvasPanelSlot* ArrowSlot = Cast<UCanvasPanelSlot>(PlayerArrow->Slot);
        if (ArrowSlot)
        {
            ArrowSlot->SetPosition(FVector2D(MinimapSize * 0.5f, MinimapSize * 0.5f));
            ArrowSlot->SetAlignment(FVector2D(0.5f, 0.5f));
        }

        // Rotate player arrow with camera yaw
        APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
        if (PC)
        {
            float Yaw = PC->GetControlRotation().Yaw;
            PlayerArrow->SetRenderTransformAngle(Yaw);
        }
    }

    // Place each marker
    for (const FMinimapMarker& Marker : Markers)
    {
        FVector2D ScreenPos = WorldToMinimap(Marker.WorldPosition);

        // Skip markers outside the minimap bounds
        FVector2D Center(MinimapSize * 0.5f, MinimapSize * 0.5f);
        float Dist = FVector2D::Distance(ScreenPos, Center);
        if (Dist > MinimapSize * 0.45f) continue;

        float DotSize = GetMarkerSize(Marker.Type);

        // Determine color: use custom if valid, else default
        FLinearColor MarkerColor = (Marker.CustomColor.R >= 0.f)
            ? Marker.CustomColor
            : GetMarkerColor(Marker.Type);

        UImage* Dot = NewObject<UImage>(this);

        // Exclamation markers: show "!" text overlay
        if (Marker.Type == EMinimapMarkerType::Exclamation)
        {
            Dot->SetColorAndOpacity(MarkerColor);
            // Pulsing handled in UpdatePulsingMarkers
            if (!PulsingMarkerPhases.Contains(Marker.Id))
            {
                PulsingMarkerPhases.Add(Marker.Id, 0.f);
            }
        }
        else
        {
            Dot->SetColorAndOpacity(MarkerColor);
        }

        // Diamond rotation for location-based quest objectives
        if (Marker.Type == EMinimapMarkerType::QuestObjective && Marker.Shape == EMinimapMarkerShape::Diamond)
        {
            Dot->SetRenderTransformAngle(45.f);
        }

        FSlateBrush DotBrush;
        DotBrush.ImageSize = FVector2D(DotSize, DotSize);
        DotBrush.TintColor = FSlateColor(MarkerColor);
        Dot->SetBrush(DotBrush);

        MarkerCanvas->AddChild(Dot);
        UCanvasPanelSlot* DotSlot = Cast<UCanvasPanelSlot>(Dot->Slot);
        if (DotSlot)
        {
            DotSlot->SetPosition(ScreenPos);
            DotSlot->SetSize(FVector2D(DotSize, DotSize));
            DotSlot->SetAlignment(FVector2D(0.5f, 0.5f));
        }

        // Add "!" text for exclamation markers
        if (Marker.Type == EMinimapMarkerType::Exclamation)
        {
            UTextBlock* ExclamText = NewObject<UTextBlock>(this);
            ExclamText->SetText(FText::FromString(TEXT("!")));
            ExclamText->SetColorAndOpacity(FSlateColor(FLinearColor::Black));

            FSlateFontInfo FontInfo = ExclamText->GetFont();
            FontInfo.Size = 9;
            ExclamText->SetFont(FontInfo);

            MarkerCanvas->AddChild(ExclamText);
            UCanvasPanelSlot* TextSlot = Cast<UCanvasPanelSlot>(ExclamText->Slot);
            if (TextSlot)
            {
                TextSlot->SetPosition(ScreenPos);
                TextSlot->SetAlignment(FVector2D(0.5f, 0.5f));
            }
        }

        // Add dynamic label below marker if Label is set
        if (!Marker.Label.IsEmpty())
        {
            UTextBlock* LabelText = NewObject<UTextBlock>(this);
            LabelText->SetText(FText::FromString(Marker.Label));
            LabelText->SetColorAndOpacity(FSlateColor(FLinearColor(1.f, 1.f, 1.f, 0.8f)));

            FSlateFontInfo LabelFont = LabelText->GetFont();
            LabelFont.Size = 7;
            LabelText->SetFont(LabelFont);

            MarkerCanvas->AddChild(LabelText);
            UCanvasPanelSlot* LabelSlot = Cast<UCanvasPanelSlot>(LabelText->Slot);
            if (LabelSlot)
            {
                LabelSlot->SetPosition(FVector2D(ScreenPos.X, ScreenPos.Y + DotSize * 0.5f + 2.f));
                LabelSlot->SetAlignment(FVector2D(0.5f, 0.f));
            }
        }
    }
}

void UInsimulMinimap::UpdatePulsingMarkers(float DeltaTime)
{
    // Animate pulsing for exclamation markers
    TArray<FString> ToRemove;
    for (auto& Pair : PulsingMarkerPhases)
    {
        Pair.Value += DeltaTime * PulseSpeed;
        if (Pair.Value > 2.f * PI)
        {
            Pair.Value -= 2.f * PI;
        }

        // Check if marker still exists
        bool bFound = false;
        for (const FMinimapMarker& M : Markers)
        {
            if (M.Id == Pair.Key && M.Type == EMinimapMarkerType::Exclamation)
            {
                bFound = true;
                break;
            }
        }
        if (!bFound)
        {
            ToRemove.Add(Pair.Key);
        }
    }
    for (const FString& Key : ToRemove)
    {
        PulsingMarkerPhases.Remove(Key);
    }
}

void UInsimulMinimap::UpdateCompass()
{
    if (!CompassOverlay) return;

    APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
    if (!PC) return;

    float Yaw = PC->GetControlRotation().Yaw;
    CompassOverlay->SetRenderTransformAngle(-Yaw);
}

// ─────────────────────────────────────────────
// Marker management
// ─────────────────────────────────────────────

void UInsimulMinimap::AddMarker(const FMinimapMarker& NewMarker)
{
    // Update existing marker if Id matches
    for (FMinimapMarker& M : Markers)
    {
        if (M.Id == NewMarker.Id)
        {
            M.Type = NewMarker.Type;
            M.WorldPosition = NewMarker.WorldPosition;
            M.Label = NewMarker.Label;
            M.CustomColor = NewMarker.CustomColor;
            M.Shape = NewMarker.Shape;
            return;
        }
    }

    Markers.Add(NewMarker);
}

void UInsimulMinimap::RemoveMarker(const FString& Id)
{
    Markers.RemoveAll([&Id](const FMinimapMarker& M) { return M.Id == Id; });
    PulsingMarkerPhases.Remove(Id);
}

void UInsimulMinimap::ClearMarkers()
{
    Markers.Empty();
    PulsingMarkerPhases.Empty();
}

// ─────────────────────────────────────────────
// Collapse / expand
// ─────────────────────────────────────────────

void UInsimulMinimap::ToggleCollapse()
{
    bExpanded = !bExpanded;

    if (MinimapImage)
    {
        MinimapImage->SetVisibility(bExpanded ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
    }
    if (MarkerCanvas)
    {
        MarkerCanvas->SetVisibility(bExpanded ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
    }
    if (CompassOverlay)
    {
        CompassOverlay->SetVisibility(bExpanded ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
    }

    // Hide legend when collapsing
    if (!bExpanded)
    {
        bLegendVisible = false;
        if (LegendPanel)
        {
            LegendPanel->SetVisibility(ESlateVisibility::Collapsed);
        }
    }
}

// ─────────────────────────────────────────────
// Legend
// ─────────────────────────────────────────────

void UInsimulMinimap::ToggleLegend()
{
    bLegendVisible = !bLegendVisible;
    if (LegendPanel)
    {
        LegendPanel->SetVisibility(bLegendVisible ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
    }
}

void UInsimulMinimap::ToggleFullscreen()
{
    bIsFullscreen = !bIsFullscreen;

    // In fullscreen mode, the minimap widget size is greatly expanded.
    // The actual resize is handled by the owning HUD/layout, which should
    // listen to OnFullscreenToggle to reposition and resize.
    OnFullscreenToggle.Broadcast();

    UE_LOG(LogTemp, Log, TEXT("[InsimulMinimap] Fullscreen: %s"), bIsFullscreen ? TEXT("true") : TEXT("false"));
}

// ─────────────────────────────────────────────
// Teleport dialog
// ─────────────────────────────────────────────

void UInsimulMinimap::HandleFullscreenClicked()
{
    OnFullscreenToggle.Broadcast();
}

void UInsimulMinimap::ShowTeleportDialog(float WorldX, float WorldZ)
{
    DismissTeleportDialog();

    // For UE, we broadcast the delegate directly with a confirmation
    // handled via blueprint or a simple in-code dialog.
    // In a full implementation this would spawn a confirmation widget.
    // For now, fire the teleport request directly.
    OnTeleportRequest.Broadcast(WorldX, WorldZ);
}

void UInsimulMinimap::DismissTeleportDialog()
{
    if (TeleportDialog)
    {
        TeleportDialog->RemoveFromParent();
        TeleportDialog = nullptr;
    }
}

// ─────────────────────────────────────────────
// Zoom
// ─────────────────────────────────────────────

void UInsimulMinimap::ZoomIn()
{
    if (CurrentZoomIndex > 0)
    {
        CurrentZoomIndex--;
        // Update capture ortho width
        if (CaptureActor)
        {
            USceneCaptureComponent2D* Capture = CaptureActor->FindComponentByClass<USceneCaptureComponent2D>();
            if (Capture)
            {
                Capture->OrthoWidth = ZoomLevels[CurrentZoomIndex];
            }
        }
        ScheduleCapture();
    }
}

void UInsimulMinimap::ZoomOut()
{
    if (CurrentZoomIndex < ZoomLevels.Num() - 1)
    {
        CurrentZoomIndex++;
        if (CaptureActor)
        {
            USceneCaptureComponent2D* Capture = CaptureActor->FindComponentByClass<USceneCaptureComponent2D>();
            if (Capture)
            {
                Capture->OrthoWidth = ZoomLevels[CurrentZoomIndex];
            }
        }
        ScheduleCapture();
    }
}

void UInsimulMinimap::SetVisible(bool bVisible)
{
    SetVisibility(bVisible ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);

    // Hide legend when hiding minimap
    if (!bVisible)
    {
        bLegendVisible = false;
        if (LegendPanel)
        {
            LegendPanel->SetVisibility(ESlateVisibility::Collapsed);
        }
    }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

FVector2D UInsimulMinimap::WorldToMinimap(FVector WorldPos) const
{
    APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
    if (!Pawn) return FVector2D(MinimapSize * 0.5f, MinimapSize * 0.5f);

    FVector PlayerPos = Pawn->GetActorLocation();
    float ZoomRange = ZoomLevels.IsValidIndex(CurrentZoomIndex) ? ZoomLevels[CurrentZoomIndex] : 10000.f;

    // Offset in world space
    float DX = WorldPos.X - PlayerPos.X;
    float DY = WorldPos.Y - PlayerPos.Y;

    // Map to minimap pixel coordinates (centered)
    float HalfSize = MinimapSize * 0.5f;
    float Scale = MinimapSize / ZoomRange;

    return FVector2D(
        HalfSize + DX * Scale,
        HalfSize - DY * Scale  // Y is inverted in screen space
    );
}

FLinearColor UInsimulMinimap::GetMarkerColor(EMinimapMarkerType Type) const
{
    switch (Type)
    {
    case EMinimapMarkerType::Player:        return FLinearColor(0.f, 1.f, 1.f, 1.f);      // Cyan
    case EMinimapMarkerType::NPC:           return FLinearColor(1.f, 1.f, 0.f, 1.f);      // Yellow
    case EMinimapMarkerType::Settlement:    return FLinearColor(1.f, 0.65f, 0.f, 1.f);    // Orange
    case EMinimapMarkerType::Quest:         return FLinearColor(1.f, 0.f, 1.f, 1.f);      // Magenta
    case EMinimapMarkerType::Building:      return FLinearColor(0.5f, 0.5f, 0.5f, 1.f);   // Gray
    case EMinimapMarkerType::WaterFeatures: return FLinearColor(0.2f, 0.4f, 0.8f, 1.f);   // Blue
    case EMinimapMarkerType::QuestObjective:return FLinearColor(0.f, 0.74f, 0.83f, 1.f);  // #00BCD4
    case EMinimapMarkerType::Exclamation:   return FLinearColor(1.f, 0.8f, 0.f, 1.f);     // #ffcc00
    case EMinimapMarkerType::Discovery:     return FLinearColor(0.506f, 0.78f, 0.518f, 1.f); // #81C784
    default:                                return FLinearColor::White;
    }
}

float UInsimulMinimap::GetMarkerSize(EMinimapMarkerType Type) const
{
    switch (Type)
    {
    case EMinimapMarkerType::Player:         return 6.f;
    case EMinimapMarkerType::Settlement:     return 8.f;
    case EMinimapMarkerType::Quest:          return 7.f;
    case EMinimapMarkerType::QuestObjective: return 5.f;
    case EMinimapMarkerType::Discovery:      return 6.f;
    case EMinimapMarkerType::Building:       return 3.f;
    case EMinimapMarkerType::NPC:            return 4.f;
    case EMinimapMarkerType::WaterFeatures:  return 4.f;
    case EMinimapMarkerType::Exclamation:    return 12.f;
    default:                                 return 4.f;
    }
}
