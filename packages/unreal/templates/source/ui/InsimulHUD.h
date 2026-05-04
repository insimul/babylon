#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "InsimulHUD.generated.h"

class UInsimulMinimap;

/**
 * Insimul HUD — owns and manages the minimap widget.
 *
 * Set as the HUD class in AInsimulGameMode to have the minimap appear
 * automatically on BeginPlay.
 */
UCLASS()
class INSIMULEXPORT_API AInsimulHUD : public AHUD
{
    GENERATED_BODY()

public:
    /** Widget class to spawn for the minimap (set in Defaults or Blueprint). */
    UPROPERTY(EditDefaultsOnly, Category = "HUD")
    TSubclassOf<UInsimulMinimap> MinimapWidgetClass;

    /** The live minimap widget instance. */
    UPROPERTY(BlueprintReadOnly, Category = "HUD")
    UInsimulMinimap* MinimapWidget = nullptr;

    UFUNCTION(BlueprintCallable, Category = "HUD")
    void ToggleMinimap();

    UFUNCTION(BlueprintCallable, Category = "HUD")
    void MinimapZoomIn();

    UFUNCTION(BlueprintCallable, Category = "HUD")
    void MinimapZoomOut();

protected:
    virtual void BeginPlay() override;
};
