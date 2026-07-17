#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "EventBus.h"
#include "PrologEngine.generated.h"

// The real logic engine lives in the InsimulRuntime plugin. UPrologEngine is now
// a thin game-facing ADAPTER over it (US-XP4) — forward-declared here so this
// header stays free of the plugin's public surface.
class UInsimulPrologSubsystem;

/**
 * Dynamic game state for Prolog knowledge base updates.
 * Mirrors GamePrologEngine.GameState from the Babylon.js source.
 */
USTRUCT(BlueprintType)
struct FInsimulGameState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PlayerCharacterId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PlayerName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PlayerEnergy = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FVector PlayerPosition = FVector::ZeroVector;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CurrentSettlement;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> NearbyNPCs;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 GameHour = -1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Weather;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Season;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 QuestsCompleted = -1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Reputation = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsNewToTown = false;
};

/**
 * Inventory item for Prolog fact assertion.
 * Includes taxonomy fields matching GamePrologEngine.initializeInventory().
 */
USTRUCT(BlueprintType)
struct FInsimulPrologItem
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Type;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Value = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Material;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BaseType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Rarity;
};

/**
 * World item definition for Prolog taxonomy initialization.
 * Mirrors the parameter of GamePrologEngine.initializeWorldItems().
 */
USTRUCT(BlueprintType)
struct FInsimulWorldItemDef
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Value = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Material;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BaseType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Rarity;
};

/**
 * NPC personality data for Prolog fact assertion (Big Five model).
 */
USTRUCT(BlueprintType)
struct FInsimulNPCPersonality
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Openness = -1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Conscientiousness = -1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Extroversion = -1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Agreeableness = -1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Neuroticism = -1.f;
};

/**
 * NPC emotional state for Prolog fact assertion.
 */
USTRUCT(BlueprintType)
struct FInsimulNPCEmotionalState
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Mood;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float StressLevel = -1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float SocialDesire = -1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Energy = -1.f;
};

/**
 * NPC relationship data for Prolog fact assertion.
 */
USTRUCT(BlueprintType)
struct FInsimulNPCRelationship
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Charge = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Trust = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 ConversationCount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsFriend = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsEnemy = false;
};

/**
 * Result of a Prolog action check.
 */
USTRUCT(BlueprintType)
struct FInsimulPrologActionResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) bool bAllowed = true;
    UPROPERTY(BlueprintReadOnly) FString Reason;
};

/** Delegate for per-objective completion notifications. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPrologObjectiveCompleted, const FString&, QuestId, int32, ObjectiveIndex);

/**
 * Game-facing Prolog adapter for Unreal Engine exports (US-XP4).
 *
 * HISTORY: this used to be a self-contained SUBSTRING-MATCHING STUB — it stored
 * the KB as text and answered queries with string prefix/equality matching (no
 * unification, no rule derivation). That stub is retired. UPrologEngine is now a
 * THIN ADAPTER that delegates every knowledge-base operation to the real logic
 * engine (UInsimulPrologSubsystem in the InsimulRuntime plugin, backed by
 * libinsimul). The game-facing method surface is preserved so existing Blueprint
 * / gameplay callers keep binding; only the semantics change (substring match ->
 * real SLD unification). See templates/MIGRATION.md for the behavior deltas.
 *
 * The adapter still owns engine-agnostic gameplay BOOKKEEPING that is not Prolog
 * (item quantities, active/completed quest tracking, the player-asserted fact log
 * used for save files). All actual reasoning happens in the delegate subsystem.
 */
