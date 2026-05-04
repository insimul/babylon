#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "QuestSystem.generated.h"

/**
 * How to compare an event field against an objective field (quest-action mapping).
 */
UENUM(BlueprintType)
enum class EFieldComparison : uint8
{
    Exact        UMETA(DisplayName = "Exact"),
    Contains     UMETA(DisplayName = "Contains"),
    ContainsLower UMETA(DisplayName = "ContainsLower"),
};

/**
 * A single field match rule for the quest-action mapping system.
 */
USTRUCT(BlueprintType)
struct FFieldMatchRule
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString EventField;
    UPROPERTY(BlueprintReadWrite) FString ObjectiveField;
    UPROPERTY(BlueprintReadWrite) EFieldComparison Comparison = EFieldComparison::Exact;
    UPROPERTY(BlueprintReadWrite) bool bOptional = false;
};

/**
 * Quantity tracking descriptor for quest-action mappings.
 */
USTRUCT(BlueprintType)
struct FQuantityTracking
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString CurrentField;
    UPROPERTY(BlueprintReadWrite) FString RequiredField;
    UPROPERTY(BlueprintReadWrite) int32 DefaultRequired = 1;
};

/**
 * Declarative mapping from one event type to one objective type.
 */
USTRUCT(BlueprintType)
struct FQuestActionMapping
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString ObjectiveType;
    UPROPERTY(BlueprintReadWrite) FString EventType;
    UPROPERTY(BlueprintReadWrite) TArray<FFieldMatchRule> MatchFields;
    UPROPERTY(BlueprintReadWrite) bool bHasQuantity = false;
    UPROPERTY(BlueprintReadWrite) FQuantityTracking Quantity;
    UPROPERTY(BlueprintReadWrite) FString Description;
};

/**
 * Quest objective data mirroring Insimul's CompletionObjective interface.
 */
