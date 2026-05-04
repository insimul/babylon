#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "DataLoader.generated.h"

/**
 * Loads exported game data files from Content/Data/.
 * Mirrors the FileDataSource class from Insimul's DataSource.ts.
 *
 * All public loaders return raw JSON strings (FString). Callers are
 * responsible for deserializing into their own USTRUCTs or FJsonObject
 * trees. This keeps DataLoader free of schema dependencies so every
 * subsystem can evolve its types independently.
 */
UCLASS()
class INSIMULEXPORT_API UDataLoader : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ── World IR ───────────────────────────────────────────────────────

    /** Load the full WorldIR.json and return its raw JSON string. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadWorldIR();

    // ── Entity data ────────────────────────────────────────────────────

    /** Load characters.json (player-controlled characters). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadCharacters();

    /** Load npcs.json (non-player characters). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadNPCs();

    // ── Systems data ───────────────────────────────────────────────────

    /** Load actions.json (world + base actions). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadActions();

    /** Load rules.json (world + base rules). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadRules();

    /**
     * Load quests.json.
     * NOTE: In Babylon.js, a PlaythroughQuestOverlay merges per-playthrough
     * quest state on top of base quests. In Unreal, implement equivalent
     * overlay logic in your quest subsystem using save/load game state.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadQuests();

    /** Load base actions (from world IR systems section). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadBaseActions();

    /** Load base rules (from world IR systems section). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadBaseRules();

    // ── Geography ──────────────────────────────────────────────────────

    /** Load settlements.json (settlements with businesses, lots, residences). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadSettlements();

    /** Load buildings.json. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadBuildings();

    /** Load businesses.json (ownerId, businessType for NPC placement). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadBusinesses();

    /** Load countries.json. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadCountries();

    /** Load states.json. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadStates();

    /** Load geography.json (combined geography data). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadGeography();

    // ── Items & economy ────────────────────────────────────────────────

    /** Load items.json (item definitions). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadItems();

    /** Load loot-tables.json. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadLootTables();

    /** Load world items (items.json — all item definitions). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadWorldItems();

    /** Load texts.json (reading texts for language learning). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadTexts();

    /** Load containers.json (container definitions). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadContainers();

    /** Load base resources configuration. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadBaseResources();

    /** Load 3D configuration (derived from asset manifest).
     *  Merges world3DConfig from WorldIR metadata including:
     *  proceduralBuildings, buildingTypeOverrides, wallTextureId,
     *  roofTextureId, modelScaling, and audioAssets. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadConfig3D();

    /** Resolve an asset ID (MongoDB ObjectID) to its export file path.
     *  Uses the assetIdToPath map from WorldIR metadata. Returns empty
     *  string if the ID is not found in the map. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|DataLoader")
    FString ResolveAssetIdToPath(const FString& AssetId) const;

    /** Resolve full asset metadata by ID.
     *  Checks the assetIdToPath map first, then falls back to the loaded
     *  asset manifest. Returns a JSON object with id, name, assetType,
     *  filePath, fileName, fileSize, mimeType — or empty string if not found. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString ResolveAssetById(const FString& AssetId);

    /** Load theme.json. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadTheme();

    // ── Settlement sub-loaders ────────────────────────────────────────

    /**
     * Load businesses for a settlement.
     * Reads from the settlements data and filters by SettlementId.
     * Falls back to deriving businesses from buildings.json if the
     * settlement has no embedded businesses array.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadSettlementBusinesses(const FString& SettlementId);

    /** Load lots for a settlement. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadSettlementLots(const FString& SettlementId);

    /**
     * Load residences for a settlement.
     * Falls back to deriving residences from buildings.json if the
     * settlement has no embedded residences array.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadSettlementResidences(const FString& SettlementId);

    // ── Inventory / Transfer ──────────────────────────────────────────

    /**
     * Get entity inventory JSON from local state.
     * Inventories are managed in-memory and persisted via SaveGameState.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetEntityInventory(const FString& EntityId);

    /**
     * Transfer an item between entities. Updates local inventory state.
     * Supports buy/sell/steal/give/discard/quest_reward transaction types.
     * Returns JSON with success status and timestamp.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString TransferItem(const FString& TransferJSON);

    /**
     * Get player inventory JSON. Delegates to GetEntityInventory.
     * WorldId is accepted for interface compatibility but unused in exported mode.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetPlayerInventory(const FString& WorldId, const FString& PlayerId);

    /**
     * Get container contents JSON by container ID.
     * Loads containers.json and returns the matching container's contents.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetContainerContents(const FString& ContainerId);

    /**
     * Get merchant inventory JSON. Generates stock based on NPC occupation
     * if not already cached, then caches for subsequent calls.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetMerchantInventory(const FString& MerchantId);

    /**
     * Update quest progress locally. Merges update data into cached quest state.
     * Quest updates are reflected in subsequent LoadQuests calls.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    void UpdateQuest(const FString& QuestId, const FString& UpdateJSON);

    /**
     * Mark a quest as completed locally. Returns JSON with success status.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString CompleteQuest(const FString& QuestId);

    /** Create a dynamic quest at runtime */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString CreateDynamicQuest(const FString& WorldId, const FString& QuestDataJson);

    /** Branch a quest based on player choice */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString BranchQuest(const FString& WorldId, const FString& QuestId, const FString& ChoiceId, const FString& TargetStageId = TEXT(""));

    /** Adjust reputation for an entity */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString AdjustReputation(const FString& PlaythroughId, const FString& EntityType, const FString& EntityId, int32 Amount, const FString& Reason);

    /**
     * Get quest guidance context for an NPC. Scans active quests for objectives
     * targeting this NPC and returns a system prompt addition.
     * Returns JSON with hasGuidance bool and optional systemPromptAddition.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetNpcQuestGuidance(const FString& NpcId);

    /**
     * Get main quest journal data. Returns JSON with chapters, state, and
     * investigation board built from local main quest data.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetMainQuestJournal(const FString& PlayerId, const FString& CefrLevel = TEXT(""));

    /**
     * Try to unlock the next CEFR-gated main quest chapter locally.
     * Checks CefrLevel against quest requirements and activates if sufficient.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    void TryUnlockMainQuest(const FString& PlayerId, const FString& CefrLevel);

    /**
     * Record a main quest completion locally. Returns JSON with result status.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString RecordMainQuestCompletion(const FString& PlayerId, const FString& QuestType, const FString& CefrLevel = TEXT(""));

    /**
     * Pay fines for a settlement. Clears accumulated fines and returns result JSON.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString PayFines(const FString& SettlementId);

    /**
     * List existing playthroughs. Scans SaveGames directory for playthrough
     * metadata from the insimul_playthroughs.json index file.
     * Returns JSON array of playthrough objects with id, name, status,
     * createdAt, lastPlayedAt.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString ListPlaythroughs();

    /**
     * Start a new playthrough. Generates a unique ID (local-{timestamp}-{random}),
     * persists metadata to the insimul_playthroughs.json index file,
     * and sets CurrentPlaythroughId.
     * Returns JSON with unique playthrough ID and name.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString StartPlaythrough(const FString& PlaythroughName);

    /**
     * Look up a specific playthrough by ID from the index file.
     * Returns JSON object with playthrough metadata, or empty string if not found.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetPlaythrough(const FString& PlaythroughId);

    /**
     * Update playthrough metadata (name, status, etc.).
     * Merges the provided JSON fields into the existing entry.
     * Returns true on success.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool UpdatePlaythrough(const FString& PlaythroughId, const FString& UpdatesJSON);

    /**
     * Delete a playthrough and all associated save data.
     * Removes save slots, quest progress, and the index entry.
     * Returns true on success.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool DeletePlaythrough(const FString& PlaythroughId);

    // ── Character lookup ──────────────────────────────────────────────

    /** Load a single character by ID from characters.json. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadCharacter(const FString& CharacterId);

    // ── Narrative ──────────────────────────────────────────────────────

    /** Load truths.json (world truths / lore facts). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadTruths();

    /** Load grammars.json (Tracery grammar definitions). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadGrammars();

    // ── Prolog ─────────────────────────────────────────────────────────

    /** Load knowledge_base.pl as a raw text string (not JSON). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadPrologContent();

    // ── AI & dialogue ──────────────────────────────────────────────────

    /** Load ai-config.json (AI service configuration). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadAIConfig();

    /** Load dialogue-contexts.json (conversation context templates). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadDialogueContexts();

    // ── Assets ─────────────────────────────────────────────────────────

    /** Load geography.json (terrain heightmap, features, etc.). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadGeography();

    /** Load asset-manifest.json (exported asset registry). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadAssetManifest();

    // ── Save / Load ────────────────────────────────────────────────────

    /**
     * Save game state JSON to a numbered slot (0-2), scoped to a playthrough.
     * Writes to Saved/SaveGames/insimul_save_{PlaythroughId}_{SlotIndex}.json.
     * If PlaythroughId is empty, falls back to CurrentPlaythroughId.
     * Returns true on success.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool SaveGameState(int32 SlotIndex, const FString& GameStateJSON, const FString& PlaythroughId = TEXT(""));

    /**
     * Load game state JSON from a numbered slot (0-2), scoped to a playthrough.
     * If PlaythroughId is empty, falls back to CurrentPlaythroughId.
     * Returns empty string if the slot has no save data.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadGameState(int32 SlotIndex, const FString& PlaythroughId = TEXT(""));

    /**
     * Delete game state from a numbered slot (0-2), scoped to a playthrough.
     * If PlaythroughId is empty, falls back to CurrentPlaythroughId.
     * Returns true if the file was deleted or did not exist.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool DeleteGameState(int32 SlotIndex, const FString& PlaythroughId = TEXT(""));

    /**
     * Save quest progress JSON to a dedicated file, scoped to a playthrough.
     * If PlaythroughId is empty, falls back to CurrentPlaythroughId.
     * Returns true on success.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool SaveQuestProgress(const FString& QuestProgressJSON, const FString& PlaythroughId = TEXT(""));

    /**
     * Load quest progress JSON from the dedicated file, scoped to a playthrough.
     * If PlaythroughId is empty, falls back to CurrentPlaythroughId.
     * Returns empty string if no quest progress has been saved.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadQuestProgress(const FString& PlaythroughId = TEXT(""));

    // ── Playthrough relationships ─────────────────────────────────────

    /** Load playthrough relationship overlays (returns empty array in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadPlaythroughRelationships();

    /** Update a playthrough relationship (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool UpdatePlaythroughRelationship(const FString& FromCharacterId, const FString& ToCharacterId, const FString& Type, float Strength);

    /** Get all reputations for the current playthrough (empty in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetReputations();

    // ── Language progress ──────────────────────────────────────────────

    /** Load persisted language progress for a player (returns empty in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadLanguageProgress(const FString& PlayerId, const FString& WorldId);

    /** Save language progress data (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    void SaveLanguageProgress(const FString& JsonData);

    /** Get a language profile summary for a player (returns empty in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetLanguageProfile(const FString& WorldId, const FString& PlayerId);

    /** Get all languages defined in the world. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetLanguages();

    // ── NPC Conversation & Assessments ────────────────────────────────

    /** Start an NPC-NPC conversation (returns empty — no AI server in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString StartNpcNpcConversation(const FString& Npc1Id, const FString& Npc2Id, const FString& Topic);

    /** Create an assessment session (stored locally). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString CreateAssessmentSession(const FString& PlayerId, const FString& WorldId, const FString& AssessmentType);

    /** Submit results for an assessment phase (stored locally). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString SubmitAssessmentPhase(const FString& SessionId, const FString& PhaseId, const FString& DataJson);

    /** Complete an assessment session (stored locally). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString CompleteAssessment(const FString& SessionId, float TotalScore, float MaxScore, const FString& CefrLevel);

    /** Get player's assessment history for a world (returns local data). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetPlayerAssessments(const FString& PlayerId, const FString& WorldId);

    /** Check if conversation streaming service is available (always false in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    bool CheckConversationHealth();

    /** Simulate a rich conversation between two characters (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString SimulateRichConversation(const FString& WorldId, const FString& Char1Id, const FString& Char2Id, int32 TurnCount);

    /** Text-to-speech synthesis (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString TextToSpeech(const FString& Text, const FString& Voice, const FString& Gender, const FString& TargetLanguage);

    /** Get player portfolio data (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString GetPortfolio(const FString& WorldId, const FString& PlayerName);

    /** Load reading progress (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    FString LoadReadingProgress(const FString& PlayerId, const FString& WorldId, const FString& PlaythroughId = TEXT(""));

    /** Sync reading progress (no-op in exported mode). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|DataLoader")
    void SyncReadingProgress(const FString& DataJSON);

    // ── Status ─────────────────────────────────────────────────────────

    /** True once at least one file has been loaded successfully. */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|DataLoader")
    bool bIsInitialized = false;

    /** Returns the Content/Data/ directory path used for file loading. */
    UFUNCTION(BlueprintPure, Category = "Insimul|DataLoader")
    FString GetDataDirectoryPath() const;