UCLASS()
class INSIMULEXPORT_API UPrologEngine : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load Prolog knowledge base and game data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void LoadFromIR(const FString& JsonString);

    /** Initialize inventory items as Prolog facts */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void InitializeInventory(const TArray<FInsimulPrologItem>& Items);

    /** Initialize world item definitions (taxonomy, IS-A chains) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void InitializeWorldItems(const TArray<FInsimulWorldItemDef>& Items);

    /** Load built-in IS-A reasoning rules for item hierarchy queries */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void LoadItemReasoningRules();

    /** Load gameplay helper predicates (CEFR comparison, weapon/tool types, skill checks) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void LoadHelperPredicates();

    /** Update dynamic game state facts (call on state change) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void UpdateGameState(const FInsimulGameState& State);

    /** Update environment awareness facts (weather, time, player progress) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void UpdateEnvironment(int32 GameHour, const FString& Weather, const FString& Season, int32 QuestsCompleted, float Reputation, bool bIsNewToTown);

    /** Check if an NPC should mention weather in conversation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool ShouldMentionWeather(const FString& NPCId);

    /** Get the NPC's attitude toward the player based on progress */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    FString GetPlayerAttitude(const FString& NPCId);

    // ── Action & Quest Queries ────────────────────────────────────────────

    /** Check if an action can be performed (stub: true unless KB blocks it) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    FInsimulPrologActionResult CanPerformAction(const FString& ActionId, const FString& ActorId, const FString& TargetId = TEXT(""));

    /** Check if a quest is available to the player */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool IsQuestAvailable(const FString& QuestId, const FString& PlayerId);

    /** Check if a quest is complete for the player */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool IsQuestComplete(const FString& QuestId, const FString& PlayerId);

    /** Check if a specific quest stage is complete */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool IsStageComplete(const FString& QuestId, const FString& StageId, const FString& PlayerId);

    /** Find all applicable rules for an actor */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> GetApplicableRules(const FString& ActorId);

    /** Evaluate an arbitrary Prolog goal (stub: returns true if fact exists) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool EvaluateCondition(const FString& PrologGoal);

    // ── Fact Management ──────────────────────────────────────────────────

    /** Assert a new fact into the knowledge base */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void AssertFact(const FString& Fact, const FString& Source = TEXT(""));

    /** Retract a fact from the knowledge base */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void RetractFact(const FString& Fact, const FString& Reason = TEXT(""));

    /** Run an arbitrary Prolog query (stub: logs and returns empty) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> Query(const FString& Goal);

    /** Whether debug logging is enabled for Prolog operations */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|PrologEngine")
    bool bDebugLoggingEnabled = false;

    /** Export the current knowledge base as Prolog text.
     *  DEPRECATED: Prefer GetPlayerFacts() for save files — it returns only
     *  gameplay-asserted facts, not the entire world KB. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine", meta=(DeprecatedFunction, DeprecationMessage="Use GetPlayerFacts() for save files instead."))
    FString ExportKnowledgeBase() const;

    // ── Player Fact Persistence ─────────────────────────────────────────

    /** Get all player-asserted gameplay facts (not world data). For save files. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> GetPlayerFacts() const;

    /** Restore player facts from a saved array. Call after LoadFromIR(). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void RestorePlayerFacts(const TArray<FString>& Facts);

    /** Reconstruct Prolog state from structured save data. Call after LoadFromIR(). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void RestoreFromSaveState(const FString& SaveStateJson);

    /** Serialize the dynamic KB to a single canonical Prolog-text image, for
     *  GameSaveState.prologFacts. Delegates to UInsimulPrologSubsystem::SnapshotToString.
     *  This is the whole-KB image; GetPlayerFacts() returns the narrower
     *  gameplay-fact list. Both round-trip; snapshot is preferred for full state. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    FString SnapshotToString();

    /** Replace the dynamic KB from an image produced by SnapshotToString().
     *  Delegates to UInsimulPrologSubsystem::RestoreFromString. Call after LoadFromIR(). */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool RestoreFromString(const FString& Image);

    // ── NPC Intelligence Queries ─────────────────────────────────────────

    /** Determine who an NPC should talk to */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> WhoShouldTalkTo(const FString& NPCId);

    /** Get preferred dialogue topics for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> GetPreferredTopics(const FString& NPCId);

    /** Check if an NPC wants to socialize */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool WantsToSocialize(const FString& NPCId);

    /** Check if this is a first meeting between two characters */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool IsFirstMeeting(const FString& NPCId, const FString& PlayerId);

    /** Get NPCs that should be avoided by a given NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> WhoToAvoid(const FString& NPCId);

    /** Get an NPC's conflict resolution style */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    FString GetConflictStyle(const FString& NPCId);

    /** Check if an NPC is grieving */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool IsGrieving(const FString& NPCId);

    /** Check if an NPC is willing to share knowledge with another */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool IsWillingToShare(const FString& NPCId, const FString& TargetId);

    // ── NPC State Updates ───────────────────────────────────────────────

    /** Update NPC personality facts (Big Five) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void UpdateNPCPersonality(const FString& NPCId, const FInsimulNPCPersonality& Personality);

    /** Update NPC emotional state facts */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void UpdateNPCEmotionalState(const FString& NPCId, const FInsimulNPCEmotionalState& State);

    /** Update NPC relationship facts between two characters */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void UpdateNPCRelationship(const FString& NPC1Id, const FString& NPC2Id, const FInsimulNPCRelationship& Relationship);

    /** Record that the player performed an action on an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void RecordPlayerAction(const FString& PlayerId, const FString& NPCId, const FString& ActionName);

    // ── Volition & Romance Queries ──────────────────────────────────────

    /** Evaluate volition rules for an NPC; returns scored actions sorted descending */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> EvaluateVolitionRules(const FString& NPCId);

    /** Get the current romance stage between the player and an NPC (empty if none) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    FString GetRomanceStage(const FString& NPCId);

    /** Check if a romance action can be performed with an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    bool CanPerformRomanceAction(const FString& NPCId, const FString& ActionType);

    // ── Event Bus Integration ───────────────────────────────────────────

    /** Subscribe to an EventBus to automatically assert Prolog facts from game events */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void SubscribeToEventBus(class UEventBus* EventBus);

    /** Register active quest IDs for re-evaluation on event receipt */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void SetActiveQuests(const TArray<FString>& QuestIds);

    /** Reconcile Prolog's view of quest state with external system */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    void Reconcile(TArray<FString>& OutCompletedQuests, TArray<FString>& OutCompletedObjectiveKeys);

    /** Get conditional bonus rewards for a completed quest */
    UFUNCTION(BlueprintCallable, Category = "Insimul|PrologEngine")
    TArray<FString> GetBonusRewards(const FString& QuestId);

    /** Callback delegate fired when Prolog determines a quest is complete */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|PrologEngine")
    FOnGameEvent OnQuestCompleted;

    /** Callback delegate fired when Prolog determines an individual objective is complete */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|PrologEngine")
    FOnPrologObjectiveCompleted OnObjectiveCompleted;

    // ── State ────────────────────────────────────────────────────────────

    /** Whether the engine has been initialized with data */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|PrologEngine")
    bool bInitialized = false;

    /** Number of parsed facts in the knowledge base */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|PrologEngine")
    int32 FactCount = 0;

    /** Number of parsed rules in the knowledge base */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|PrologEngine")
    int32 RuleCount = 0;

