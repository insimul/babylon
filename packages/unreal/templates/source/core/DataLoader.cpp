#include "DataLoader.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void UDataLoader::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    DataDirectory = FPaths::ProjectContentDir() / TEXT("Data");

    UE_LOG(LogTemp, Log, TEXT("[Insimul] DataLoader initialized – data path: %s"), *DataDirectory);
}

void UDataLoader::Deinitialize()
{
    Super::Deinitialize();
}

// ── Private helper ─────────────────────────────────────────────────────

FString UDataLoader::LoadDataFile(const FString& Filename) const
{
    const FString FilePath = DataDirectory / Filename;
    FString Contents;

    if (!FFileHelper::LoadFileToString(Contents, *FilePath))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] DataLoader: failed to load %s"), *FilePath);
        return FString();
    }

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] DataLoader: loaded %s (%d chars)"), *Filename, Contents.Len());
    return Contents;
}

FString UDataLoader::GetDataDirectoryPath() const
{
    return DataDirectory;
}

// ── World IR ───────────────────────────────────────────────────────────

FString UDataLoader::LoadWorldIR()
{
    FString Result = LoadDataFile(TEXT("WorldIR.json"));
    if (!Result.IsEmpty())
    {
        bIsInitialized = true;
        // Cache WorldIR metadata (assetIdToPath, world3DConfig) for use by
        // LoadConfig3D, ResolveAssetIdToPath, and settlement fallback logic.
        EnsureWorldIRCached();
    }
    return Result;
}

// ── Entity data ────────────────────────────────────────────────────────

FString UDataLoader::LoadCharacters()
{
    return LoadDataFile(TEXT("characters.json"));
}

FString UDataLoader::LoadNPCs()
{
    return LoadDataFile(TEXT("npcs.json"));
}

// ── Systems data ───────────────────────────────────────────────────────

FString UDataLoader::LoadActions()
{
    return LoadDataFile(TEXT("actions.json"));
}

FString UDataLoader::LoadRules()
{
    return LoadDataFile(TEXT("rules.json"));
}

FString UDataLoader::LoadQuests()
{
    // Returns base world quests. Per-playthrough state (status, progress,
    // completion) should be overlaid at runtime from save game state.
    return LoadDataFile(TEXT("quests.json"));
}

FString UDataLoader::LoadBaseActions()
{
    // Base actions are embedded in the world IR under systems.actions
    // For exported games, they are bundled with the main actions.json
    return LoadDataFile(TEXT("actions.json"));
}

FString UDataLoader::LoadBaseRules()
{
    // Base rules are embedded in the world IR under systems.rules
    return LoadDataFile(TEXT("rules.json"));
}

// ── Geography ──────────────────────────────────────────────────────────

FString UDataLoader::LoadSettlements()
{
    FString RawJson = LoadDataFile(TEXT("settlements.json"));
    if (RawJson.IsEmpty()) return RawJson;

    // Parse, map streetNetwork → streets with centroid re-centering, re-serialize
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RawJson);
    TArray<TSharedPtr<FJsonValue>> Settlements;
    if (!FJsonSerializer::Deserialize(Reader, Settlements)) return RawJson;

    for (auto& Val : Settlements)
    {
        TSharedPtr<FJsonObject>* SObj;
        if (!Val->TryGetObject(SObj)) continue;
        const TSharedPtr<FJsonObject>* SnObj;
        if (!(*SObj)->TryGetObjectField(TEXT("streetNetwork"), SnObj)) continue;
        const TArray<TSharedPtr<FJsonValue>>* StreetsArr;
        if ((*SObj)->TryGetArrayField(TEXT("streets"), StreetsArr)) continue; // already mapped

        // Compute lot centroid
        double LotCX = 0, LotCZ = 0; int32 LotCount = 0;
        const TArray<TSharedPtr<FJsonValue>>* LotsArr;
        if ((*SObj)->TryGetArrayField(TEXT("lots"), LotsArr))
        {
            for (const auto& LotVal : *LotsArr)
            {
                const TSharedPtr<FJsonObject>* LotObj;
                if (!LotVal->TryGetObject(LotObj)) continue;
                double LX = 0, LZ = 0; bool bHasPos = false;
                if ((*LotObj)->TryGetNumberField(TEXT("positionX"), LX)) { bHasPos = true; (*LotObj)->TryGetNumberField(TEXT("positionZ"), LZ); }
                else { const TSharedPtr<FJsonObject>* PosObj; if ((*LotObj)->TryGetObjectField(TEXT("position"), PosObj)) { (*PosObj)->TryGetNumberField(TEXT("x"), LX); (*PosObj)->TryGetNumberField(TEXT("z"), LZ); bHasPos = true; } }
                if (bHasPos) { LotCX += LX; LotCZ += LZ; LotCount++; }
            }
        }
        if (LotCount > 0) { LotCX /= LotCount; LotCZ /= LotCount; }

        // Compute waypoint centroid
        double WpCX = 0, WpCZ = 0; int32 WpCount = 0;
        const TArray<TSharedPtr<FJsonValue>>* SegsArr;
        if ((*SnObj)->TryGetArrayField(TEXT("segments"), SegsArr))
        {
            for (const auto& SegVal : *SegsArr)
            {
                const TSharedPtr<FJsonObject>* SegObj;
                if (!SegVal->TryGetObject(SegObj)) continue;
                const TArray<TSharedPtr<FJsonValue>>* WpsArr;
                if (!(*SegObj)->TryGetArrayField(TEXT("waypoints"), WpsArr)) continue;
                for (const auto& WpVal : *WpsArr)
                {
                    const TSharedPtr<FJsonObject>* WpObj;
                    if (!WpVal->TryGetObject(WpObj)) continue;
                    double WX = 0, WZ = 0;
                    if ((*WpObj)->TryGetNumberField(TEXT("x"), WX) && (*WpObj)->TryGetNumberField(TEXT("z"), WZ))
                    { WpCX += WX; WpCZ += WZ; WpCount++; }
                }
            }
        }
        if (WpCount > 0) { WpCX /= WpCount; WpCZ /= WpCount; }

        double DX = LotCX - WpCX, DZ = LotCZ - WpCZ;

        // Build streets array
        TArray<TSharedPtr<FJsonValue>> NewStreets;
        if (SegsArr)
        {
            for (const auto& SegVal : *SegsArr)
            {
                const TSharedPtr<FJsonObject>* SegObj;
                if (!SegVal->TryGetObject(SegObj)) continue;
                TSharedRef<FJsonObject> Street = MakeShared<FJsonObject>();
                Street->SetStringField(TEXT("id"), (*SegObj)->GetStringField(TEXT("id")));
                Street->SetStringField(TEXT("name"), (*SegObj)->GetStringField(TEXT("name")));
                double Width = 6; (*SegObj)->TryGetNumberField(TEXT("width"), Width);
                Street->SetNumberField(TEXT("width"), Width);

                TArray<TSharedPtr<FJsonValue>> MappedWps;
                const TArray<TSharedPtr<FJsonValue>>* WpsArr;
                if ((*SegObj)->TryGetArrayField(TEXT("waypoints"), WpsArr))
                {
                    for (const auto& WpVal : *WpsArr)
                    {
                        const TSharedPtr<FJsonObject>* WpObj;
                        if (!WpVal->TryGetObject(WpObj)) continue;
                        double WX = 0, WY = 0, WZ = 0;
                        (*WpObj)->TryGetNumberField(TEXT("x"), WX);
                        (*WpObj)->TryGetNumberField(TEXT("y"), WY);
                        (*WpObj)->TryGetNumberField(TEXT("z"), WZ);
                        TSharedRef<FJsonObject> NewWp = MakeShared<FJsonObject>();
                        NewWp->SetNumberField(TEXT("x"), WX + DX);
                        NewWp->SetNumberField(TEXT("y"), WY);
                        NewWp->SetNumberField(TEXT("z"), WZ + DZ);
                        MappedWps.Add(MakeShared<FJsonValueObject>(NewWp));
                    }
                }
                Street->SetArrayField(TEXT("waypoints"), MappedWps);
                TSharedRef<FJsonObject> Props = MakeShared<FJsonObject>();
                Props->SetArrayField(TEXT("waypoints"), MappedWps);
                Props->SetNumberField(TEXT("width"), Width);
                Street->SetObjectField(TEXT("properties"), Props);
                NewStreets.Add(MakeShared<FJsonValueObject>(Street));
            }
        }
        (*SObj)->SetArrayField(TEXT("streets"), NewStreets);
    }

    // Re-serialize
    FString Output;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Settlements, Writer);
    return Output;
}

