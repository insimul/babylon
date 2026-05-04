#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "InsimulMainMenuGameMode.generated.h"

class UInsimulMainMenuWidget;

/**
 * Game Mode for the Main Menu level.
 * Creates and displays the main menu widget on BeginPlay.
 * Configured as the default game mode for the MainMenu map.
 */
UCLASS()
class INSIMULEXPORT_API AInsimulMainMenuGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AInsimulMainMenuGameMode();

    virtual void BeginPlay() override;

    /** The title shown on the main menu (set from WorldIR) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|MainMenu")
    FString MenuTitle = TEXT("{{MENU_TITLE}}");

    /** Background image asset path */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|MainMenu")
    FString BackgroundImagePath = TEXT("{{MENU_BACKGROUND}}");

private:
    UPROPERTY()
    UInsimulMainMenuWidget* MainMenuWidget;
};
