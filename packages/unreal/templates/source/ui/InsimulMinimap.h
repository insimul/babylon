#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/Image.h"
#include "Components/CanvasPanel.h"
#include "Components/Overlay.h"
#include "Components/Button.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Engine/TextureRenderTarget2D.h"
#include "InsimulMinimap.generated.h"

/**
 * Marker type for minimap icons.
 * Matches the Babylon source of truth: player, npc, settlement, building,
 * water_features, quest, quest_objective, exclamation, discovery.
 */
UENUM(BlueprintType)
enum class EMinimapMarkerType : uint8
{
    Player          UMETA(DisplayName = "Player"),
    NPC             UMETA(DisplayName = "NPC"),
    Settlement      UMETA(DisplayName = "Settlement"),
    Building        UMETA(DisplayName = "Building"),
    WaterFeatures   UMETA(DisplayName = "Water Features"),
    Quest           UMETA(DisplayName = "Quest"),
    QuestObjective  UMETA(DisplayName = "Quest Objective"),
    Exclamation     UMETA(DisplayName = "Exclamation"),
    Discovery       UMETA(DisplayName = "Discovery"),
};

/** Shape hint for quest_objective markers. */
UENUM(BlueprintType)
enum class EMinimapMarkerShape : uint8
{
    Circle  UMETA(DisplayName = "Circle"),
    Diamond UMETA(DisplayName = "Diamond"),
};

/** A single marker on the minimap. */
USTRUCT(BlueprintType)
struct FMinimapMarker
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString Id;
    UPROPERTY(BlueprintReadWrite) EMinimapMarkerType Type = EMinimapMarkerType::Building;
    UPROPERTY(BlueprintReadWrite) FVector WorldPosition = FVector::ZeroVector;
    UPROPERTY(BlueprintReadWrite) FString Label;
    UPROPERTY(BlueprintReadWrite) FLinearColor CustomColor = FLinearColor(-1.f, -1.f, -1.f, 1.f);
    UPROPERTY(BlueprintReadWrite) EMinimapMarkerShape Shape = EMinimapMarkerShape::Circle;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnTeleportRequest, float, WorldX, float, WorldZ);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnFullscreenToggle);

/**
 * UMG minimap widget.
 *
 * Uses a SceneCaptureComponent2D (owned by a helper actor) to render a
 * top-down view into a RenderTarget, displayed inside a rectangular mask.
 * Overlay markers track actors and POIs. Smart capture scheduling only
 * re-renders when the player moves >5 units or every 500ms.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulMinimap : public UUserWidget
{
    GENERATED_BODY()

public:
    // ── Configuration ──────────────────────────────────────────────

    /** Render target that receives the top-down capture. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Minimap")
    UTextureRenderTarget2D* MinimapRenderTarget;

    /** Minimap widget size in pixels. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Minimap")
    float MinimapSize = {{MINIMAP_SIZE}};

    /** Available zoom distances (world units from camera to ground). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Minimap")
    TArray<float> ZoomLevels;

    /** Index into ZoomLevels. */
    UPROPERTY(BlueprintReadOnly, Category = "Minimap")
    int32 CurrentZoomIndex = 1;

    /** World units the player must move before triggering a re-capture. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Minimap")
    float CaptureThreshold = 5.f;

    /** Minimum seconds between captures. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Minimap")
    float CaptureInterval = 0.5f;

    // ── Markers ────────────────────────────────────────────────────

    /** Active markers rendered on the overlay. */
    UPROPERTY(BlueprintReadOnly, Category = "Minimap")
    TArray<FMinimapMarker> Markers;

    // ── Events ─────────────────────────────────────────────────────

    /** Fired when the player confirms a right-click teleport. */
    UPROPERTY(BlueprintAssignable, Category = "Minimap")
    FOnTeleportRequest OnTeleportRequest;

    /** Fired when the fullscreen toggle button is clicked. */
    UPROPERTY(BlueprintAssignable, Category = "Minimap")
    FOnFullscreenToggle OnFullscreenToggle;

    // ── Blueprint-bindable widgets (set via BindWidget) ────────────

    UPROPERTY(meta = (BindWidget)) UImage* MinimapImage;
    UPROPERTY(meta = (BindWidget)) UCanvasPanel* MarkerCanvas;
    UPROPERTY(meta = (BindWidget)) UImage* PlayerArrow;
    UPROPERTY(meta = (BindWidget)) UOverlay* CompassOverlay;
    UPROPERTY(meta = (BindWidgetOptional)) UButton* LegendButton;
    UPROPERTY(meta = (BindWidgetOptional)) UButton* FullscreenButton;
    UPROPERTY(meta = (BindWidgetOptional)) UButton* CollapseButton;
    UPROPERTY(meta = (BindWidgetOptional)) UVerticalBox* LegendPanel;

    // ── Public API ─────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void InitializeMinimap();

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void AddMarker(const FMinimapMarker& Marker);

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void RemoveMarker(const FString& Id);

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void ClearMarkers();

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void ZoomIn();

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void ZoomOut();

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void SetVisible(bool bVisible);

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void ToggleCollapse();

    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void ToggleLegend();

    /** Toggle between normal minimap and fullscreen map view */
    UFUNCTION(BlueprintCallable, Category = "Minimap")
    void ToggleFullscreen();

protected:
    virtual void NativeConstruct() override;
    virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;
    virtual FReply NativeOnMouseButtonDown(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent) override;

private:
    /** Spawned scene-capture actor (orthographic, top-down). */
    UPROPERTY() AActor* CaptureActor = nullptr;

    bool bExpanded = true;
    bool bLegendVisible = false;
    bool bIsFullscreen = false;

    /** Marker label text widgets keyed by marker ID */
    TMap<FString, UTextBlock*> MarkerLabels;

    // Smart capture state
    FVector LastCapturePosition = FVector(TNumericLimits<float>::Max());
    double LastCaptureTime = 0.0;

    // Pulsing exclamation markers
    TMap<FString, float> PulsingMarkerPhases;
    float PulseSpeed = 1.5f;

    // Teleport dialog
    UPROPERTY() UUserWidget* TeleportDialog = nullptr;

    void CreateSceneCapture();
    void UpdateCapturePosition(float DeltaTime);
    void RefreshMarkers();
    void UpdateCompass();
    void UpdatePulsingMarkers(float DeltaTime);
    void ScheduleCapture();
    void ShowTeleportDialog(float WorldX, float WorldZ);
    void DismissTeleportDialog();

    UFUNCTION() void HandleFullscreenClicked();
    FVector2D WorldToMinimap(FVector WorldPos) const;
    FLinearColor GetMarkerColor(EMinimapMarkerType Type) const;
    float GetMarkerSize(EMinimapMarkerType Type) const;
};