USTRUCT(BlueprintType)
struct FQuestObjective
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString Id;
    UPROPERTY(BlueprintReadWrite) FString QuestId;
    UPROPERTY(BlueprintReadWrite) FString Type;
    UPROPERTY(BlueprintReadWrite) FString Description;
    UPROPERTY(BlueprintReadWrite) bool bCompleted = false;
    UPROPERTY(BlueprintReadWrite) int32 RequiredCount = 1;
    UPROPERTY(BlueprintReadWrite) int32 CurrentCount = 0;

    // ── Time limit ──────────────────────────────────────────────────────
    /** Time limit in seconds (0 = untimed) */
    UPROPERTY(BlueprintReadWrite) float TimeLimitSeconds = 0.f;

    /** Timestamp (game-time seconds) when objective was started */
    UPROPERTY(BlueprintReadWrite) float StartedAt = -1.f;

    /** Number of English hints requested (for navigation/directions) */
    UPROPERTY(BlueprintReadWrite) int32 HintsRequested = 0;

    /** Whether a GPS-style waypoint is currently shown */
    UPROPERTY(BlueprintReadWrite) bool bShowWaypoint = false;

    // ── Vocabulary ──────────────────────────────────────────────────────
    /** Vocabulary category for scavenger hunt rotation */
    UPROPERTY(BlueprintReadWrite) FString VocabularyCategory;

    /** Target words for vocabulary objectives (empty = any word counts) */
    UPROPERTY(BlueprintReadWrite) TArray<FString> TargetWords;

    /** Words already used (for deduplication) */
    UPROPERTY(BlueprintReadWrite) TArray<FString> WordsUsed;

    // ── Writing ─────────────────────────────────────────────────────────
    /** Writing prompt for write_response / describe_scene objectives */
    UPROPERTY(BlueprintReadWrite) FString WritingPrompt;

    /** Submitted written responses */
    UPROPERTY(BlueprintReadWrite) TArray<FString> WrittenResponses;

    /** Minimum word count required per submission (0 = no minimum) */
    UPROPERTY(BlueprintReadWrite) int32 MinWordCount = 0;

    // ── Conversation ────────────────────────────────────────────────────
    /** Whether this objective is conversation-only (no physical actions needed) */
    UPROPERTY(BlueprintReadWrite) bool bConversationOnly = false;

    // ── NPC-targeted ────────────────────────────────────────────────────
    /** NPC ID for NPC-targeted objectives */
    UPROPERTY(BlueprintReadWrite) FString NpcId;

    /** NPC name for display/matching */
    UPROPERTY(BlueprintReadWrite) FString NpcName;

    // ── Teaching ────────────────────────────────────────────────────────
    /** Words taught to NPC (for teach_vocabulary deduplication) */
    UPROPERTY(BlueprintReadWrite) TArray<FString> WordsTaught;

    /** Phrases taught to NPC (for teach_phrase deduplication) */
    UPROPERTY(BlueprintReadWrite) TArray<FString> PhrasesTaught;

    // ── Reputation ──────────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString FactionId;
    UPROPERTY(BlueprintReadWrite) int32 ReputationGained = 0;
    UPROPERTY(BlueprintReadWrite) int32 ReputationRequired = 0;

    // ── Item collection / delivery ──────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString ItemName;
    UPROPERTY(BlueprintReadWrite) FString ItemId;
    UPROPERTY(BlueprintReadWrite) int32 ItemCount = 1;
    UPROPERTY(BlueprintReadWrite) int32 CollectedCount = 0;
    UPROPERTY(BlueprintReadWrite) bool bDelivered = false;
    UPROPERTY(BlueprintReadWrite) bool bArrived = false;

    // ── Enemies ─────────────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString EnemyType;
    UPROPERTY(BlueprintReadWrite) int32 EnemiesDefeated = 0;
    UPROPERTY(BlueprintReadWrite) int32 EnemiesRequired = 1;

    // ── Crafting ────────────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString CraftedItemId;
    UPROPERTY(BlueprintReadWrite) int32 CraftedCount = 0;

    // ── Escort ──────────────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString EscortNpcId;

    // ── Conversation initiation ─────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) bool bNpcInitiated = false;
    UPROPERTY(BlueprintReadWrite) float ResponseQuality = 0.f;
    UPROPERTY(BlueprintReadWrite) float MinResponseQuality = 0.f;

    // ── Pronunciation ───────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) TArray<float> PronunciationScores;
    UPROPERTY(BlueprintReadWrite) float PronunciationBestScore = 0.f;
    UPROPERTY(BlueprintReadWrite) float MinAverageScore = 0.f;
    UPROPERTY(BlueprintReadWrite) TArray<FString> TargetPhrases;
    UPROPERTY(BlueprintReadWrite) FString TargetPhrase;

    /** Optional pronunciation hints (each carries a score-penalty multiplier). */
    UPROPERTY(BlueprintReadWrite) TArray<FString> HintTexts;
    UPROPERTY(BlueprintReadWrite) TArray<float> HintScorePenalties;
    UPROPERTY(BlueprintReadWrite) int32 HintsRevealed = 0;

    // ── Romance ─────────────────────────────────────────────────────────
    /** Target romance stage for romance_stage_reach (e.g. "dating", "engaged"). */
    UPROPERTY(BlueprintReadWrite) FString TargetRomanceStage;
    /** Optional gift recipient NPC for romance_gift (empty = any recipient). */
    UPROPERTY(BlueprintReadWrite) FString RomanceGiftRecipientNpcId;

    // ── Listening comprehension ─────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) int32 QuestionsAnswered = 0;
    UPROPERTY(BlueprintReadWrite) int32 QuestionsCorrect = 0;
    UPROPERTY(BlueprintReadWrite) FString ListeningStoryNpcId;

    // ── Translation challenge ───────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) int32 TranslationsCompleted = 0;
    UPROPERTY(BlueprintReadWrite) int32 TranslationsCorrect = 0;

    // ── Navigation / direction steps ────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) int32 StepsCompleted = 0;
    UPROPERTY(BlueprintReadWrite) int32 StepsRequired = 0;
    UPROPERTY(BlueprintReadWrite) int32 WaypointsReached = 0;
    UPROPERTY(BlueprintReadWrite) FString NavigationInstructions;
    UPROPERTY(BlueprintReadWrite) FString LocationName;

    // ── Mercantile ──────────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString MerchantId;
    UPROPERTY(BlueprintReadWrite) FString BusinessType;
    UPROPERTY(BlueprintReadWrite) TArray<FString> ItemsPurchased;

    // ── Photography / observation ───────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString TargetSubject;
    UPROPERTY(BlueprintReadWrite) FString TargetCategory; // "item", "npc", "building", "nature"
    UPROPERTY(BlueprintReadWrite) FString TargetActivity;
    UPROPERTY(BlueprintReadWrite) TArray<FString> PhotographedSubjects;
    UPROPERTY(BlueprintReadWrite) TArray<FString> ObservedActivities;
    UPROPERTY(BlueprintReadWrite) float ObserveDurationRequired = 5.f;

    // ── Text / reading / comprehension ──────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString TextId;
    UPROPERTY(BlueprintReadWrite) TArray<FString> TextsFound;
    UPROPERTY(BlueprintReadWrite) TArray<FString> TextsRead;
    UPROPERTY(BlueprintReadWrite) int32 QuizAnswered = 0;
    UPROPERTY(BlueprintReadWrite) int32 QuizCorrect = 0;
    UPROPERTY(BlueprintReadWrite) int32 QuizPassThreshold = 0;

    // ── Physical action ─────────────────────────────────────────────────
    UPROPERTY(BlueprintReadWrite) FString ActionType;
    UPROPERTY(BlueprintReadWrite) int32 ActionsCompleted = 0;
    UPROPERTY(BlueprintReadWrite) int32 ActionsRequired = 1;

    // ── Dependency ordering ─────────────────────────────────────────────
    /** Objective IDs that must be completed before this one */
    UPROPERTY(BlueprintReadWrite) TArray<FString> DependsOn;
    /** Numeric order for simple sequential completion (lower = earlier; -1 = unordered) */
    UPROPERTY(BlueprintReadWrite) int32 Order = -1;

    // ── Declarative trigger ─────────────────────────────────────────────
    /** When an event with this type fires, the objective is auto-completed */
    UPROPERTY(BlueprintReadWrite) FString CompletionTrigger;
};

