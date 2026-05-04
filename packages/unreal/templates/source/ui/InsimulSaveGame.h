#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "InsimulSaveGame.generated.h"

/**
 * Save Game object — auto-generated from Insimul export pipeline.
 * Stores player state, inventory, quest progress, and world data
 * for serialization to named save slots.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulSaveGame : public USaveGame
{
    GENERATED_BODY()

public:
    UInsimulSaveGame();

    /** Display name shown in save/load UI (e.g., date/time) */
    UPROPERTY(VisibleAnywhere, Category = "SaveData")
    FString SaveDisplayName;

    /** Timestamp when the save was created */
    UPROPERTY(VisibleAnywhere, Category = "SaveData")
    FDateTime SaveTimestamp;

    // ── Player State ──

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Player")
    FVector PlayerLocation;

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Player")
    FRotator PlayerRotation;

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Player")
    float PlayerHealth = 100.f;

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Player")
    float PlayerEnergy = 100.f;

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Player")
    int32 PlayerGold = 0;

    // ── Quest Progress ──

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Quests")
    TArray<FString> ActiveQuestIds;

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Quests")
    TArray<FString> CompletedQuestIds;

    // ── Inventory ──

    UPROPERTY(VisibleAnywhere, Category = "SaveData|Inventory")
    TArray<FString> InventoryItemIds;

    // ── World State ──

    UPROPERTY(VisibleAnywhere, Category = "SaveData|World")
    FString CurrentLevelName;

    UPROPERTY(VisibleAnywhere, Category = "SaveData|World")
    float PlayTimeSeconds = 0.f;
};