private:
    /**
     * Read an arbitrary file from Content/Data/ and return its contents.
     * Returns an empty string on failure and logs a warning.
     */
    FString LoadDataFile(const FString& Filename) const;

    /** Parse and cache the WorldIR JSON for metadata access (assetIdToPath, world3DConfig). */
    void EnsureWorldIRCached();

    /** Derive business entries from buildings.json for a settlement.
     *  Filters buildings by settlementId and businessId presence. */
    FString DeriveBusinessesFromBuildings(const FString& SettlementId) const;

    /** Derive residence entries from buildings.json for a settlement.
     *  Filters buildings by settlementId and residenceId presence. */
    FString DeriveResidencesFromBuildings(const FString& SettlementId) const;

    /** Resolve the effective playthrough ID. Falls back to CurrentPlaythroughId if input is empty. */
    FString ResolvePlaythroughId(const FString& PlaythroughId) const;

    /** Load the playthroughs index file. Returns parsed JSON array. */
    TArray<TSharedPtr<FJsonValue>> LoadPlaythroughIndex() const;

    /** Save the playthroughs index file. */
    bool SavePlaythroughIndex(const TArray<TSharedPtr<FJsonValue>>& Playthroughs) const;

    /** Infer asset type from file path — mirrors DataSource.ts logic. */
    FString InferAssetTypeFromPath(const FString& FilePath, bool bIsTexture) const;

    /** Cached Content/Data path resolved once at initialization. */
    FString DataDirectory;

    /** Cached WorldIR JSON object for metadata access. */
    TSharedPtr<FJsonObject> CachedWorldIR;

    /** Asset ID to file path map from WorldIR meta.assetIdToPath. */
    TMap<FString, FString> AssetIdToPathMap;

    /** The currently active playthrough ID, set by StartPlaythrough. */
    FString CurrentPlaythroughId;
};