private:
    /** Cached handle to the real logic engine (InsimulRuntime plugin). Resolved
     *  lazily from the GameInstance so subsystem init order does not matter. */
    TWeakObjectPtr<UInsimulPrologSubsystem> CachedEngine;

    /** Current game state */
    FInsimulGameState CurrentGameState;

    /** Active quest IDs for re-evaluation */
    TArray<FString> ActiveQuestIds;

    /** Player-asserted gameplay facts (tracked separately from world data for save/load). */
    TSet<FString> PlayerFacts;

    /** Track per-item quantities so has_item/3 stays accurate */
    TMap<FString, int32> ItemQuantities;

    /** Event bus subscription handle for cleanup */
    int32 EventBusSubscriptionHandle = -1;

    /** Weak reference to subscribed event bus for emitting events back */
    TWeakObjectPtr<UEventBus> SubscribedEventBus;

    /** Stored reference to event bus so PrologEngine can emit events (e.g., create_truth) */
    TWeakObjectPtr<UEventBus> EventBusRef;

    /** Track which objectives Prolog has already marked complete */
    TSet<FString> CompletedObjectives;

    /** Track which quests Prolog has already marked complete */
    TSet<FString> CompletedQuests;

    /** Handle a game event by asserting Prolog facts */
    UFUNCTION()
    void HandleGameEvent(const FInsimulGameEvent& Event);

    /** Re-evaluate active quests after fact assertion */
    void ReevaluateQuests();

    /** Check each objective of a quest for completion */
    void CheckObjectiveCompletion(const FString& QuestId);

    /** Assert item taxonomy facts */
    void AssertItemTaxonomy(const FString& ItemName, const FString& Category, const FString& Material, const FString& BaseType, const FString& Rarity, const FString& ItemType);

    /** Update item quantity tracking */
    void UpdateItemQuantity(const FString& ItemName, int32 Delta);

    /** Assert a fact and track it as a player-gameplay fact for save/load. */
    void AssertPlayerFact(const FString& Fact);

    /** Retract a fact and remove it from player-gameplay tracking. */
    void RetractPlayerFact(const FString& Fact);

    /** Retract player facts by pattern and clean up tracking. FirstArg/SecondArg
     *  are the ground leading args; ExtraArity is the count of trailing wildcard
     *  columns (`_`) needed to match the clause's real arity in the engine. */
    void RetractPlayerFactByPattern(const FString& Predicate, const FString& FirstArg, const FString& SecondArg = TEXT(""), int32 ExtraArity = 1);

    /** Update item quantity with player fact tracking (used in HandleGameEvent). */
    void UpdateItemQuantityTracked(const FString& ItemName, int32 Delta);

    /** Assert item taxonomy facts with player tracking (used in HandleGameEvent). */
    void AssertItemTaxonomyTracked(const FString& ItemName, const FString& Category, const FString& Material, const FString& BaseType, const FString& Rarity, const FString& ItemType);

    // ── Real-engine delegation helpers (replace the retired substring matcher) ──

    /** Resolve (and cache) the InsimulRuntime logic engine, or nullptr if absent. */
    UInsimulPrologSubsystem* ResolveEngine();

    /** True iff Goal (ground or not, no trailing '.') has at least one solution. */
    bool QueryHas(const FString& Goal);

    /** Collect the value bound to VarName across every solution of Goal (rendered,
     *  de-duplicated, in solution order). Empty when the engine is unavailable. */
    TArray<FString> QueryColumn(const FString& Goal, const FString& VarName);

    /** Retract every clause unifying with Goal (loops the engine's single-clause
     *  retract until it stops removing). Goal carries `_` for wildcard columns. */
    void RetractAllMatching(const FString& Goal);

    /** Drop tracked player facts whose text starts with GroundPrefix (post-retract cleanup). */
    void PurgeTrackedByPrefix(const FString& GroundPrefix);

    /** Sanitize a string to a valid Prolog atom */
    static FString Sanitize(const FString& Str);

    /** Escape single quotes in a Prolog string */
    static FString EscapeProlog(const FString& Str);
};