FString UDataLoader::LoadBuildings()
{
    return LoadDataFile(TEXT("buildings.json"));
}

FString UDataLoader::LoadBusinesses()
{
    return LoadDataFile(TEXT("businesses.json"));
}

FString UDataLoader::LoadCountries()
{
    return LoadDataFile(TEXT("countries.json"));
}

FString UDataLoader::LoadStates()
{
    return LoadDataFile(TEXT("states.json"));
}

FString UDataLoader::LoadGeography()
{
    return LoadDataFile(TEXT("geography.json"));
}

// ── Items & economy ────────────────────────────────────────────────────

FString UDataLoader::LoadItems()
{
    return LoadDataFile(TEXT("items.json"));
}

FString UDataLoader::LoadWorldItems()
{
    return LoadDataFile(TEXT("items.json"));
}

FString UDataLoader::LoadTexts()
{
    return LoadDataFile(TEXT("texts.json"));
}

FString UDataLoader::LoadContainers()
{
    return LoadDataFile(TEXT("containers.json"));
}

FString UDataLoader::LoadBaseResources()
{
    return LoadDataFile(TEXT("base-resources.json"));
}

FString UDataLoader::LoadConfig3D()
{
    // 3D config is derived from asset manifest in Babylon.js source.
    // For Unreal, we load the asset manifest and merge world3DConfig from WorldIR.
    FString ManifestJson = LoadDataFile(TEXT("asset-manifest.json"));

    // Merge world3DConfig from IR metadata — this contains procedural building
    // presets, per-type overrides, texture IDs, model scaling, and audio assets.
    // Mirrors DataSource.ts loadConfig3D() which merges IR config properties:
    //   proceduralBuildings, buildingTypeOverrides, wallTextureId, roofTextureId,
    //   modelScaling, audioAssets
    EnsureWorldIRCached();
    if (CachedWorldIR.IsValid())
    {
        const TSharedPtr<FJsonObject>* MetaObj;
        if (CachedWorldIR->TryGetObjectField(TEXT("meta"), MetaObj))
        {
            const TSharedPtr<FJsonObject>* Config3DObj;
            if ((*MetaObj)->TryGetObjectField(TEXT("world3DConfig"), Config3DObj))
            {
                // Serialize the world3DConfig section and append it as a wrapper
                // so callers can access both manifest and IR config
                FString Config3DJson;
                TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Config3DJson);
                FJsonSerializer::Serialize(Config3DObj->ToSharedRef(), Writer);
                UE_LOG(LogTemp, Log, TEXT("[Insimul] LoadConfig3D: merged world3DConfig from IR (%d chars)"), Config3DJson.Len());

                // Return combined JSON: { "manifest": ..., "world3DConfig": ... }
                return FString::Printf(TEXT("{\"manifest\":%s,\"world3DConfig\":%s}"), *ManifestJson, *Config3DJson);
            }
        }
    }

    return ManifestJson;
}

FString UDataLoader::LoadTheme()
{
    return LoadDataFile(TEXT("theme.json"));
}

// ── Settlement sub-loaders ────────────────────────────────────────────

FString UDataLoader::LoadSettlementBusinesses(const FString& SettlementId)
{
    // In exported games, settlement sub-data is embedded in the geography file.
    // Try geography first; if settlement has no embedded businesses, fall back
    // to deriving from buildings.json (mirrors DataSource.ts behavior).
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LoadSettlementBusinesses(%s)"), *SettlementId);

    FString GeoJson = LoadDataFile(TEXT("geography.json"));
    if (GeoJson.IsEmpty())
    {
        return DeriveBusinessesFromBuildings(SettlementId);
    }

    // Parse geography and check if settlement has businesses
    TSharedPtr<FJsonObject> GeoObj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(GeoJson);
    if (FJsonSerializer::Deserialize(Reader, GeoObj) && GeoObj.IsValid())
    {
        const TArray<TSharedPtr<FJsonValue>>* Settlements;
        if (GeoObj->TryGetArrayField(TEXT("settlements"), Settlements))
        {
            for (const auto& Val : *Settlements)
            {
                const TSharedPtr<FJsonObject>* SettObj;
                if (Val->TryGetObject(SettObj))
                {
                    FString Id;
                    (*SettObj)->TryGetStringField(TEXT("id"), Id);
                    if (Id == SettlementId)
                    {
                        const TArray<TSharedPtr<FJsonValue>>* Businesses;
                        if ((*SettObj)->TryGetArrayField(TEXT("businesses"), Businesses) && Businesses->Num() > 0)
                        {
                            // Serialize just the businesses array
                            FString Result;
                            TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Result);
                            FJsonSerializer::Serialize(*Businesses, Writer);
                            return Result;
                        }
                        break;
                    }
                }
            }
        }
    }

    // Fall back to deriving from buildings data
    return DeriveBusinessesFromBuildings(SettlementId);
}

