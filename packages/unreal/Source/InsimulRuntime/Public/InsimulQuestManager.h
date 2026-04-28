// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "InsimulQuestWidget.h"
#include "InsimulQuestManager.generated.h"

/**
 * Game Instance Subsystem that manages the quest UI
 * Automatically creates and updates the quest widget
 */
UCLASS(Config=Game)
class INSIMULRUNTIME_API UInsimulQuestManager : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/**
	 * Show the quest panel for a character
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void ShowQuestPanel(const FString& CharacterId);

	/**
	 * Hide the quest panel
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void HideQuestPanel();

	/**
	 * Toggle quest panel visibility
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void ToggleQuestPanel();

	/**
	 * Check if quest panel is visible
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	bool IsQuestPanelVisible() const;

	/**
	 * Get the quest widget instance
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	UInsimulQuestWidget* GetQuestWidget() const { return QuestWidget; }

	/**
	 * Configure the quest system
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void ConfigureQuestSystem(const FString& ServerURL, bool bAutoRefresh = true, float RefreshInterval = 5.0f);

	/**
	 * Widget class to use for quest panel (set in Project Settings or override in Blueprint)
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "Quest")
	TSubclassOf<UInsimulQuestWidget> QuestWidgetClass;

protected:
	void CreateQuestWidget();

private:
	UPROPERTY()
	UInsimulQuestWidget* QuestWidget;

	FString CurrentCharacterId;
	bool bIsVisible = false;
};

/**
 * Component to automatically show quests for the owning character
 * Attach to player character to automatically display their quests
 */
UCLASS(BlueprintType, ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class INSIMULRUNTIME_API UInsimulQuestDisplayComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UInsimulQuestDisplayComponent();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:
	/**
	 * Automatically show quest panel on begin play
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	bool bAutoShowOnBeginPlay = true;

	/**
	 * Hide quest panel when this component is destroyed
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	bool bAutoHideOnEndPlay = true;

	/**
	 * Get character ID from this actor's InsimulCharacterMappingComponent
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	bool bUseCharacterMapping = true;

	/**
	 * Manual character ID override (if not using character mapping)
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	FString CharacterIdOverride;

	/**
	 * Quest panel screen position
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	FVector2D ScreenPosition = FVector2D(50, 50);

	/**
	 * Show/hide the quest panel
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void SetQuestPanelVisible(bool bVisible);

	/**
	 * Refresh the quest display
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void RefreshQuests();
};

/**
 * HUD component for displaying quests
 * Add to your HUD class to automatically manage quest display
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulQuestHUDComponent : public UObject
{
	GENERATED_BODY()

public:
	/**
	 * Initialize the quest HUD component
	 */
	void Initialize(UWorld* World, APlayerController* PlayerController);

	/**
	 * Update quest display for current player character
	 */
	void UpdateForPlayerCharacter();

	/**
	 * Create and show quest widget
	 */
	void ShowQuests(const FString& CharacterId);

	/**
	 * Hide quest widget
	 */
	void HideQuests();

	/**
	 * Toggle quest visibility
	 */
	void ToggleQuests();

	/**
	 * Widget class for quests
	 */
	UPROPERTY(EditAnywhere, Category = "Quest")
	TSubclassOf<UInsimulQuestWidget> QuestWidgetClass;

	/**
	 * Current quest widget instance
	 */
	UPROPERTY()
	UInsimulQuestWidget* QuestWidget;

	/**
	 * Quest panel anchor position (0-1 for screen space)
	 */
	UPROPERTY(EditAnywhere, Category = "Quest")
	FVector2D AnchorPosition = FVector2D(1.0f, 0.0f); // Top-right

	/**
	 * Quest panel offset from anchor
	 */
	UPROPERTY(EditAnywhere, Category = "Quest")
	FVector2D Offset = FVector2D(-20.0f, 20.0f);

protected:
	UPROPERTY()
	UWorld* CachedWorld;

	UPROPERTY()
	APlayerController* CachedPlayerController;
};
