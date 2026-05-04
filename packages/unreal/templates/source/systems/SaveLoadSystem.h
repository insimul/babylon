#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SaveLoadSystem.generated.h"

USTRUCT(BlueprintType)
struct FSaveSlotInfo
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString SlotName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString DisplayName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FDateTime Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PlaytimeSeconds = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PlayerLevel = 1;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSaveCompleted, const FString&, SlotName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLoadCompleted, const FString&, SlotName);

/**
 * Save/load system with manual saves, auto-save, and slot management.
 */
UCLASS()
class INSIMULEXPORT_API USaveLoadSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Save the game to a named slot */
    UFUNCTION(BlueprintCallable, Category = "Insimul|SaveLoad")
    void SaveGame(const FString& SlotName);

    /** Load the game from a named slot */
    UFUNCTION(BlueprintCallable, Category = "Insimul|SaveLoad")
    bool LoadGame(const FString& SlotName);

    /** Delete a save file */
    UFUNCTION(BlueprintCallable, Category = "Insimul|SaveLoad")
    void DeleteSave(const FString& SlotName);

    /** Get info for all save slots */
    UFUNCTION(BlueprintCallable, Category = "Insimul|SaveLoad")
    TArray<FSaveSlotInfo> GetSaveSlots() const;

    /** Check if a save exists in the given slot */
    UFUNCTION(BlueprintPure, Category = "Insimul|SaveLoad")
    bool HasSaveInSlot(const FString& SlotName) const;

    /** Trigger an auto-save */
    UFUNCTION(BlueprintCallable, Category = "Insimul|SaveLoad")
    void AutoSave();

    /** Auto-save interval in seconds */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|SaveLoad")
    float AutoSaveIntervalSeconds = 300.0f;

    /** Maximum number of auto-save slots to keep */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|SaveLoad")
    int32 MaxAutoSaves = 3;

    /** Whether to show a save indicator in the UI */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|SaveLoad")
    bool bShowSaveIndicator = true;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|SaveLoad")
    FOnSaveCompleted OnSaveCompleted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|SaveLoad")
    FOnLoadCompleted OnLoadCompleted;

private:
    /** Time of the last auto-save */
    float LastAutoSaveTime = 0.0f;

    /** Current auto-save index for rotation */
    int32 AutoSaveIndex = 0;

    /** User index for UE5 save system (single player = 0) */
    static constexpr int32 UserIndex = 0;
};