FString UDataLoader::LoadSettlementLots(const FString& SettlementId)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LoadSettlementLots(%s) — parse from geography"), *SettlementId);
    return LoadDataFile(TEXT("geography.json"));
}

FString UDataLoader::LoadSettlementResidences(const FString& SettlementId)
{
    // Try geography first; if settlement has no embedded residences, fall back
    // to deriving from buildings.json (mirrors DataSource.ts behavior).
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LoadSettlementResidences(%s)"), *SettlementId);

    FString GeoJson = LoadDataFile(TEXT("geography.json"));
    if (GeoJson.IsEmpty())
    {
        return DeriveResidencesFromBuildings(SettlementId);
    }

    // Parse geography and check if settlement has residences
    TSharedPtr<FJsonObject> GeoObj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(GeoJson);
    if (FJsonSerializer::Deserialize(Reader, GeoObj) && GeoObj.IsValid())
    {
        const TArray<TSharedPtr<FJsonValue>>* Settlements;
        if (GeoObj->TryGetArrayField(TEXT("settlements"), Settlements))
        {
            for (const auto& Val : *Settlements)
            {
                const TSharedPtr<FJsonObject>* SettObj;
                if (Val->TryGetObject(SettObj))
                {
                    FString Id;
                    (*SettObj)->TryGetStringField(TEXT("id"), Id);
                    if (Id == SettlementId)
                    {
                        const TArray<TSharedPtr<FJsonValue>>* Residences;
                        if ((*SettObj)->TryGetArrayField(TEXT("residences"), Residences) && Residences->Num() > 0)
                        {
                            FString Result;
                            TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Result);
                            FJsonSerializer::Serialize(*Residences, Writer);
                            return Result;
                        }
                        break;
                    }
                }
            }
        }
    }

    // Fall back to deriving from buildings data
    return DeriveResidencesFromBuildings(SettlementId);
}

// ── Inventory / Transfer ──────────────────────────────────────────────

// Local state management: inventories, quest progress, merchant stock, and fines
// are tracked in-memory and persisted via SaveGameState/LoadGameState.
// This mirrors the LocalGameState class from DataSource.ts.
//
// TODO: Implement full in-memory state tracking (TMap<FString, FJsonObject>)
// for inventories, quest updates, merchant caches, and fines.

FString UDataLoader::GetEntityInventory(const FString& EntityId)
{
    // TODO: Return from local state manager instead of empty stub.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] GetEntityInventory(%s)"), *EntityId);
    return FString::Printf(TEXT("{\"entityId\":\"%s\",\"items\":[],\"gold\":0}"), *EntityId);
}

FString UDataLoader::TransferItem(const FString& TransferJSON)
{
    // TODO: Parse TransferJSON, update source/destination inventories in local state.
    // Handle quantity changes, gold for buy/sell, item stacking.
    UE_LOG(LogTemp, Log, TEXT("[Insimul] TransferItem"));
    return TEXT("{\"success\":true}");
}

FString UDataLoader::GetPlayerInventory(const FString& WorldId, const FString& PlayerId)
{
    // Delegates to GetEntityInventory — WorldId is unused in exported mode.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] GetPlayerInventory(%s, %s)"), *WorldId, *PlayerId);
    return GetEntityInventory(PlayerId);
}

FString UDataLoader::GetContainerContents(const FString& ContainerId)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] GetContainerContents(%s)"), *ContainerId);

    FString ContainersJson = LoadDataFile(TEXT("containers.json"));
    if (ContainersJson.IsEmpty())
    {
        return TEXT("{}");
    }

    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ContainersJson);
    TArray<TSharedPtr<FJsonValue>> Containers;
    if (!FJsonSerializer::Deserialize(Reader, Containers))
    {
        return TEXT("{}");
    }

    for (const auto& Val : Containers)
    {
        const TSharedPtr<FJsonObject>* ContObj;
        if (!Val->TryGetObject(ContObj)) continue;

        FString Id;
        (*ContObj)->TryGetStringField(TEXT("id"), Id);
        if (Id == ContainerId)
        {
            FString Result;
            TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Result);
            FJsonSerializer::Serialize(ContObj->ToSharedRef(), Writer);
            return Result;
        }
    }

    return TEXT("{}");
}

FString UDataLoader::GetMerchantInventory(const FString& MerchantId)
{
    // TODO: Check local state cache first. If not cached, look up NPC occupation
    // from characters/npcs data and generate stock based on occupation type.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] GetMerchantInventory(%s)"), *MerchantId);
    return FString();
}

void UDataLoader::UpdateQuest(const FString& QuestId, const FString& UpdateJSON)
{
    // TODO: Merge UpdateJSON into local quest state overlay.
    UE_LOG(LogTemp, Log, TEXT("[Insimul] UpdateQuest(%s)"), *QuestId);
}

FString UDataLoader::CompleteQuest(const FString& QuestId)
{
    // Mark quest as completed in local state
    FString UpdateJSON = FString::Printf(TEXT("{\"status\":\"completed\",\"completedAt\":\"%s\"}"),
        *FDateTime::UtcNow().ToIso8601());
    UpdateQuest(QuestId, UpdateJSON);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] CompleteQuest(%s)"), *QuestId);
    return FString::Printf(TEXT("{\"success\":true,\"questId\":\"%s\"}"), *QuestId);
}