/**
 * Scavenger hunt category list for vocabulary rotation.
 */
static const TArray<FString> SCAVENGER_CATEGORIES = {
    TEXT("food"), TEXT("colors"), TEXT("animals"), TEXT("clothing"), TEXT("household"),
    TEXT("nature"), TEXT("body"), TEXT("professions"), TEXT("transportation"), TEXT("weather")
};

/**
 * Lightweight quest summary for the journal widget.
 */
USTRUCT(BlueprintType)
struct FQuestEntrySummary
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString QuestId;
    UPROPERTY(BlueprintReadWrite) FString Title;
    UPROPERTY(BlueprintReadWrite) FString Description;
    UPROPERTY(BlueprintReadWrite) FString QuestType;
    UPROPERTY(BlueprintReadWrite) FString Difficulty;
    UPROPERTY(BlueprintReadWrite) FString Status;
    UPROPERTY(BlueprintReadWrite) FString AssignedBy;
    UPROPERTY(BlueprintReadWrite) FString LocationName;
    UPROPERTY(BlueprintReadWrite) int32 TotalObjectives = 0;
    UPROPERTY(BlueprintReadWrite) int32 CompletedObjectives = 0;
    UPROPERTY(BlueprintReadWrite) TArray<FString> Tags;
    UPROPERTY(BlueprintReadWrite) bool bConversationOnly = false;
};

/**
 * Result struct returned by TrackCollectedItemByName for each matched objective.
 */
USTRUCT(BlueprintType)
struct FCollectedItemMatch
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) FString QuestId;
    UPROPERTY(BlueprintReadWrite) FString ObjectiveId;
    UPROPERTY(BlueprintReadWrite) FString MatchedName;
    UPROPERTY(BlueprintReadWrite) int32 CollectedCount = 0;
    UPROPERTY(BlueprintReadWrite) int32 RequiredCount = 1;
    UPROPERTY(BlueprintReadWrite) bool bCompleted = false;
};

/**
 * Pronunciation stats returned by GetPronunciationStats.
 */
USTRUCT(BlueprintType)
struct FPronunciationStats
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite) TArray<float> Scores;
    UPROPERTY(BlueprintReadWrite) float Average = 0.f;
    UPROPERTY(BlueprintReadWrite) int32 Passed = 0;
    UPROPERTY(BlueprintReadWrite) bool bValid = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnStoryTTS, const FString&, StoryText, const FString&, NpcId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnQuestItemCollected, const FString&, QuestId, const FString&, ObjectiveId, const FString&, ItemName);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnObjectiveCompleted, const FString&, QuestId, const FString&, ObjectiveId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnQuestCompleted, const FString&, QuestId);

/** Delegate to test whether a world-space XZ point falls inside a building footprint. */
DECLARE_DELEGATE_RetVal_TwoParams(bool, FPointInBuildingCheck, float /*X*/, float /*Z*/);

/**
 * Tracks quests, objectives, and completion.
 * Ported from Insimul's QuestObjectManager + QuestCompletionEngine.
 */
