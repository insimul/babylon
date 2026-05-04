#include "SaveLoadSystem.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/SaveGame.h"
#include "Misc/DateTime.h"

void USaveLoadSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LastAutoSaveTime = 0.0f;
    AutoSaveIndex = 0;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SaveLoadSystem initialized (auto-save interval: %.0fs, max: %d)"),
           AutoSaveIntervalSeconds, MaxAutoSaves);
}

void USaveLoadSystem::Deinitialize()
{
    Super::Deinitialize();
}

void USaveLoadSystem::SaveGame(const FString& SlotName)
{
    // Create a SaveGame object and populate it with game state
    USaveGame* SaveGameObj = UGameplayStatics::CreateSaveGameObject(USaveGame::StaticClass());
    if (!SaveGameObj)
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to create SaveGame object"));
        return;
    }

    // TODO: Serialize all subsystem states (inventory, quests, truths, reputation, etc.)
    // into the SaveGame object's properties

    bool bSuccess = UGameplayStatics::SaveGameToSlot(SaveGameObj, SlotName, UserIndex);

    if (bSuccess)
    {
        OnSaveCompleted.Broadcast(SlotName);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Game saved to slot: %s"), *SlotName);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to save game to slot: %s"), *SlotName);
    }
}

bool USaveLoadSystem::LoadGame(const FString& SlotName)
{
    if (!UGameplayStatics::DoesSaveGameExist(SlotName, UserIndex))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] No save found in slot: %s"), *SlotName);
        return false;
    }

    USaveGame* LoadedGame = UGameplayStatics::LoadGameFromSlot(SlotName, UserIndex);
    if (!LoadedGame)
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load game from slot: %s"), *SlotName);
        return false;
    }

    // TODO: Deserialize all subsystem states from the loaded SaveGame object
    // Restore inventory, quests, truths, reputation, discoveries, etc.

    OnLoadCompleted.Broadcast(SlotName);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Game loaded from slot: %s"), *SlotName);
    return true;
}

void USaveLoadSystem::DeleteSave(const FString& SlotName)
{
    if (UGameplayStatics::DoesSaveGameExist(SlotName, UserIndex))
    {
        UGameplayStatics::DeleteGameInSlot(SlotName, UserIndex);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Save deleted: %s"), *SlotName);
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot delete — no save in slot: %s"), *SlotName);
    }
}

TArray<FSaveSlotInfo> USaveLoadSystem::GetSaveSlots() const
{
    TArray<FSaveSlotInfo> Slots;

    // Check common slot names — manual saves and auto-saves
    TArray<FString> SlotNames;
    SlotNames.Add(TEXT("Manual_1"));
    SlotNames.Add(TEXT("Manual_2"));
    SlotNames.Add(TEXT("Manual_3"));
    SlotNames.Add(TEXT("QuickSave"));

    for (int32 i = 0; i < MaxAutoSaves; ++i)
    {
        SlotNames.Add(FString::Printf(TEXT("AutoSave_%d"), i));
    }

    for (const FString& Name : SlotNames)
    {
        if (UGameplayStatics::DoesSaveGameExist(Name, UserIndex))
        {
            FSaveSlotInfo Info;
            Info.SlotName = Name;
            Info.DisplayName = Name.Replace(TEXT("_"), TEXT(" "));
            Info.Timestamp = FDateTime::Now(); // TODO: Read from save metadata
            Info.PlaytimeSeconds = 0.0f;       // TODO: Read from save metadata
            Info.PlayerLevel = 1;              // TODO: Read from save metadata
            Slots.Add(Info);
        }
    }

    return Slots;
}

bool USaveLoadSystem::HasSaveInSlot(const FString& SlotName) const
{
    return UGameplayStatics::DoesSaveGameExist(SlotName, UserIndex);
}

void USaveLoadSystem::AutoSave()
{
    FString AutoSlotName = FString::Printf(TEXT("AutoSave_%d"), AutoSaveIndex);

    SaveGame(AutoSlotName);

    // Rotate to next auto-save slot
    AutoSaveIndex = (AutoSaveIndex + 1) % MaxAutoSaves;
    LastAutoSaveTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Auto-save completed to slot: %s (next index: %d)"),
           *AutoSlotName, AutoSaveIndex);
}