FString UDataLoader::CreateDynamicQuest(const FString& WorldId, const FString& QuestDataJson)
{
    // Generate a unique ID for the dynamic quest
    FString QuestId = FString::Printf(TEXT("dynamic_%lld"), FDateTime::UtcNow().ToUnixTimestamp());

    // Store in local quest state
    FString SaveDir = GetDataDirectoryPath() / TEXT("quests");
    IFileManager::Get().MakeDirectory(*SaveDir, true);

    FString FilePath = SaveDir / QuestId + TEXT(".json");
    FFileHelper::SaveStringToFile(QuestDataJson, *FilePath);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Created dynamic quest: %s"), *QuestId);

    // Return JSON with the quest ID
    return FString::Printf(TEXT("{\"id\":\"%s\",\"status\":\"active\"}"), *QuestId);
}

FString UDataLoader::BranchQuest(const FString& WorldId, const FString& QuestId, const FString& ChoiceId, const FString& TargetStageId)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] BranchQuest: %s, choice: %s"), *QuestId, *ChoiceId);
    return FString::Printf(TEXT("{\"success\":true,\"questId\":\"%s\",\"choiceId\":\"%s\"}"), *QuestId, *ChoiceId);
}

FString UDataLoader::AdjustReputation(const FString& PlaythroughId, const FString& EntityType, const FString& EntityId, int32 Amount, const FString& Reason)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AdjustReputation: %s/%s by %d (%s)"), *EntityType, *EntityId, Amount, *Reason);
    return TEXT("{\"success\":true}");
}

FString UDataLoader::GetNpcQuestGuidance(const FString& NpcId)
{
    // TODO: Scan active quests for objectives targeting this NPC
    // and build a system prompt addition string.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] GetNpcQuestGuidance(%s)"), *NpcId);
    return TEXT("{\"hasGuidance\":false}");
}

FString UDataLoader::GetMainQuestJournal(const FString& PlayerId, const FString& CefrLevel)
{
    // TODO: Build journal from local main quest data (filter quests by questType == main_quest).
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] GetMainQuestJournal(%s, cefrLevel=%s)"), *PlayerId, *CefrLevel);
    return TEXT("{\"state\":{\"currentChapterId\":null,\"totalXPEarned\":0,\"caseNotes\":[]},\"chapters\":[],\"investigationBoard\":null}");
}

void UDataLoader::TryUnlockMainQuest(const FString& PlayerId, const FString& CefrLevel)
{
    // TODO: Check CEFR level against locked main quest requirements and activate if sufficient.
    UE_LOG(LogTemp, Log, TEXT("[Insimul] TryUnlockMainQuest(%s, cefrLevel=%s)"), *PlayerId, *CefrLevel);
}

FString UDataLoader::RecordMainQuestCompletion(const FString& PlayerId, const FString& QuestType, const FString& CefrLevel)
{
    // In exported mode, just acknowledge the completion
    UE_LOG(LogTemp, Log, TEXT("[Insimul] RecordMainQuestCompletion(%s, questType=%s)"), *PlayerId, *QuestType);
    return FString::Printf(TEXT("{\"result\":{\"questType\":\"%s\",\"recorded\":true}}"), *QuestType);
}

FString UDataLoader::PayFines(const FString& SettlementId)
{
    // TODO: Clear accumulated fines for settlement in local state.
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PayFines(%s)"), *SettlementId);
    return TEXT("{\"success\":true,\"finesPaid\":0}");
}

FString UDataLoader::ListPlaythroughs()
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ListPlaythroughs()"));

    TArray<TSharedPtr<FJsonValue>> Playthroughs = LoadPlaythroughIndex();

    FString ResultJson;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ResultJson);
    FJsonSerializer::Serialize(Playthroughs, Writer);
    return ResultJson;
}

FString UDataLoader::StartPlaythrough(const FString& PlaythroughName)
{
    // Generate unique ID: local-{timestamp}-{random}
    const int64 Timestamp = FDateTime::UtcNow().ToUnixTimestamp();
    const int32 Random = FMath::RandRange(1000, 9999);
    const FString NewId = FString::Printf(TEXT("local-%lld-%d"), Timestamp, Random);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] StartPlaythrough(%s) -> %s"), *PlaythroughName, *NewId);

    // Set as current playthrough
    CurrentPlaythroughId = NewId;

    // Build metadata object
    TSharedPtr<FJsonObject> Entry = MakeShared<FJsonObject>();
    const FString NowISO = FDateTime::UtcNow().ToIso8601();
    Entry->SetStringField(TEXT("id"), NewId);
    Entry->SetStringField(TEXT("name"), PlaythroughName);
    Entry->SetStringField(TEXT("status"), TEXT("active"));
    Entry->SetStringField(TEXT("createdAt"), NowISO);
    Entry->SetStringField(TEXT("lastPlayedAt"), NowISO);

    // Persist to index
    TArray<TSharedPtr<FJsonValue>> Playthroughs = LoadPlaythroughIndex();
    Playthroughs.Add(MakeShared<FJsonValueObject>(Entry));
    SavePlaythroughIndex(Playthroughs);

    // Return the new playthrough as JSON
    FString ResultJson;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ResultJson);
    FJsonSerializer::Serialize(Entry.ToSharedRef(), Writer);
    return ResultJson;
}

FString UDataLoader::GetPlaythrough(const FString& PlaythroughId)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] GetPlaythrough(%s)"), *PlaythroughId);

    TArray<TSharedPtr<FJsonValue>> Playthroughs = LoadPlaythroughIndex();
    for (const auto& Val : Playthroughs)
    {
        const TSharedPtr<FJsonObject>* Obj;
        if (Val->TryGetObject(Obj))
        {
            FString Id;
            (*Obj)->TryGetStringField(TEXT("id"), Id);
            if (Id == PlaythroughId)
            {
                FString ResultJson;
                TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ResultJson);
                FJsonSerializer::Serialize(Obj->ToSharedRef(), Writer);
                return ResultJson;
            }
        }
    }
    return FString();
}