UCLASS()
class INSIMULEXPORT_API UQuestSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load data from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|QuestSystem")
    void LoadFromIR(const FString& JsonString);

    UPROPERTY(BlueprintReadOnly, Category = "Quests")
    int32 QuestCount = 0;

    // ── Quest management ────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category = "Quests")
    bool AcceptQuest(const FString& QuestId);

    UFUNCTION(BlueprintCallable, Category = "Quests")
    bool CompleteObjective(const FString& QuestId, const FString& ObjectiveId);

    /** Check if an objective is locked due to unmet dependencies/ordering. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    bool IsObjectiveLocked(const FString& QuestId, const FString& ObjectiveId) const;

    /** Get all unlocked, incomplete objectives for a quest. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    TArray<FQuestObjective> GetAvailableObjectives(const FString& QuestId) const;

    /** Get all locked (dependencies not met) objectives for a quest. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    TArray<FQuestObjective> GetLockedObjectives(const FString& QuestId) const;

    /** Check if a specific objective is complete. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    bool IsObjectiveComplete(const FString& QuestId, const FString& ObjectiveId) const;

    /** Check if all objectives for a quest are complete. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    bool IsQuestComplete(const FString& QuestId) const;

    // ── Timed objectives ────────────────────────────────────────────────

    /** Check timed objectives and return descriptions of any that expired. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    TArray<FString> CheckTimedObjectives();

    /** Get remaining seconds for a timed objective, or -1 if untimed. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    float GetObjectiveTimeRemaining(const FString& ObjectiveId) const;

    /** Request a GPS-style waypoint hint. Returns English hint text or empty. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    FString RequestNavigationHint(const FString& QuestId);

    /** Get next scavenger hunt category (round-robin). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    static FString GetNextScavengerCategory(int32 LastCategoryIndex);

    // ── NPC / conversation tracking ─────────────────────────────────────

    /** Track NPC conversation for talk_to_npc objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackNPCConversation(const FString& NpcId, const FString& QuestId = TEXT(""));

    /** Track vocabulary usage for use_vocabulary / collect_vocabulary objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackVocabularyUsage(const FString& Word, const FString& QuestId = TEXT(""));

    /** Track a conversation turn for complete_conversation objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackConversationTurn(const TArray<FString>& Keywords, const FString& QuestId = TEXT(""));

    /** Track NPC-initiated conversation acceptance for conversation_initiation objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackConversationInitiation(const FString& NpcId, bool bAccepted, float ResponseQuality = 100.f, const FString& QuestId = TEXT(""));

    /** Track topic-based NPC conversation turns (directions, ordering, haggling, etc.). */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackNpcConversationTurn(const FString& NpcId, const FString& TopicTag = TEXT(""), const FString& QuestId = TEXT(""));

    /** Track accumulated conversation turns for arrival_conversation objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackConversationTurnCounted(const FString& NpcId, int32 TotalTurns, int32 MeaningfulTurns, const FString& QuestId = TEXT(""));

    /** Track a detected conversational action against matching objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackConversationalAction(const FString& Action, const FString& NpcId, const FString& Topic = TEXT(""), const FString& QuestId = TEXT(""));

    // ── Pronunciation ───────────────────────────────────────────────────

    /** Track a pronunciation attempt. Score is 0-100, phrase for matching. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackPronunciationAttempt(bool bPassed, float Score = 0.f, const FString& Phrase = TEXT(""), const FString& QuestId = TEXT(""));

    /** Get pronunciation statistics for an objective. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    FPronunciationStats GetPronunciationStats(const FString& QuestId, const FString& ObjectiveId) const;

    /**
     * Reveal the next hint on a pronunciation objective. Returns the hint text
     * (or empty string when no more hints are available). Each revealed hint
     * applies its `ScorePenalty` to subsequent successful attempts via
     * GetHintPenaltyMultiplier.
     */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    FString RevealPronunciationHint(const FString& QuestId, const FString& ObjectiveId);

    // ── Romance ─────────────────────────────────────────────────────────

    /** Complete romance_stage_reach objectives whose target stage has been met. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackRomanceStageReach(const FString& CurrentStage, const FString& QuestId = TEXT(""));

    /** Complete romance_gift objectives when the player gives a gift to a romance target. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackRomanceGift(const FString& NpcId, const FString& QuestId = TEXT(""));

    // ── Writing ─────────────────────────────────────────────────────────

    /** Track a writing submission for write_response / describe_scene / arrival_writing objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackWritingSubmission(const FString& Text, int32 WordCount, const FString& QuestId = TEXT(""));

    // ── Item tracking ───────────────────────────────────────────────────

    /** Track a collected item by name (supports exact, partial, category, and word-overlap matching). */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    TArray<FCollectedItemMatch> TrackCollectedItemByName(const FString& ItemName, const FString& Category = TEXT(""), const FString& QuestId = TEXT(""));

    /** Track item delivery to an NPC for deliver_item objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackItemDelivery(const FString& NpcId, const TArray<FString>& PlayerItemNames, const FString& QuestId = TEXT(""));

    /** Check inventory items against collect_item / collect_items objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void CheckInventoryObjectives(const TArray<FString>& PlayerItemNames, const FString& QuestId = TEXT(""));

    /** Track a gift given to an NPC for give_gift objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackGiftGiven(const FString& NpcId, const FString& ItemName, const FString& QuestId = TEXT(""));

    /** Track a crafted item for craft_item objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackItemCrafted(const FString& ItemId, const FString& QuestId = TEXT(""));

    // ── Combat / reputation ─────────────────────────────────────────────

    /** Track an enemy defeat for defeat_enemies objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackEnemyDefeated(const FString& EnemyType, const FString& QuestId = TEXT(""));

    /** Track reputation gain for gain_reputation objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackReputationGain(const FString& FactionId, int32 Amount, const FString& QuestId = TEXT(""));

    /** Track escort NPC arrival for escort_npc / deliver_item objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackArrival(const FString& NpcOrItemId, bool bReached, const FString& QuestId = TEXT(""));

    // ── Location tracking ───────────────────────────────────────────────

    /** Track location visit/discovery for visit_location / discover_location objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackLocationVisit(const FString& LocationId, const FString& LocationName, const FString& QuestId = TEXT(""));

    // ── Teaching ────────────────────────────────────────────────────────

    /** Track teaching a vocabulary word to an NPC for teach_vocabulary objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackTeachWord(const FString& NpcId, const FString& Word, const FString& QuestId = TEXT(""));

    /** Track teaching a phrase to an NPC for teach_phrase objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackTeachPhrase(const FString& NpcId, const FString& Phrase, const FString& QuestId = TEXT(""));

    // ── Mercantile ──────────────────────────────────────────────────────

    /** Track food ordering at a merchant for order_food objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackFoodOrdered(const FString& ItemName, const FString& MerchantId, const FString& BusinessType, const FString& QuestId = TEXT(""));

    /** Track price haggling in target language for haggle_price objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackPriceHaggled(const FString& ItemName, const FString& MerchantId, const FString& TypedWord, const FString& QuestId = TEXT(""));

    // ── Direction / navigation ───────────────────────────────────────────

    /** Track a direction step completed for follow_directions objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackDirectionStep(const FString& QuestId = TEXT(""));

    /** Track a navigation waypoint reached for navigate_language objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackNavigationWaypoint(const FString& QuestId = TEXT(""));

    /** Check if player is near a direction/navigation waypoint. Call from Tick(). */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void CheckDirectionProximity(const FVector& PlayerPos);

    // ── Listening / translation ──────────────────────────────────────────

    /** Track a listening comprehension answer for listening_comprehension objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackListeningAnswer(bool bCorrect, const FString& QuestId = TEXT(""));

    /** Track a translation attempt for translation_challenge objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackTranslationAttempt(bool bCorrect, const FString& QuestId = TEXT(""));

    // ── Object interaction ───────────────────────────────────────────────

    /** Track an object identified for identify_object objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackObjectIdentified(const FString& ObjectName, const FString& QuestId = TEXT(""));

    /** Track an object examined for examine_object objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackObjectExamined(const FString& ObjectName, const FString& QuestId = TEXT(""));

    /** Track a sign read for read_sign objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackSignRead(const FString& SignId, const FString& QuestId = TEXT(""));

    /** Track point-and-name for point_and_name objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackPointAndName(const FString& ObjectName, const FString& QuestId = TEXT(""));

    // ── Text / reading / comprehension ───────────────────────────────────

    /** Track a text found for find_text objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackTextFound(const FString& TextId, const FString& TextName, const FString& QuestId = TEXT(""));

    /** Track a text read for read_text objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackTextRead(const FString& TextId, const FString& QuestId = TEXT(""));

    /** Track a comprehension quiz answer for comprehension_quiz objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackComprehensionAnswer(bool bCorrect, const FString& QuestId = TEXT(""));

    // ── Photography / observation ────────────────────────────────────────

    /** Track a photo taken for photograph_subject objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackPhotoTaken(const FString& SubjectName, const FString& SubjectCategory, const FString& SubjectActivity = TEXT(""), const FString& QuestId = TEXT(""));

    /** Track an activity photographed for photograph_activity objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackActivityPhotographed(const FString& NpcId, const FString& NpcName, const FString& Activity, const FString& QuestId = TEXT(""));

    /** Track an activity observed for observe_activity objectives. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackActivityObserved(const FString& NpcId, const FString& NpcName, const FString& Activity, float DurationSeconds, const FString& QuestId = TEXT(""));

    // ── Physical actions ─────────────────────────────────────────────────

    /** Track a physical action for perform_physical_action objectives. Also credits collect_item / craft_item for produced items. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackPhysicalAction(const FString& ActionType, const TArray<FString>& ItemsProduced, const FString& QuestId = TEXT(""));

    // ── Declarative trigger & event matching ─────────────────────────────

    /** Complete objectives whose completionTrigger matches the given trigger string. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    void TrackByTrigger(const FString& Trigger, const FString& QuestId = TEXT(""));

    /** Generic event matcher using the quest-action mapping catalog. Returns number of objectives affected. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    int32 HandleGameEvent(const TMap<FString, FString>& EventData);

    // ── Position generation ──────────────────────────────────────────────

    /** Register a building-check callback so spawned items avoid building interiors. */
    void SetPointInBuildingCheck(const FPointInBuildingCheck& Check);

    /** Generate spread-out item positions that avoid building interiors. */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    TArray<FVector> GenerateItemPositions(int32 Count) const;

    /** Generate a single location position that avoids building interiors. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    FVector GenerateLocationPosition() const;

    /** Get world positions of uncollected quest items for minimap markers. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Quests")
    TArray<FVector> GetCollectibleItemPositions() const;

    /** Attach debug metadata to a quest marker actor (used for hover tooltips). */
    UFUNCTION(BlueprintCallable, Category = "Quests")
    static void SetMarkerDebugLabel(AActor* Marker, const FString& Label);

    // ── Events ──────────────────────────────────────────────────────────

    /** Fired when a listening_comprehension objective starts and story should be spoken. */
    UPROPERTY(BlueprintAssignable, Category = "Quests")
    FOnStoryTTS OnStoryTTS;

    /** Fired when a quest-spawned item is collected. */
    UPROPERTY(BlueprintAssignable, Category = "Quests")
    FOnQuestItemCollected OnQuestItemCollected;

    /** Fired when any objective is completed. */
    UPROPERTY(BlueprintAssignable, Category = "Quests")
    FOnObjectiveCompleted OnObjectiveCompleted;

    /** Fired when all objectives for a quest are complete. */
    UPROPERTY(BlueprintAssignable, Category = "Quests")
    FOnQuestCompleted OnQuestCompletedEvent;

    /** Quest summaries for the journal widget. Populated during LoadFromIR. */
    UPROPERTY(BlueprintReadOnly, Category = "Quests")
    TArray<FQuestEntrySummary> QuestEntries;

