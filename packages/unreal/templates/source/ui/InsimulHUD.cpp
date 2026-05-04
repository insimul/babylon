#include "InsimulHUD.h"
#include "InsimulMinimap.h"
#include "Blueprint/UserWidget.h"

void AInsimulHUD::BeginPlay()
{
    Super::BeginPlay();

    if (!MinimapWidgetClass)
    {
        UE_LOG(LogTemp, Warning, TEXT("[InsimulHUD] MinimapWidgetClass not set — skipping minimap creation"));
        return;
    }

    APlayerController* PC = GetOwningPlayerController();
    if (!PC) return;

    MinimapWidget = CreateWidget<UInsimulMinimap>(PC, MinimapWidgetClass);
    if (MinimapWidget)
    {
        MinimapWidget->AddToViewport(10); // High Z-order so it draws on top
        UE_LOG(LogTemp, Log, TEXT("[InsimulHUD] Minimap widget created"));
    }
}

void AInsimulHUD::ToggleMinimap()
{
    if (!MinimapWidget) return;

    bool bCurrentlyVisible = MinimapWidget->GetVisibility() != ESlateVisibility::Collapsed;
    MinimapWidget->SetVisible(!bCurrentlyVisible);
}

void AInsimulHUD::MinimapZoomIn()
{
    if (MinimapWidget) MinimapWidget->ZoomIn();
}

void AInsimulHUD::MinimapZoomOut()
{
    if (MinimapWidget) MinimapWidget->ZoomOut();
}
