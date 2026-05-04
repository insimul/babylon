#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "EventBus.generated.h"

/**
 * Game event types matching GameEventBus.ts discriminated union.
 */
UENUM(BlueprintType)
enum class EInsimulEventType : uint8
{
    ItemCollected       UMETA(DisplayName = "Item Collected"),
    EnemyDefeated       UMETA(DisplayName = "Enemy Defeated"),
    LocationVisited     UMETA(DisplayName = "Location Visited"),
    NPCTalked           UMETA(DisplayName = "NPC Talked"),
    ItemDelivered       UMETA(DisplayName = "Item Delivered"),
    VocabularyUsed      UMETA(DisplayName = "Vocabulary Used"),
    ConversationTurn    UMETA(DisplayName = "Conversation Turn"),
    QuestAccepted       UMETA(DisplayName = "Quest Accepted"),
    QuestCompleted      UMETA(DisplayName = "Quest Completed"),
    QuestObjectiveCompleted UMETA(DisplayName = "Quest Objective Completed"),
    CombatAction        UMETA(DisplayName = "Combat Action"),
    ReputationChanged   UMETA(DisplayName = "Reputation Changed"),
    ItemPurchased       UMETA(DisplayName = "Item Purchased"),
    GiftGiven           UMETA(DisplayName = "Gift Given"),
    ItemCrafted         UMETA(DisplayName = "Item Crafted"),
    LocationDiscovered  UMETA(DisplayName = "Location Discovered"),
    SettlementEntered   UMETA(DisplayName = "Settlement Entered"),
    PuzzleSolved        UMETA(DisplayName = "Puzzle Solved"),
    ItemRemoved         UMETA(DisplayName = "Item Removed"),
    ItemUsed            UMETA(DisplayName = "Item Used"),
    ItemDropped         UMETA(DisplayName = "Item Dropped"),
    ItemEquipped        UMETA(DisplayName = "Item Equipped"),
    ItemUnequipped          UMETA(DisplayName = "Item Unequipped"),
    UtteranceEvaluated      UMETA(DisplayName = "Utterance Evaluated"),
    UtteranceQuestProgress  UMETA(DisplayName = "Utterance Quest Progress"),
    UtteranceQuestCompleted UMETA(DisplayName = "Utterance Quest Completed"),
    AmbientConversationStarted UMETA(DisplayName = "Ambient Conversation Started"),
    AmbientConversationEnded   UMETA(DisplayName = "Ambient Conversation Ended"),
    VocabularyOverheard     UMETA(DisplayName = "Vocabulary Overheard"),
    StateCreatedTruth       UMETA(DisplayName = "State Created Truth"),
    StateExpiredTruth       UMETA(DisplayName = "State Expired Truth"),
    RomanceAction           UMETA(DisplayName = "Romance Action"),
    RomanceStageChanged     UMETA(DisplayName = "Romance Stage Changed"),
    NpcVolitionAction       UMETA(DisplayName = "NPC Volition Action"),
    PuzzleFailed            UMETA(DisplayName = "Puzzle Failed"),
    QuestFailed             UMETA(DisplayName = "Quest Failed"),
    QuestAbandoned          UMETA(DisplayName = "Quest Abandoned"),
    QuestDeclined           UMETA(DisplayName = "Quest Declined"),
    ConversationOverheard   UMETA(DisplayName = "Conversation Overheard"),
    CreateTruth             UMETA(DisplayName = "Create Truth"),
    // Assessment / onboarding events
    AssessmentStarted       UMETA(DisplayName = "Assessment Started"),
    AssessmentPhaseStarted  UMETA(DisplayName = "Assessment Phase Started"),
    AssessmentPhaseCompleted UMETA(DisplayName = "Assessment Phase Completed"),
    AssessmentTierChange    UMETA(DisplayName = "Assessment Tier Change"),
    AssessmentCompleted     UMETA(DisplayName = "Assessment Completed"),
    OnboardingStepStarted   UMETA(DisplayName = "Onboarding Step Started"),
    OnboardingStepCompleted UMETA(DisplayName = "Onboarding Step Completed"),
    OnboardingCompleted     UMETA(DisplayName = "Onboarding Completed"),
    PeriodicAssessmentTriggered UMETA(DisplayName = "Periodic Assessment Triggered"),
    AssessmentConversationQuestStart UMETA(DisplayName = "Assessment Conversation Quest Start"),
    AssessmentConversationCompleted UMETA(DisplayName = "Assessment Conversation Completed"),
    // Visual vocabulary quest events
    VisualVocabPrompted     UMETA(DisplayName = "Visual Vocab Prompted"),
    VisualVocabAnswered     UMETA(DisplayName = "Visual Vocab Answered"),
    // Follow directions quest events
    DirectionStepCompleted UMETA(DisplayName = "Direction Step Completed"),
    // Pronunciation quest events
    PronunciationAssessmentData UMETA(DisplayName = "Pronunciation Assessment Data"),
    // Point-and-name vocabulary events
    ObjectNamed UMETA(DisplayName = "Object Named"),
    // Object examination events
    ObjectExamined UMETA(DisplayName = "Object Examined"),
    // NPC exam events
    NpcExamStarted          UMETA(DisplayName = "NPC Exam Started"),
    NpcExamListeningReady   UMETA(DisplayName = "NPC Exam Listening Ready"),
    NpcExamQuestionAnswered UMETA(DisplayName = "NPC Exam Question Answered"),
    // Achievement events
    AchievementUnlocked UMETA(DisplayName = "Achievement Unlocked"),
    // Quest notification & reminder events
    QuestReminder       UMETA(DisplayName = "Quest Reminder"),
    QuestExpired        UMETA(DisplayName = "Quest Expired"),
    QuestMilestone      UMETA(DisplayName = "Quest Milestone"),
    DailyQuestsReset    UMETA(DisplayName = "Daily Quests Reset"),
    // NPC exam events
    NpcExamRequested    UMETA(DisplayName = "NPC Exam Requested"),
    NpcExamCompleted    UMETA(DisplayName = "NPC Exam Completed"),
    // Topic-tagged conversation turn events
    NpcConversationTurn UMETA(DisplayName = "NPC Conversation Turn"),
    // Skill reward events
    SkillRewardsApplied UMETA(DisplayName = "Skill Rewards Applied"),
    // Assessment conversation events
    AssessmentConversationInitiated UMETA(DisplayName = "Assessment Conversation Initiated"),
    AssessmentGuidedConversationStart UMETA(DisplayName = "Assessment Guided Conversation Start"),
    // Object identification events
    ObjectIdentified UMETA(DisplayName = "Object Identified"),
    // Sign reading events
    SignRead UMETA(DisplayName = "Sign Read"),
    // Generic feature-module events
    KnowledgeApplied UMETA(DisplayName = "Knowledge Applied"),
    IdentificationPrompted UMETA(DisplayName = "Identification Prompted"),
    IdentificationCorrect UMETA(DisplayName = "Identification Correct"),
    IdentificationIncorrect UMETA(DisplayName = "Identification Incorrect"),
    // Playthrough completion events
    PlaythroughCompleted UMETA(DisplayName = "Playthrough Completed"),
    PlaythroughCompletionRequested UMETA(DisplayName = "Playthrough Completion Requested"),
    DepartureAssessmentTriggered UMETA(DisplayName = "Departure Assessment Triggered"),
    // Time events
    HourChanged UMETA(DisplayName = "Hour Changed"),
    DayChanged UMETA(DisplayName = "Day Changed"),
    TimeOfDayChanged UMETA(DisplayName = "Time Of Day Changed"),
    // NPC relationship events
    NpcRelationshipChanged UMETA(DisplayName = "NPC Relationship Changed"),
    // Container events
    ContainerOpened UMETA(DisplayName = "Container Opened"),
    // Escort quest events
    EscortStarted UMETA(DisplayName = "Escort Started"),
    EscortCompleted UMETA(DisplayName = "Escort Completed"),
    // Mercantile events
    ItemPurchased UMETA(DisplayName = "Item Purchased"),
    FoodOrdered UMETA(DisplayName = "Food Ordered"),
    PriceHaggled UMETA(DisplayName = "Price Haggled"),
    // Text collection events
    TextCollected UMETA(DisplayName = "Text Collected"),
    // XP and level-up events
    XpGained UMETA(DisplayName = "XP Gained"),
    LevelUp UMETA(DisplayName = "Level Up"),
    // Vocabulary hover-lookup events
    VocabularyLookup UMETA(DisplayName = "Vocabulary Lookup"),
    // Vehicle events
    VehicleMounted UMETA(DisplayName = "Vehicle Mounted"),
    VehicleDismounted UMETA(DisplayName = "Vehicle Dismounted"),
    // Photography events
    PhotoTaken UMETA(DisplayName = "Photo Taken"),
    // Furniture interaction events
    FurnitureSat UMETA(DisplayName = "Furniture Sat"),
    FurnitureStood UMETA(DisplayName = "Furniture Stood"),
    FurnitureSlept UMETA(DisplayName = "Furniture Slept"),
    FurnitureReadLore UMETA(DisplayName = "Furniture Read Lore"),
    FurnitureWorked UMETA(DisplayName = "Furniture Worked"),
    // Clue discovery events
    ClueDiscovered UMETA(DisplayName = "Clue Discovered"),
    // Conversational action events
    ConversationalAction UMETA(DisplayName = "Conversational Action"),
    ConversationTurnCounted UMETA(DisplayName = "Conversation Turn Counted"),
    // Physical action events
    PhysicalActionCompleted UMETA(DisplayName = "Physical Action Completed"),
    // Reading completion events
    ReadingCompleted UMETA(DisplayName = "Reading Completed"),
    QuestionsAnswered UMETA(DisplayName = "Questions Answered"),
    // Assessment objective triggers
    WritingSubmitted UMETA(DisplayName = "Writing Submitted"),
    ListeningCompleted UMETA(DisplayName = "Listening Completed"),
    // Exploration discovery events
    InvestigationCompleted UMETA(DisplayName = "Investigation Completed"),
    // NPC activity observation events
    ActivityObserved UMETA(DisplayName = "Activity Observed"),
    // Conversational action completion events
    ConversationalActionCompleted UMETA(DisplayName = "Conversational Action Completed"),
    // Language learning discovery events
    TextFound UMETA(DisplayName = "Text Found"),
    TextRead UMETA(DisplayName = "Text Read"),
    // Object point-and-name events
    ObjectPointedAndNamed UMETA(DisplayName = "Object Pointed And Named"),
    // Translation / pronunciation attempt events
    TranslationAttempt UMETA(DisplayName = "Translation Attempt"),
    PronunciationAttempt UMETA(DisplayName = "Pronunciation Attempt"),
    // UI panel events (tutorial completion triggers)
    InventoryOpened UMETA(DisplayName = "Inventory Opened"),
    QuestLogOpened UMETA(DisplayName = "Quest Log Opened"),
    // CEFR level advancement (auto-level-up after conversation)
    CefrLevelAdvanced UMETA(DisplayName = "CEFR Level Advanced"),
    // Volition schedule events
    VolitionScheduleOverride UMETA(DisplayName = "Volition Schedule Override"),
    VolitionReturnToSchedule UMETA(DisplayName = "Volition Return To Schedule"),
    // NPC greeting events
    NpcGreeting UMETA(DisplayName = "NPC Greeting"),
    // Item sold events
    ItemSold UMETA(DisplayName = "Item Sold"),
    // Conversation assessment completed
    ConversationAssessmentCompleted UMETA(DisplayName = "Conversation Assessment Completed"),
    // Unified action execution event
    ActionExecuted UMETA(DisplayName = "Action Executed"),
    // NPC speech act events
    NpcSpeechAct UMETA(DisplayName = "NPC Speech Act"),
    // Grammar weakness events
    GrammarWeaknessDetected UMETA(DisplayName = "Grammar Weakness Detected"),
    // Player proximity events
    PlayerNearNpc UMETA(DisplayName = "Player Near NPC")
};

