// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Http.h"
#include "Blueprint/UserWidget.h"
#include "InsimulQuestWidget.generated.h"

/**
 * Structure representing an Insimul quest
 */
USTRUCT(BlueprintType)
struct FInsimulQuest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString Title;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString Description;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString QuestType;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString Difficulty;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString Status;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString TargetLanguage;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString AssignedBy;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	int32 ExperienceReward;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString AssignedAt;

	UPROPERTY(BlueprintReadOnly, Category = "Quest")
	FString CompletedAt;
};

/**
 * Widget for displaying Insimul quest list
 * Similar to the chat box, shows quests and their completion status
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulQuestWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

	/**
	 * Load quests for a specific player character
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void LoadQuestsForCharacter(const FString& CharacterId);

	/**
	 * Load quests for a player by name
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void LoadQuestsForPlayer(const FString& PlayerName);

	/**
	 * Refresh the quest list
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void RefreshQuests();

	/**
	 * Set the Insimul server URL
	 */
	UFUNCTION(BlueprintCallable, Category = "Quest")
	void SetServerURL(const FString& URL);

	/**
	 * Called when quests are loaded successfully
	 */
	UFUNCTION(BlueprintImplementableEvent, Category = "Quest")
	void OnQuestsLoaded(const TArray<FInsimulQuest>& Quests);

	/**
	 * Called when a quest is updated
	 */
	UFUNCTION(BlueprintImplementableEvent, Category = "Quest")
	void OnQuestUpdated(const FInsimulQuest& Quest);

	/**
	 * Called when quest loading fails
	 */
	UFUNCTION(BlueprintImplementableEvent, Category = "Quest")
	void OnQuestLoadFailed(const FString& ErrorMessage);

	/**
	 * Get all loaded quests
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	TArray<FInsimulQuest> GetQuests() const { return LoadedQuests; }

	/**
	 * Get active quests only
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	TArray<FInsimulQuest> GetActiveQuests() const;

	/**
	 * Get completed quests only
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	TArray<FInsimulQuest> GetCompletedQuests() const;

	/**
	 * Enable auto-refresh
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	bool bAutoRefresh = true;

	/**
	 * Auto-refresh interval in seconds
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Quest")
	float RefreshInterval = 5.0f;

protected:
	void OnQuestsLoadedInternal(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void ParseQuestsFromJSON(const FString& JSONString);

private:
	UPROPERTY()
	TArray<FInsimulQuest> LoadedQuests;

	FString InsimulServerURL = TEXT("http://localhost:8080");
	FString CurrentCharacterId;
	FString CurrentPlayerName;
	float TimeSinceLastRefresh = 0.0f;
	bool bIsLoadingQuests = false;
};

/**
 * Blueprint function library for quest utilities
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulQuestBlueprintLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Get quest status color for UI
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	static FLinearColor GetQuestStatusColor(const FString& Status);

	/**
	 * Get quest difficulty color for UI
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	static FLinearColor GetQuestDifficultyColor(const FString& Difficulty);

	/**
	 * Get quest type icon name
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	static FString GetQuestTypeIcon(const FString& QuestType);

	/**
	 * Format quest description for display (truncate if too long)
	 */
	UFUNCTION(BlueprintPure, Category = "Quest")
	static FString FormatQuestDescription(const FString& Description, int32 MaxLength = 100);
};