bool UDataLoader::UpdatePlaythrough(const FString& PlaythroughId, const FString& UpdatesJSON)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] UpdatePlaythrough(%s)"), *PlaythroughId);

    TSharedPtr<FJsonObject> Updates;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(UpdatesJSON);
    if (!FJsonSerializer::Deserialize(Reader, Updates) || !Updates.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] UpdatePlaythrough: invalid JSON"));
        return false;
    }

    TArray<TSharedPtr<FJsonValue>> Playthroughs = LoadPlaythroughIndex();
    bool bFound = false;
    for (const auto& Val : Playthroughs)
    {
        const TSharedPtr<FJsonObject>* Obj;
        if (Val->TryGetObject(Obj))
        {
            FString Id;
            (*Obj)->TryGetStringField(TEXT("id"), Id);
            if (Id == PlaythroughId)
            {
                // Merge update fields into existing entry
                for (const auto& Field : Updates->Values)
                {
                    (*Obj)->SetField(Field.Key, Field.Value);
                }
                bFound = true;
                break;
            }
        }
    }
    if (!bFound) return false;
    return SavePlaythroughIndex(Playthroughs);
}

bool UDataLoader::DeletePlaythrough(const FString& PlaythroughId)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] DeletePlaythrough(%s)"), *PlaythroughId);

    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");

    // Remove save slot files
    for (int32 i = 0; i < 10; ++i)
    {
        const FString SavePath = SaveDir / FString::Printf(TEXT("insimul_save_%s_%d.json"), *PlaythroughId, i);
        IFileManager::Get().Delete(*SavePath);
    }
    // Remove quest progress file
    IFileManager::Get().Delete(*(SaveDir / FString::Printf(TEXT("insimul_quest_progress_%s.json"), *PlaythroughId)));
    // Remove playthrough state file
    IFileManager::Get().Delete(*(SaveDir / FString::Printf(TEXT("insimul_local_state_%s.json"), *PlaythroughId)));

    // Remove from index
    TArray<TSharedPtr<FJsonValue>> Playthroughs = LoadPlaythroughIndex();
    Playthroughs.RemoveAll([&PlaythroughId](const TSharedPtr<FJsonValue>& Val) {
        const TSharedPtr<FJsonObject>* Obj;
        if (Val->TryGetObject(Obj))
        {
            FString Id;
            (*Obj)->TryGetStringField(TEXT("id"), Id);
            return Id == PlaythroughId;
        }
        return false;
    });
    return SavePlaythroughIndex(Playthroughs);
}

// ── Character lookup ──────────────────────────────────────────────────

FString UDataLoader::LoadCharacter(const FString& CharacterId)
{
    // Load all characters and find the one with matching ID.
    // Callers should cache the full characters array for repeated lookups.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LoadCharacter(%s) — loads full characters file"), *CharacterId);
    return LoadDataFile(TEXT("characters.json"));
}

FString UDataLoader::LoadLootTables()
{
    return LoadDataFile(TEXT("loot-tables.json"));
}

// ── Narrative ──────────────────────────────────────────────────────────

FString UDataLoader::LoadTruths()
{
    return LoadDataFile(TEXT("truths.json"));
}

FString UDataLoader::LoadGrammars()
{
    return LoadDataFile(TEXT("grammars.json"));
}

// ── Prolog ─────────────────────────────────────────────────────────────

FString UDataLoader::LoadPrologContent()
{
    return LoadDataFile(TEXT("knowledge_base.pl"));
}

// ── AI & dialogue ──────────────────────────────────────────────────────

FString UDataLoader::LoadAIConfig()
{
    return LoadDataFile(TEXT("ai-config.json"));
}

FString UDataLoader::LoadDialogueContexts()
{
    return LoadDataFile(TEXT("dialogue-contexts.json"));
}

// ── Geography ──────────────────────────────────────────────────────────

FString UDataLoader::LoadGeography()
{
    return LoadDataFile(TEXT("geography.json"));
}

// ── Assets ─────────────────────────────────────────────────────────────

FString UDataLoader::LoadAssetManifest()
{
    return LoadDataFile(TEXT("asset-manifest.json"));
}

// ── Asset type inference ───────────────────────────────────────────────

FString UDataLoader::InferAssetTypeFromPath(const FString& FilePath, bool bIsTexture) const
{
    if (!bIsTexture) return TEXT("model");
    FString Lower = FilePath.ToLower();
    if (Lower.Contains(TEXT("wall")) || Lower.Contains(TEXT("plaster")) || Lower.Contains(TEXT("brick")) || Lower.Contains(TEXT("planks")))
        return TEXT("texture_wall");
    if (Lower.Contains(TEXT("roof")) || Lower.Contains(TEXT("tiles")) || Lower.Contains(TEXT("slates")) || Lower.Contains(TEXT("corrugated")))
        return TEXT("texture_material");
    if (Lower.Contains(TEXT("ground")) || Lower.Contains(TEXT("floor")) || Lower.Contains(TEXT("cobblestone")) || Lower.Contains(TEXT("forrest")))
        return TEXT("texture_ground");
    return TEXT("texture");
}

// ── WorldIR caching & asset ID resolution ─────────────────────────────

void UDataLoader::EnsureWorldIRCached()
{
    if (CachedWorldIR.IsValid()) return;

    FString IRJson = LoadDataFile(TEXT("WorldIR.json"));
    if (IRJson.IsEmpty()) return;

    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(IRJson);
    TSharedPtr<FJsonObject> Parsed;
    if (!FJsonSerializer::Deserialize(Reader, Parsed) || !Parsed.IsValid()) return;

    CachedWorldIR = Parsed;

    // Populate assetIdToPath map from meta.assetIdToPath
    const TSharedPtr<FJsonObject>* MetaObj;
    if (CachedWorldIR->TryGetObjectField(TEXT("meta"), MetaObj))
    {
        const TSharedPtr<FJsonObject>* IdMapObj;
        if ((*MetaObj)->TryGetObjectField(TEXT("assetIdToPath"), IdMapObj))
        {
            for (const auto& Pair : (*IdMapObj)->Values)
            {
                FString Path;
                if (Pair.Value->TryGetString(Path))
                {
                    AssetIdToPathMap.Add(Pair.Key, Path);
                }
            }
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Cached %d assetIdToPath entries from WorldIR"), AssetIdToPathMap.Num());
        }
    }
}

FString UDataLoader::ResolveAssetIdToPath(const FString& AssetId) const
{
    if (const FString* Path = AssetIdToPathMap.Find(AssetId))
    {
        return *Path;
    }
    return FString();
}