// ── String ↔ Enum conversion ─────────────────────────────────────────────────
// Convert between snake_case event type strings (matching GameEventBus.ts) and
// the EInsimulEventType enum. Defined in EventBus.cpp.

/** Parse a snake_case event type string into the corresponding enum value.
 *  Returns ItemCollected and logs a warning for unknown strings. */
EInsimulEventType EventTypeFromString(const FString& TypeString);

/** Convert an enum value to its canonical snake_case string representation. */
FString EventTypeToString(EInsimulEventType EventType);

/**
 * Optional taxonomy fields carried on item events for Prolog assertion.
 * Mirrors ItemTaxonomy from GameEventBus.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulItemTaxonomy
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Material;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BaseType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Rarity;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemType;
};

/**
 * A single turn in a conversation transcript. Role is one of
 * "user" (player), "assistant" (NPC), or "system" (role/context).
 * Used by assessment_conversation_completed so the server grader
 * can score per-turn against the phase's scoringDimensions rubric.
 */
USTRUCT(BlueprintType)
struct FInsimulConversationTurn
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Role;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Content;
};

/**
 * Unified game event payload.
 *
 * Since C++ cannot use TypeScript-style discriminated unions, this struct
 * carries all possible fields across every event type. Only fields relevant
 * to the given EventType are populated; the rest use defaults. This mirrors
 * the 120+-variant GameEvent union in GameEventBus.ts.
 */