private:
    TArray<FQuestObjective> Objectives;
    float GameTime = 0.f;

    /** Quest-action mapping catalog (built at initialization). */
    TArray<FQuestActionMapping> ActionMappings;

    /** Optional callback to test whether a world XZ point is inside a building footprint. */
    FPointInBuildingCheck PointInBuildingCheck;

    /** Internal: check objective dependency/ordering constraints. */
    bool IsObjectiveLockedInternal(const FQuestObjective& Objective) const;

    /** Internal: iterate over eligible (unlocked, incomplete, type-matched) objectives. */
    void ForEachObjective(const FString& QuestId, const TArray<FString>& Types, TFunction<void(FQuestObjective&)> Callback);

    /** Internal: build the quest-action mapping catalog. */
    void BuildActionMappingCatalog();

    /** Internal: check if a field match rule passes. */
    static bool MatchesField(const FFieldMatchRule& Rule, const FString& EventValue, const FString& ObjectiveValue);

    /** Internal: check if all field match rules pass for a mapping. */
    static bool MatchesAllFields(const FQuestActionMapping& Mapping, const TMap<FString, FString>& EventData, const FQuestObjective& Objective);

    /** Internal: get string field from objective by name (for generic matching). */
    static FString GetObjectiveFieldValue(const FQuestObjective& Obj, const FString& FieldName);
};