FString UDataLoader::ResolveAssetById(const FString& AssetId)
{
    EnsureWorldIRCached();

    // Check assetIdToPath map first
    FString FilePath = ResolveAssetIdToPath(AssetId);
    if (!FilePath.IsEmpty())
    {
        FString Ext = FPaths::GetExtension(FilePath).ToLower();
        bool bIsTexture = (Ext == TEXT("png") || Ext == TEXT("jpg") || Ext == TEXT("jpeg"));
        FString AssetType = InferAssetTypeFromPath(FilePath, bIsTexture);
        FString MimeType;
        if (bIsTexture)
        {
            MimeType = (Ext == TEXT("jpg")) ? TEXT("image/jpeg") : FString::Printf(TEXT("image/%s"), *Ext);
        }
        else
        {
            MimeType = TEXT("model/gltf-binary");
        }
        if (!FilePath.StartsWith(TEXT(".")))
        {
            FilePath = TEXT("./") + FilePath;
        }

        TSharedRef<FJsonObject> Obj = MakeShared<FJsonObject>();
        Obj->SetStringField(TEXT("id"), AssetId);
        Obj->SetStringField(TEXT("name"), AssetId);
        Obj->SetStringField(TEXT("assetType"), AssetType);
        Obj->SetStringField(TEXT("filePath"), FilePath);
        Obj->SetStringField(TEXT("fileName"), FPaths::GetCleanFilename(FilePath));
        Obj->SetNumberField(TEXT("fileSize"), 0);
        Obj->SetStringField(TEXT("mimeType"), MimeType);

        FString Output;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
        FJsonSerializer::Serialize(Obj, Writer);
        return Output;
    }

    // Fall back to searching loaded assets
    FString AssetsJson = LoadDataFile(TEXT("asset-manifest.json"));
    if (AssetsJson.IsEmpty()) return FString();

    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(AssetsJson);
    TSharedPtr<FJsonObject> ManifestObj;
    if (!FJsonSerializer::Deserialize(Reader, ManifestObj)) return FString();

    const TArray<TSharedPtr<FJsonValue>>* AssetsArray;
    if (!ManifestObj->TryGetArrayField(TEXT("assets"), AssetsArray)) return FString();

    for (const auto& Val : *AssetsArray)
    {
        const TSharedPtr<FJsonObject>* AssetObj;
        if (Val->TryGetObject(AssetObj) && (*AssetObj)->GetStringField(TEXT("role")) == AssetId)
        {
            FString Output;
            TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
            FJsonSerializer::Serialize(*AssetObj, Writer);
            return Output;
        }
    }

    return FString();
}

// ── Buildings fallback helpers ────────────────────────────────────────

FString UDataLoader::DeriveBusinessesFromBuildings(const FString& SettlementId) const
{
    // Mirrors DataSource.ts: filter buildings by settlementId + businessId,
    // then project into business-like objects.
    FString BuildingsJson = LoadDataFile(TEXT("buildings.json"));
    if (BuildingsJson.IsEmpty()) return TEXT("[]");

    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(BuildingsJson);
    TArray<TSharedPtr<FJsonValue>> Buildings;
    if (!FJsonSerializer::Deserialize(Reader, Buildings)) return TEXT("[]");

    TArray<TSharedPtr<FJsonValue>> Results;
    for (const auto& Val : Buildings)
    {
        const TSharedPtr<FJsonObject>* BldgObj;
        if (!Val->TryGetObject(BldgObj)) continue;

        FString BSettId;
        (*BldgObj)->TryGetStringField(TEXT("settlementId"), BSettId);
        if (BSettId != SettlementId) continue;

        FString BusinessId;
        if (!(*BldgObj)->TryGetStringField(TEXT("businessId"), BusinessId) || BusinessId.IsEmpty()) continue;

        // Derive business entry from building data
        TSharedPtr<FJsonObject> Biz = MakeShared<FJsonObject>();
        FString BldgId;
        (*BldgObj)->TryGetStringField(TEXT("id"), BldgId);
        Biz->SetStringField(TEXT("id"), BusinessId.IsEmpty() ? BldgId : BusinessId);
        Biz->SetStringField(TEXT("settlementId"), SettlementId);

        // Extract buildingRole from spec object
        FString Role = TEXT("Shop");
        const TSharedPtr<FJsonObject>* SpecObj;
        if ((*BldgObj)->TryGetObjectField(TEXT("spec"), SpecObj))
        {
            (*SpecObj)->TryGetStringField(TEXT("buildingRole"), Role);
        }
        Biz->SetStringField(TEXT("businessType"), Role);
        Biz->SetStringField(TEXT("name"), Role);

        // occupantIds: first is owner, rest are employees
        const TArray<TSharedPtr<FJsonValue>>* OccupantIds;
        if ((*BldgObj)->TryGetArrayField(TEXT("occupantIds"), OccupantIds) && OccupantIds->Num() > 0)
        {
            FString OwnerId;
            (*OccupantIds)[0]->TryGetString(OwnerId);
            Biz->SetStringField(TEXT("ownerId"), OwnerId);

            TArray<TSharedPtr<FJsonValue>> Employees;
            for (int32 i = 1; i < OccupantIds->Num(); ++i)
            {
                Employees.Add((*OccupantIds)[i]);
            }
            Biz->SetArrayField(TEXT("employees"), Employees);
        }
        else
        {
            // Fallback: look up BusinessIR.ownerId from businesses.json
            FString BizJson = LoadDataFile(TEXT("businesses.json"));
            if (!BizJson.IsEmpty())
            {
                TArray<TSharedPtr<FJsonValue>> AllBiz;
                if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(BizJson), AllBiz))
                {
                    for (auto& BVal : AllBiz)
                    {
                        auto BObj = BVal->AsObject();
                        if (!BObj.IsValid()) continue;
                        FString BId;
                        BObj->TryGetStringField(TEXT("id"), BId);
                        if (BId == BusinessId)
                        {
                            FString FallbackOwner;
                            if (BObj->TryGetStringField(TEXT("ownerId"), FallbackOwner))
                            {
                                Biz->SetStringField(TEXT("ownerId"), FallbackOwner);
                            }
                            FString BizType, BizName;
                            if (BObj->TryGetStringField(TEXT("businessType"), BizType))
                            {
                                Biz->SetStringField(TEXT("businessType"), BizType);
                            }
                            if (BObj->TryGetStringField(TEXT("name"), BizName))
                            {
                                Biz->SetStringField(TEXT("name"), BizName);
                            }
                            break;
                        }
                    }
                }
            }
        }

        Results.Add(MakeShared<FJsonValueObject>(Biz));
    }

    FString ResultJson;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ResultJson);
    FJsonSerializer::Serialize(Results, Writer);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Derived %d businesses from buildings for settlement %s"), Results.Num(), *SettlementId);
    return ResultJson;
}