USTRUCT(BlueprintType)
struct FInsimulGameEvent
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) EInsimulEventType EventType = EInsimulEventType::ItemCollected;

    // ── Common fields ─────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ItemName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Quantity = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FInsimulItemTaxonomy Taxonomy;
    /** Source of item acquisition: container, shop, world, gift, craft, quest_reward. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Source;

    // ── Entity / location fields ──────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString EntityId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString EnemyType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LocationId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LocationName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NPCId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NPCName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TurnCount = 0;

    // ── Dialogue / vocabulary ─────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Word;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bCorrect = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString VocabularyCategory;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Keywords;

    // ── Quest fields ──────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString QuestId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString QuestTitle;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssignedByNpcId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssignedByNpcName;

    // ── Combat fields ─────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActionType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetId;

    // ── Reputation fields ─────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FactionId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Delta = 0;

    // ── Settlement fields ─────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SettlementName;

    // ── Puzzle fields ─────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PuzzleId;

    // ── Equipment fields ──────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Slot;

    // ── Utterance / language quest fields ────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ObjectiveId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Input;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Score = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bPassed = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Feedback;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Current = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Required = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Percentage = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float FinalScore = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 XpAwarded = 0;

    // ── Ambient conversation fields ─────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ConversationId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Participants;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Topic;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 DurationMs = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 VocabularyCount = 0;

    // ── Vocabulary overheard fields ─────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Translation;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Language;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Context;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SpeakerNpcId;

    // ── State / truth fields ────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CharacterId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StateType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Cause;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Title;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Content;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString EntryType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Category;

    // ── Romance fields ──────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bAccepted = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StageChange;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FromStage;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ToStage;

    // ── Volition fields ─────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActionId;

    // ── Puzzle / quest failure fields ───────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PuzzleType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Attempts = 0;

    // ── NPC conversation turn fields ──────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TopicTag;

    // ── Conversation overheard fields ───────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NpcId1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NpcId2;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString LanguageUsed;

    // ── Assessment / onboarding fields ───────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SessionId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString InstrumentId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Phase;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ParticipantId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float TotalScore = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float GainScore = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString FromTier;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ToTier;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssessmentType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PlayerId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PhaseId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 PhaseIndex = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MaxScore = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float TotalMaxScore = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CefrLevel;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString StepId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 StepIndex = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalSteps = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalDurationMs = 0;

    // ── Assessment conversation quest fields ─────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FString> Topics;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MinExchanges = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxExchanges = 0;
    /**
     * Full player↔NPC exchange from the conversation phase. Populated on
     * AssessmentConversationCompleted so the server grader can score
     * per-turn against the rubric. Only user/assistant turns produce
     * task results downstream; system turns carry NPC role context.
     */
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TArray<FInsimulConversationTurn> Transcript;

    // ── Follow directions fields ───────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ObjectiveId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 StepsCompleted = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 StepsRequired = 0;

    // ── Periodic assessment fields ────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Level = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Tier;

    // ── Point-and-name / object examination fields ─────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ObjectId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ObjectName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetWord;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetLanguage;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Pronunciation;

    // ── NPC exam fields ──────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ExamId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BusinessType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AudioUrl;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Passage;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxReplays = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 QuestionCount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString QuestionId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 MaxPoints = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float TotalMaxPoints = 0.0f;

    // ── Achievement fields ─────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AchievementId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AchievementName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Icon;

    // ── Quest notification / reminder fields ─────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Message;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ReminderType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MilestoneType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Label;

    // ── NPC exam fields ──────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ExamType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString BusinessContext;

    // ── Pronunciation bonus fields ─────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 PronunciationBonusXp = 0;

    // ── Knowledge / identification fields ──────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Key;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PlayerAnswer;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsActivity = false;

    // ── Playthrough completion fields ────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PlaythroughId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Playtime = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 QuestsCompleted = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 NpcsInteracted = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 VocabularyLearned = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CefrStart;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString CefrEnd;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Trigger;

    // ── Time fields ──────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Hour = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Day = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Timestep = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString From;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString To;

    // ── XP / level-up fields ────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Amount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Reason;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 NewTotal = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 OldLevel = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 NewLevel = 0;

    // ── Vocabulary lookup fields ─────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Meaning;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Source;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 DwellMs = 0;

    // ── NPC relationship fields ─────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float PreviousStrength = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float NewStrength = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PreviousTier;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString NewTier;

    // ── Language learning / objective fields ─────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TextId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SignId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 WordCount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SubjectName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Phrase;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalTurns = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 ObjectiveIndex = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalMaxPointsInt = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalScoreInt = 0;

    // ── Volition schedule fields ────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString GoalId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bReturnToSchedule = false;

    // ── NPC greeting fields ─────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString GreetingText;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsFirstMeeting = false;

    // ── Unified action execution fields ─────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActionName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActorId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ActorName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TargetName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Result;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 EnergyCost = 0;

    // ── NPC speech act fields ───────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ExtractedDataJson;

    // ── Grammar weakness fields ─────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Pattern;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ErrorRate = 0.0f;

    // ── Player proximity fields ─────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Distance = 0.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WorldId;

    // ── Mercantile extended fields ──────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MerchantId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString MerchantName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalPrice = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString TypedWord;

    // ── Volition extended fields ────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString GrammarLevel;

    // ── Clue discovery fields ─────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ClueId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ClueCategory;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ClueSource;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 ClueCount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TotalClueCount = 0;
};