FString UDataLoader::DeriveResidencesFromBuildings(const FString& SettlementId) const
{
    // Mirrors DataSource.ts: filter buildings by settlementId + residenceId,
    // then project into residence-like objects.
    FString BuildingsJson = LoadDataFile(TEXT("buildings.json"));
    if (BuildingsJson.IsEmpty()) return TEXT("[]");

    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(BuildingsJson);
    TArray<TSharedPtr<FJsonValue>> Buildings;
    if (!FJsonSerializer::Deserialize(Reader, Buildings)) return TEXT("[]");

    TArray<TSharedPtr<FJsonValue>> Results;
    for (const auto& Val : Buildings)
    {
        const TSharedPtr<FJsonObject>* BldgObj;
        if (!Val->TryGetObject(BldgObj)) continue;

        FString BSettId;
        (*BldgObj)->TryGetStringField(TEXT("settlementId"), BSettId);
        if (BSettId != SettlementId) continue;

        FString ResidenceId;
        if (!(*BldgObj)->TryGetStringField(TEXT("residenceId"), ResidenceId) || ResidenceId.IsEmpty()) continue;

        // Derive residence entry from building data
        TSharedPtr<FJsonObject> Res = MakeShared<FJsonObject>();
        FString BldgId;
        (*BldgObj)->TryGetStringField(TEXT("id"), BldgId);
        Res->SetStringField(TEXT("id"), ResidenceId.IsEmpty() ? BldgId : ResidenceId);
        Res->SetStringField(TEXT("settlementId"), SettlementId);

        // Extract buildingRole from spec object
        FString Role = TEXT("House");
        const TSharedPtr<FJsonObject>* SpecObj;
        if ((*BldgObj)->TryGetObjectField(TEXT("spec"), SpecObj))
        {
            (*SpecObj)->TryGetStringField(TEXT("buildingRole"), Role);
        }
        Res->SetStringField(TEXT("residenceType"), Role);
        Res->SetStringField(TEXT("name"), Role);

        // occupantIds
        const TArray<TSharedPtr<FJsonValue>>* OccupantIds;
        if ((*BldgObj)->TryGetArrayField(TEXT("occupantIds"), OccupantIds))
        {
            Res->SetArrayField(TEXT("occupantIds"), *OccupantIds);
        }
        else
        {
            Res->SetArrayField(TEXT("occupantIds"), TArray<TSharedPtr<FJsonValue>>());
        }

        Results.Add(MakeShared<FJsonValueObject>(Res));
    }

    FString ResultJson;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ResultJson);
    FJsonSerializer::Serialize(Results, Writer);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Derived %d residences from buildings for settlement %s"), Results.Num(), *SettlementId);
    return ResultJson;
}

// ── Save / Load ────────────────────────────────────────────────────────

bool UDataLoader::SaveGameState(int32 SlotIndex, const FString& GameStateJSON, const FString& PlaythroughId)
{
    if (SlotIndex < 0 || SlotIndex > 2)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] SaveGameState: invalid slot %d (must be 0-2)"), SlotIndex);
        return false;
    }
    const FString EffectiveId = ResolvePlaythroughId(PlaythroughId);
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    const FString SavePath = SaveDir / FString::Printf(TEXT("insimul_save_%s_%d.json"), *EffectiveId, SlotIndex);
    if (!FFileHelper::SaveStringToFile(GameStateJSON, *SavePath))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] SaveGameState: failed to write %s"), *SavePath);
        return false;
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SaveGameState: saved to playthrough %s slot %d (%d chars)"), *EffectiveId, SlotIndex, GameStateJSON.Len());

    // Update lastPlayedAt in index
    TArray<TSharedPtr<FJsonValue>> Playthroughs = LoadPlaythroughIndex();
    for (const auto& Val : Playthroughs)
    {
        const TSharedPtr<FJsonObject>* Obj;
        if (Val->TryGetObject(Obj))
        {
            FString Id;
            (*Obj)->TryGetStringField(TEXT("id"), Id);
            if (Id == EffectiveId)
            {
                (*Obj)->SetStringField(TEXT("lastPlayedAt"), FDateTime::UtcNow().ToIso8601());
                break;
            }
        }
    }
    SavePlaythroughIndex(Playthroughs);

    return true;
}

FString UDataLoader::LoadGameState(int32 SlotIndex, const FString& PlaythroughId)
{
    if (SlotIndex < 0 || SlotIndex > 2)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] LoadGameState: invalid slot %d (must be 0-2)"), SlotIndex);
        return FString();
    }
    const FString EffectiveId = ResolvePlaythroughId(PlaythroughId);
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    const FString SavePath = SaveDir / FString::Printf(TEXT("insimul_save_%s_%d.json"), *EffectiveId, SlotIndex);
    FString Contents;
    if (!FFileHelper::LoadFileToString(Contents, *SavePath))
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LoadGameState: no save for playthrough %s slot %d"), *EffectiveId, SlotIndex);
        return FString();
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] LoadGameState: loaded playthrough %s slot %d (%d chars)"), *EffectiveId, SlotIndex, Contents.Len());
    return Contents;
}

bool UDataLoader::DeleteGameState(int32 SlotIndex, const FString& PlaythroughId)
{
    if (SlotIndex < 0 || SlotIndex > 2)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] DeleteGameState: invalid slot %d (must be 0-2)"), SlotIndex);
        return false;
    }
    const FString EffectiveId = ResolvePlaythroughId(PlaythroughId);
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    const FString SavePath = SaveDir / FString::Printf(TEXT("insimul_save_%s_%d.json"), *EffectiveId, SlotIndex);
    if (IFileManager::Get().FileExists(*SavePath))
    {
        IFileManager::Get().Delete(*SavePath);
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] DeleteGameState: deleted playthrough %s slot %d"), *EffectiveId, SlotIndex);
    return true;
}

bool UDataLoader::SaveQuestProgress(const FString& QuestProgressJSON, const FString& PlaythroughId)
{
    const FString EffectiveId = ResolvePlaythroughId(PlaythroughId);
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    const FString SavePath = SaveDir / FString::Printf(TEXT("insimul_quest_progress_%s.json"), *EffectiveId);
    if (!FFileHelper::SaveStringToFile(QuestProgressJSON, *SavePath))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] SaveQuestProgress: failed to write %s"), *SavePath);
        return false;
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SaveQuestProgress: saved for playthrough %s (%d chars)"), *EffectiveId, QuestProgressJSON.Len());
    return true;
}