// ── Delegates ────────────────────────────────────────────────────────────────

/** Delegate for type-specific event subscription. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGameEvent, const FInsimulGameEvent&, Event);

/**
 * Centralized typed event system that bridges player actions to quest tracking
 * and Prolog fact assertion. All game actions (combat, items, dialogue, etc.)
 * emit events through this bus, which subscribers (PrologEngine, QuestSystem)
 * consume to update state.
 *
 * Ported from Insimul's Babylon.js GameEventBus to Unreal subsystem.
 */
UCLASS()
class INSIMULEXPORT_API UEventBus : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /**
     * Emit an event to all registered handlers.
     * Type-specific handlers and the global handler are both invoked.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|EventBus")
    void Emit(const FInsimulGameEvent& Event);

    /**
     * Subscribe to a specific event type via delegate.
     * Returns an integer handle that can be passed to Unsubscribe().
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|EventBus")
    int32 Subscribe(EInsimulEventType EventType, const FOnGameEvent& Handler);

    /**
     * Unsubscribe a previously registered handler by handle.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|EventBus")
    void Unsubscribe(int32 Handle);

    /**
     * Global event delegate — fires for every event regardless of type.
     * Bind in Blueprint or C++ to receive all events.
     */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|EventBus")
    FOnGameEvent OnAnyEvent;

    /** Remove all handlers. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|EventBus")
    void Dispose();

private:
    /** Per-type handler storage. */
    struct FTypedHandler
    {
        int32 Handle;
        EInsimulEventType EventType;
        FOnGameEvent Delegate;
    };

    TArray<FTypedHandler> TypedHandlers;
    int32 NextHandle = 1;
};