FString UDataLoader::LoadQuestProgress(const FString& PlaythroughId)
{
    const FString EffectiveId = ResolvePlaythroughId(PlaythroughId);
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    const FString SavePath = SaveDir / FString::Printf(TEXT("insimul_quest_progress_%s.json"), *EffectiveId);
    FString Contents;
    if (!FFileHelper::LoadFileToString(Contents, *SavePath))
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] LoadQuestProgress: no saved quest progress for playthrough %s"), *EffectiveId);
        return FString();
    }
    UE_LOG(LogTemp, Log, TEXT("[Insimul] LoadQuestProgress: loaded for playthrough %s (%d chars)"), *EffectiveId, Contents.Len());
    return Contents;
}

// ── Playthrough index helpers ─────────────────────────────────────────

FString UDataLoader::ResolvePlaythroughId(const FString& PlaythroughId) const
{
    if (!PlaythroughId.IsEmpty())
    {
        return PlaythroughId;
    }
    if (!CurrentPlaythroughId.IsEmpty())
    {
        return CurrentPlaythroughId;
    }
    return TEXT("default");
}

TArray<TSharedPtr<FJsonValue>> UDataLoader::LoadPlaythroughIndex() const
{
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    const FString IndexPath = SaveDir / TEXT("insimul_playthroughs.json");
    FString Contents;
    if (!FFileHelper::LoadFileToString(Contents, *IndexPath))
    {
        return TArray<TSharedPtr<FJsonValue>>();
    }

    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Contents);
    TArray<TSharedPtr<FJsonValue>> Result;
    if (!FJsonSerializer::Deserialize(Reader, Result))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] LoadPlaythroughIndex: failed to parse %s"), *IndexPath);
        return TArray<TSharedPtr<FJsonValue>>();
    }
    return Result;
}

bool UDataLoader::SavePlaythroughIndex(const TArray<TSharedPtr<FJsonValue>>& Playthroughs) const
{
    const FString SaveDir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
    // Ensure SaveGames directory exists
    IFileManager::Get().MakeDirectory(*SaveDir, true);
    const FString IndexPath = SaveDir / TEXT("insimul_playthroughs.json");

    FString JsonStr;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&JsonStr);
    FJsonSerializer::Serialize(Playthroughs, Writer);

    if (!FFileHelper::SaveStringToFile(JsonStr, *IndexPath))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] SavePlaythroughIndex: failed to write %s"), *IndexPath);
        return false;
    }
    return true;
}

FString UDataLoader::LoadPlaythroughRelationships()
{
    // No server in exported mode — return empty JSON array
    return TEXT("[]");
}

bool UDataLoader::UpdatePlaythroughRelationship(const FString& FromCharacterId, const FString& ToCharacterId, const FString& Type, float Strength)
{
    // No server in exported mode — no-op
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] UpdatePlaythroughRelationship: no-op in exported mode"));
    return false;
}

FString UDataLoader::GetReputations()
{
    // No server in exported mode — return empty JSON array
    return TEXT("[]");
}

// ── Language progress ────────────────────────────────────────────────

FString UDataLoader::LoadLanguageProgress(const FString& PlayerId, const FString& WorldId)
{
    // No server in exported mode — return null JSON
    return TEXT("null");
}

void UDataLoader::SaveLanguageProgress(const FString& JsonData)
{
    // No server in exported mode — no-op
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] SaveLanguageProgress: no-op in exported mode"));
}

FString UDataLoader::GetLanguageProfile(const FString& WorldId, const FString& PlayerId)
{
    // No server in exported mode — return null JSON
    return TEXT("null");
}

FString UDataLoader::GetLanguages()
{
    EnsureWorldIRCached();
    if (!CachedWorldIR.IsValid()) return TEXT("[]");

    const TArray<TSharedPtr<FJsonValue>>* Languages = nullptr;
    if (CachedWorldIR->TryGetArrayField(TEXT("languages"), Languages))
    {
        FString Out;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
        FJsonSerializer::Serialize(*Languages, Writer);
        return Out;
    }
    return TEXT("[]");
}

// ── NPC Conversation & Assessments ────────────────────────────────

FString UDataLoader::StartNpcNpcConversation(const FString& Npc1Id, const FString& Npc2Id, const FString& Topic)
{
    // No AI server in exported mode
    return TEXT("");
}

FString UDataLoader::CreateAssessmentSession(const FString& PlayerId, const FString& WorldId, const FString& AssessmentType)
{
    // Store locally via SaveGame in a real implementation; stub for now
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] CreateAssessmentSession: stub in exported mode"));
    return TEXT("{}");
}

FString UDataLoader::SubmitAssessmentPhase(const FString& SessionId, const FString& PhaseId, const FString& DataJson)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] SubmitAssessmentPhase: stub in exported mode"));
    return TEXT("{}");
}

FString UDataLoader::CompleteAssessment(const FString& SessionId, float TotalScore, float MaxScore, const FString& CefrLevel)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] CompleteAssessment: stub in exported mode"));
    return TEXT("{}");
}

FString UDataLoader::GetPlayerAssessments(const FString& PlayerId, const FString& WorldId)
{
    return TEXT("[]");
}

bool UDataLoader::CheckConversationHealth()
{
    // No conversation streaming service in exported mode
    return false;
}

FString UDataLoader::SimulateRichConversation(const FString& WorldId, const FString& Char1Id, const FString& Char2Id, int32 TurnCount)
{
    // No AI server in exported mode
    return FString();
}

FString UDataLoader::TextToSpeech(const FString& Text, const FString& Voice, const FString& Gender, const FString& TargetLanguage)
{
    // No TTS service in exported mode
    return FString();
}

FString UDataLoader::GetPortfolio(const FString& WorldId, const FString& PlayerName)
{
    return TEXT("{}");
}

FString UDataLoader::LoadReadingProgress(const FString& PlayerId, const FString& WorldId, const FString& PlaythroughId)
{
    return TEXT("{}");
}

void UDataLoader::SyncReadingProgress(const FString& DataJSON)
{
    // No-op in exported mode
}
