using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul.Systems
{
    /// <summary>
    /// All game event types matching GameEventBus.ts from the Babylon.js source.
    /// </summary>
    public enum GameEventType
    {
        ItemCollected,
        EnemyDefeated,
        LocationVisited,
        NpcTalked,
        ItemDelivered,
        VocabularyUsed,
        ConversationTurn,
        QuestAccepted,
        QuestCompleted,
        QuestObjectiveCompleted,
        CombatAction,
        ReputationChanged,
        ItemCrafted,
        LocationDiscovered,
        SettlementEntered,
        PuzzleSolved,
        ItemRemoved,
        ItemUsed,
        ItemDropped,
        ItemEquipped,
        ItemUnequipped,
        UtteranceEvaluated,
        UtteranceQuestProgress,
        UtteranceQuestCompleted,
        AmbientConversationStarted,
        AmbientConversationEnded,
        VocabularyOverheard,
        StateCreatedTruth,
        StateExpiredTruth,
        RomanceAction,
        RomanceStageChanged,
        NpcVolitionAction,
        PuzzleFailed,
        QuestFailed,
        QuestAbandoned,
        ConversationOverheard,
        CreateTruth,
        // Assessment / onboarding events
        AssessmentStarted,
        AssessmentPhaseStarted,
        AssessmentPhaseCompleted,
        AssessmentTierChange,
        AssessmentCompleted,
        OnboardingStepStarted,
        OnboardingStepCompleted,
        OnboardingCompleted,
        PeriodicAssessmentTriggered,
        AssessmentConversationQuestStart,
        AssessmentConversationCompleted,
        // Visual vocabulary quest events
        VisualVocabPrompted,
        VisualVocabAnswered,
        // Follow directions quest events
        DirectionStepCompleted,
        // NPC exam events
        NpcExamStarted,
        NpcExamListeningReady,
        NpcExamQuestionAnswered,
        NpcExamCompleted,
        // Assessment conversation events
        AssessmentConversationInitiated,
        AssessmentGuidedConversationStart,
        // Achievement events
        AchievementUnlocked,
        // Quest notification & reminder events
        QuestReminder,
        QuestExpired,
        QuestMilestone,
        DailyQuestsReset,
        // NPC exam events
        NpcExamRequested,
        // NPC greeting events
        NpcGreeting,
        // Skill reward events
        SkillRewardsApplied,
        // Pronunciation assessment events
        PronunciationAssessmentData,
        // Point-and-name vocabulary events
        ObjectNamed,
        // Object examination events
        ObjectExamined,
        // Generic feature-module events
        KnowledgeApplied,
        IdentificationPrompted,
        IdentificationCorrect,
        IdentificationIncorrect,
        NpcRelationshipChanged,
        // Photography events
        PhotoTaken,
        // XP and level-up events
        XpGained,
        LevelUp,
        // Furniture interaction events
        FurnitureSat,
        FurnitureStood,
        FurnitureSlept,
        FurnitureReadLore,
        FurnitureWorked,
        // Clue discovery events
        ClueDiscovered,
        // Conversational action events
        ConversationalAction,
        ConversationTurnCounted,
        // Physical action events
        PhysicalActionCompleted,
        // Reading completion events
        ReadingCompleted,
        QuestionsAnswered,
        // Assessment objective triggers
        WritingSubmitted,
        ListeningCompleted,
        // Mercantile events
        ItemPurchased,
        FoodOrdered,
        PriceHaggled,
        // Exploration discovery events
        InvestigationCompleted,
        // NPC activity observation events
        ActivityObserved,
        // CEFR level advancement (auto-level-up after conversation)
        CefrLevelAdvanced,
        // Volition schedule events
        VolitionScheduleOverride,
        VolitionReturnToSchedule,
        // Quest declined events
        QuestDeclined,
        // Item sold events
        ItemSold,
        // Conversation assessment completed
        ConversationAssessmentCompleted,
        // Unified action execution event
        ActionExecuted,
        // NPC speech act events
        NpcSpeechAct,
        // Grammar weakness events
        GrammarWeaknessDetected,
        // Player proximity events
        PlayerNearNpc,
        // NPC conversation turn events
        NpcConversationTurn,
        // Playthrough completion events
        PlaythroughCompleted,
        PlaythroughCompletionRequested,
        DepartureAssessmentTriggered,
        // Time events
        HourChanged,
        DayChanged,
        TimeOfDayChanged,
        // Container events
        ContainerOpened,
        // Escort quest events
        EscortStarted,
        EscortCompleted,
        // Text collection events
        TextCollected,
        TextFound,
        TextRead,
        // Vocabulary lookup events
        VocabularyLookup,
        // Vehicle events
        VehicleMounted,
        VehicleDismounted,
        // Object pointed and named events
        ObjectPointedAndNamed,
        ObjectIdentified,
        SignRead,
        // Translation / pronunciation attempt events
        TranslationAttempt,
        PronunciationAttempt,
        // Conversational action completed
        ConversationalActionCompleted,
        // UI panel events
        InventoryOpened,
        QuestLogOpened
    }

    /// <summary>
    /// Optional taxonomy fields carried on item events for Prolog assertion.
    /// </summary>
    [System.Serializable]
    public class ItemTaxonomy
    {
        public string category;
        public string material;
        public string baseType;
        public string rarity;
        public string itemType;
    }

    // ── Event Data Classes ───────────────────────────────────────────────────

    /// <summary>
    /// Abstract base class for all game events.
    /// </summary>
    public abstract class GameEvent
    {
        public abstract GameEventType EventType { get; }
    }

    public class ItemCollectedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemCollected;
        public string itemId;
        public string itemName;
        public int quantity;
        /// <summary>Source of acquisition: container, shop, world, gift, craft, quest_reward.</summary>
        public string source;
        public ItemTaxonomy taxonomy;
    }

    public class EnemyDefeatedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.EnemyDefeated;
        public string entityId;
        public string enemyType;
    }

    public class LocationVisitedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.LocationVisited;
        public string locationId;
        public string locationName;
    }

    public class NpcTalkedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcTalked;
        public string npcId;
        public string npcName;
        public int turnCount;
    }

    public class ItemDeliveredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemDelivered;
        public string npcId;
        public string itemId;
        public string itemName;
    }

    public class VocabularyUsedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VocabularyUsed;
        public string word;
        public bool correct;
        public string category;
    }

    public class ConversationTurnEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ConversationTurn;
        public string npcId;
        public string[] keywords;
    }

    public class QuestAcceptedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestAccepted;
        public string questId;
        public string questTitle;
        public string assignedByNpcId;
        public string assignedByNpcName;
    }

    public class QuestCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestCompleted;
        public string questId;
        public string questTitle;
        public string assignedByNpcId;
    }

    public class QuestObjectiveCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestObjectiveCompleted;
        public string questId;
        public string objectiveId;
    }

    public class CombatActionEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.CombatAction;
        public string actionType;
        public string targetId;
    }

    public class ReputationChangedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ReputationChanged;
        public string factionId;
        public int delta;
    }

    public class ItemCraftedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemCrafted;
        public string itemId;
        public string itemName;
        public int quantity;
        public ItemTaxonomy taxonomy;
    }

    public class LocationDiscoveredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.LocationDiscovered;
        public string locationId;
        public string locationName;
        public bool isWriterSecret;
    }

    public class SettlementEnteredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.SettlementEntered;
        public string settlementId;
        public string settlementName;
    }

    public class PuzzleSolvedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PuzzleSolved;
        public string puzzleId;
    }

    public class ItemRemovedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemRemoved;
        public string itemId;
        public string itemName;
        public int quantity;
    }

    public class ItemUsedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemUsed;
        public string itemId;
        public string itemName;
    }

    public class ItemDroppedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemDropped;
        public string itemId;
        public string itemName;
        public int quantity;
    }

    public class ItemEquippedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemEquipped;
        public string itemId;
        public string itemName;
        public string slot;
    }

    public class ItemUnequippedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemUnequipped;
        public string itemId;
        public string itemName;
        public string slot;
    }

    public class UtteranceEvaluatedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.UtteranceEvaluated;
        public string objectiveId;
        public string input;
        public float score;
        public bool passed;
        public string feedback;
    }

    public class UtteranceQuestProgressEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.UtteranceQuestProgress;
        public string questId;
        public string objectiveId;
        public int current;
        public int required;
        public float percentage;
    }

    public class UtteranceQuestCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.UtteranceQuestCompleted;
        public string questId;
        public string objectiveId;
        public float finalScore;
        public int xpAwarded;
        public int pronunciationBonusXp;
    }

    public class AmbientConversationStartedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AmbientConversationStarted;
        public string conversationId;
        public string[] participants;
        public string locationId;
        public string topic;
    }

    public class AmbientConversationEndedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AmbientConversationEnded;
        public string conversationId;
        public string[] participants;
        public int durationMs;
        public int vocabularyCount;
    }

    public class VocabularyOverheardEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VocabularyOverheard;
        public string word;
        public string translation;
        public string language;
        public string context;
        public string conversationId;
        public string speakerNpcId;
    }

    public class StateCreatedTruthEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.StateCreatedTruth;
        public string characterId;
        public string stateType;
        public string cause;
        public string title;
        public string content;
        public string entryType;
    }

    public class StateExpiredTruthEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.StateExpiredTruth;
        public string characterId;
        public string stateType;
        public string cause;
        public string title;
        public string content;
        public string entryType;
    }

    public class RomanceActionEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.RomanceAction;
        public string npcId;
        public string npcName;
        public string actionType;
        public bool accepted;
        public string stageChange;
    }

    public class RomanceStageChangedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.RomanceStageChanged;
        public string npcId;
        public string npcName;
        public string fromStage;
        public string toStage;
    }

    public class NpcVolitionActionEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcVolitionAction;
        public string npcId;
        public string actionId;
        public string targetId;
        public float score;
        public string category;
        public string grammarLevel;
        public string goalId;
    }

    public class PuzzleFailedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PuzzleFailed;
        public string puzzleId;
        public string puzzleType;
        public int attempts;
    }

    public class QuestFailedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestFailed;
        public string questId;
        public string assignedByNpcId;
    }

    public class QuestAbandonedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestAbandoned;
        public string questId;
        public string assignedByNpcId;
    }

    public class ConversationOverheardEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ConversationOverheard;
        public string npcId1;
        public string npcId2;
        public string topic;
        public string languageUsed;
    }

    public class CreateTruthEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.CreateTruth;
        public string characterId;
        public string title;
        public string content;
        public string entryType;
        public string category;
    }

    // ── Assessment / Onboarding Events ───────────────────────────────────────

    public class AssessmentStartedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentStarted;
        public string sessionId;
        public string instrumentId;
        public string phase;
        public string participantId;
        public string assessmentType;
        public string playerId;
    }

    public class AssessmentPhaseStartedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentPhaseStarted;
        public string sessionId;
        public string instrumentId;
        public string phase;
        public string phaseId;
        public int phaseIndex;
    }

    public class AssessmentPhaseCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentPhaseCompleted;
        public string sessionId;
        public string instrumentId;
        public string phase;
        public float score;
        public string phaseId;
        public float maxScore;
    }

    public class AssessmentTierChangeEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentTierChange;
        public string participantId;
        public string instrumentId;
        public string fromTier;
        public string toTier;
        public float score;
    }

    public class AssessmentCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentCompleted;
        public string sessionId;
        public string instrumentId;
        public float totalScore;
        public float gainScore;
        public float totalMaxScore;
        public string cefrLevel;
    }

    public class OnboardingStepStartedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.OnboardingStepStarted;
        public string stepId;
        public int stepIndex;
        public int totalSteps;
    }

    public class OnboardingStepCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.OnboardingStepCompleted;
        public string stepId;
        public int stepIndex;
        public int totalSteps;
        public int durationMs;
    }

    public class OnboardingCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.OnboardingCompleted;
        public int totalSteps;
        public int totalDurationMs;
    }

    public class PeriodicAssessmentTriggeredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PeriodicAssessmentTriggered;
        public int level;
        public string tier;
    }

    public class AssessmentConversationQuestStartEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentConversationQuestStart;
        public string phaseId;
        public string[] topics;
        public int minExchanges;
        public int maxExchanges;
    }

    /// <summary>
    /// A single turn of a conversation transcript. Role is "user" (player),
    /// "assistant" (NPC), or "system" (role/context). Used by
    /// AssessmentConversationCompletedEvent so the server grader can score
    /// per-turn against the phase's scoringDimensions rubric.
    /// </summary>
    [System.Serializable]
    public class ConversationTurn
    {
        public string role;
        public string content;
    }

    public class AssessmentConversationCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentConversationCompleted;
        public string npcId;
        /// <summary>Legacy heuristic score. Prefer <c>transcript</c> when present — the server grader scores per-turn.</summary>
        public float score;
        /// <summary>Full player↔NPC exchange for per-turn rubric grading. Empty if transcript capture was unavailable.</summary>
        public ConversationTurn[] transcript;
    }

    // ── Visual Vocabulary / Follow Directions Events ────────────────────────

    public class VisualVocabPromptedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VisualVocabPrompted;
        public string targetId;
        public string questId;
        public string objectiveId;
        public bool isActivity;
    }

    public class VisualVocabAnsweredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VisualVocabAnswered;
        public string targetId;
        public string questId;
        public bool passed;
        public float score;
        public string playerAnswer;
    }

    public class DirectionStepCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.DirectionStepCompleted;
        public string questId;
        public string objectiveId;
        public int stepIndex;
        public int stepsCompleted;
        public int stepsRequired;
    }

    // ── NPC Exam Events ──────────────────────────────────────────────────────

    public class NpcExamStartedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcExamStarted;
        public string examId;
        public string npcId;
        public string npcName;
        public string businessType;
        public string examType;
        public string category;
        public int questionCount;
    }

    [System.Serializable]
    public class NpcExamQuestion
    {
        public string id;
        public string questionText;
        public int maxPoints;
    }

    public class NpcExamListeningReadyEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcExamListeningReady;
        public string examId;
        public string audioUrl;
        public string passage;
        public NpcExamQuestion[] questions;
        public int maxReplays;
    }

    public class NpcExamQuestionAnsweredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcExamQuestionAnswered;
        public string examId;
        public string questionId;
        public bool correct;
        public float score;
        public int maxPoints;
    }

    public class NpcExamCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcExamCompleted;
        public string examId;
        public string npcId;
        public float score;
        public float maxScore;
        public float percentage;
        public bool passed;
        public float totalScore;
        public float totalMaxPoints;
        public string cefrLevel;
        public string category;
    }

    // ── Assessment Conversation Events ────────────────────────────────────────

    public class AssessmentConversationInitiatedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentConversationInitiated;
        public string npcId;
    }

    public class AssessmentGuidedConversationStartEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AssessmentGuidedConversationStart;
        public string[] topics;
        public int minExchanges;
        public int maxExchanges;
    }

    // ── Achievement Events ───────────────────────────────────────────────────

    public class AchievementUnlockedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.AchievementUnlocked;
        public string achievementId;
        public string achievementName;
        public string description;
        public string icon;
    }

    // ── Quest Notification / Reminder Events ─────────────────────────────────

    public class QuestReminderEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestReminder;
        public string questId;
        public string questTitle;
        public string message;
        public string reminderType;
    }

    public class QuestExpiredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestExpired;
        public string questId;
        public string questTitle;
    }

    public class QuestMilestoneEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestMilestone;
        public string milestoneType;
        public string label;
    }

    public class DailyQuestsResetEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.DailyQuestsReset;
    }

    // ── NPC Exam Request Events ───────────────────────────────────────────────

    public class NpcExamRequestedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcExamRequested;
        public string npcId;
        public string npcName;
        public string examType;
        public string businessContext;
    }

    // ── Skill Reward Events ──────────────────────────────────────────────────

    [System.Serializable]
    public class SkillReward
    {
        public string skillId;
        public string name;
        public int level;
    }

    public class SkillRewardsAppliedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.SkillRewardsApplied;
        public string questId;
        public SkillReward[] rewards;
    }

    // ── Pronunciation Assessment Events ──────────────────────────────────────

    public class PronunciationAssessmentDataEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PronunciationAssessmentData;
        public string questId;
        public float averageScore;
        public int sampleCount;
    }

    // ── Point-and-Name / Object Examination Events ──────────────────────────

    public class ObjectNamedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ObjectNamed;
        public string objectId;
        public string targetWord;
        public string category;
        public bool correct;
        public int attempts;
    }

    public class ObjectExaminedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ObjectExamined;
        public string objectId;
        public string objectName;
        public string targetWord;
        public string targetLanguage;
        public string pronunciation;
        public string category;
    }

    // ── Generic Feature-Module Events ────────────────────────────────────────

    public class KnowledgeAppliedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.KnowledgeApplied;
        public string key;
        public bool correct;
    }

    public class IdentificationPromptedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.IdentificationPrompted;
        public string targetId;
        public string questId;
        public string objectiveId;
        public bool isActivity;
    }

    public class IdentificationCorrectEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.IdentificationCorrect;
        public string targetId;
        public string questId;
        public float score;
        public string playerAnswer;
    }

    public class IdentificationIncorrectEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.IdentificationIncorrect;
        public string targetId;
        public string questId;
        public float score;
        public string playerAnswer;
    }

    public class NpcRelationshipChangedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcRelationshipChanged;
        public string npcId;
        public string npcName;
        public float previousStrength;
        public float newStrength;
        public string previousTier;
        public string newTier;
        public string cause;
        public float delta;
    }

    public class PhotoTakenEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PhotoTaken;
        public string subjectId;
        public string subjectName;
        public string subjectCategory; // "item", "npc", "building", "nature"
        public string location;
    }

    // ── XP / Level-Up Events ──────────────────────────────────────────────────

    [System.Serializable]
    public class LevelRewardData
    {
        public string type;
        public string value;
        public string label;
    }

    public class XpGainedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.XpGained;
        public int amount;
        public string reason;
        public int newTotal;
        public int level;
    }

    public class LevelUpEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.LevelUp;
        public int oldLevel;
        public int newLevel;
        public string tier;
        public LevelRewardData[] rewards;
    }

    // ── Furniture Interaction Events ──────────────────────────────────────────

    public class FurnitureSatEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.FurnitureSat;
        public string furnitureType;
        public string buildingId;
    }

    public class FurnitureStoodEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.FurnitureStood;
        public string furnitureType;
        public string buildingId;
    }

    public class FurnitureSleptEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.FurnitureSlept;
        public int hoursSlept;
        public string buildingId;
    }

    public class FurnitureReadLoreEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.FurnitureReadLore;
        public string truthId;
        public string truthTitle;
        public string buildingId;
    }

    public class FurnitureWorkedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.FurnitureWorked;
        public string buildingId;
        public string businessType;
    }

    public class ClueDiscoveredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ClueDiscovered;
        public string clueId;
        public string clueCategory;
        public string clueSource;
        public int clueCount;
        public int totalClueCount;
    }

    public class ConversationalActionEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ConversationalAction;
        public string action;
        public string topic;
        public string npcId;
        public string questId;
    }

    public class ConversationTurnCountedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ConversationTurnCounted;
        public string npcId;
        public int totalTurns;
        public int meaningfulTurns;
    }

    public class PhysicalActionCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PhysicalActionCompleted;
        public string actionType;
        public string locationId;
        public string buildingId;
        public int energyCost;
        public int xpGained;
    }

    public class ReadingCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ReadingCompleted;
        public string textId;
        public string title;
    }

    public class QuestionsAnsweredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestionsAnswered;
        public string textId;
        public float score;
        public int questionsCorrect;
        public int questionsTotal;
    }

    public class WritingSubmittedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.WritingSubmitted;
        public string text;
        public int wordCount;
    }

    public class ListeningCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ListeningCompleted;
    }

    public class InvestigationCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.InvestigationCompleted;
        public string locationId;
        public string locationName;
        public string investigationPointId;
        public string contentType;
        public string content;
    }

    public class ActivityObservedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ActivityObserved;
        public string npcId;
        public string npcName;
        public string activity;
        public float durationSeconds;
    }

    public class CefrLevelAdvancedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.CefrLevelAdvanced;
        public string oldLevel;
        public string newLevel;
    }

    // ── Volition Schedule Events ────────────────────────────────────────────
    public class VolitionScheduleOverrideEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VolitionScheduleOverride;
        public string npcId;
        public string goalId;
        public string reason;
        public bool returnToSchedule;
    }

    public class VolitionReturnToScheduleEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VolitionReturnToSchedule;
        public string npcId;
        public string goalId;
    }

    // ── Quest Declined Event ────────────────────────────────────────────────
    public class QuestDeclinedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestDeclined;
        public string npcId;
        public string npcName;
        public string questTitle;
    }

    // ── NPC Greeting Event ──────────────────────────────────────────────────
    public class NpcGreetingEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcGreeting;
        public string npcId;
        public string npcName;
        public string language;
        public string greetingText;
        public bool isFirstMeeting;
    }

    // ── Item Sold Event ─────────────────────────────────────────────────────
    public class ItemSoldEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemSold;
        public string itemId;
        public string itemName;
        public int quantity;
        public int totalPrice;
        public string merchantId;
        public string merchantName;
    }

    // ── Conversation Assessment Completed Event ─────────────────────────────
    public class ConversationAssessmentCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ConversationAssessmentCompleted;
        public string npcId;
        public int turnCount;
        public string questId;
    }

    // ── Unified Action Executed Event ───────────────────────────────────────
    public class ActionExecutedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ActionExecuted;
        public string actionName;
        public string actorId;
        public string actorName;
        public string targetId;
        public string targetName;
        public string category;
        public string result;
        public string itemName;
        public string itemType;
        public int xpGained;
        public int energyCost;
    }

    // ── NPC Speech Act Event ────────────────────────────────────────────────
    public class NpcSpeechActEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcSpeechAct;
        public string npcId;
        public string npcName;
        public string actionType;
        public Dictionary<string, string> extractedData;
    }

    // ── Grammar Weakness Event ──────────────────────────────────────────────
    public class GrammarWeaknessDetectedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.GrammarWeaknessDetected;
        public string pattern;
        public float errorRate;
        public int totalAttempts;
    }

    // ── Player Near NPC Event ───────────────────────────────────────────────
    public class PlayerNearNpcEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PlayerNearNpc;
        public string npcId;
        public string npcName;
        public string worldId;
        public float distance;
    }

    // ── Time Events ─────────────────────────────────────────────────────────
    public class HourChangedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.HourChanged;
        public int hour;
        public int day;
    }

    public class DayChangedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.DayChanged;
        public int day;
        public int timestep;
    }

    public class TimeOfDayChangedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.TimeOfDayChanged;
        public string from;
        public string to;
        public int hour;
    }

    // ── Container Events ────────────────────────────────────────────────────
    public class ContainerOpenedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ContainerOpened;
        public string containerId;
        public string containerType;
        public string buildingId;
        public string location;
        public int itemCount;
    }

    // ── Escort Events ───────────────────────────────────────────────────────
    public class EscortStartedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.EscortStarted;
        public string questId;
        public string objectiveId;
        public string npcId;
        public string npcName;
        public float destinationX;
        public float destinationZ;
    }

    public class EscortCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.EscortCompleted;
        public string questId;
        public string objectiveId;
        public string npcId;
    }

    // ── Mercantile Events ───────────────────────────────────────────────────
    public class ItemPurchasedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ItemPurchased;
        public string itemId;
        public string itemName;
        public int quantity;
        public int totalPrice;
        public string merchantId;
        public string merchantName;
        public string businessType;
    }

    public class FoodOrderedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.FoodOrdered;
        public string itemId;
        public string itemName;
        public int quantity;
        public string merchantId;
        public string merchantName;
        public string businessType;
    }

    public class PriceHaggledEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PriceHaggled;
        public string itemId;
        public string itemName;
        public string merchantId;
        public string merchantName;
        public string typedWord;
        public string targetWord;
    }

    // ── Text Collection Events ──────────────────────────────────────────────
    public class TextCollectedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.TextCollected;
        public string textId;
        public string title;
        public string textType;
        public string difficulty;
        public int vocabularyWordCount;
        public string clueText;
        public string authorName;
    }

    public class TextFoundEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.TextFound;
        public string textId;
        public string textName;
    }

    public class TextReadEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.TextRead;
        public string textId;
        public string title;
    }

    // ── Vocabulary Lookup Event ─────────────────────────────────────────────
    public class VocabularyLookupEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VocabularyLookup;
        public string word;
        public string meaning;
        public string category;
        public string source;
        public string objectId;
        public int dwellMs;
    }

    // ── Vehicle Events ──────────────────────────────────────────────────────
    public class VehicleMountedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VehicleMounted;
        public string vehicleType;
    }

    public class VehicleDismountedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.VehicleDismounted;
        public string vehicleType;
    }

    // ── Object Identification Events ────────────────────────────────────────
    public class ObjectPointedAndNamedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ObjectPointedAndNamed;
        public string objectId;
        public string objectName;
        public string targetWord;
        public string category;
        public string questId;
    }

    public class ObjectIdentifiedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ObjectIdentified;
        public string objectId;
        public string objectName;
        public string targetWord;
        public string category;
        public string questId;
    }

    public class SignReadEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.SignRead;
        public string signId;
        public string objectId;
        public string targetText;
        public string nativeText;
        public string category;
        public string questId;
    }

    // ── Translation / Pronunciation Attempt Events ──────────────────────────
    public class TranslationAttemptEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.TranslationAttempt;
        public string phrase;
        public bool isCorrect;
        public string questId;
    }

    public class PronunciationAttemptEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PronunciationAttempt;
        public string phrase;
        public float score;
        public bool passed;
        public string questId;
    }

    // ── Conversational Action Completed Event ───────────────────────────────
    public class ConversationalActionCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.ConversationalActionCompleted;
        public string action;
        public string npcId;
        public string questId;
    }

    // ── NPC Conversation Turn Event ─────────────────────────────────────────
    public class NpcConversationTurnEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.NpcConversationTurn;
        public string npcId;
        public string topicTag;
    }

    // ── Playthrough Completion Events ───────────────────────────────────────
    public class PlaythroughCompletedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PlaythroughCompleted;
        public string playthroughId;
        public int playtime;
        public int questsCompleted;
        public int npcsInteracted;
        public int vocabularyLearned;
        public string cefrStart;
        public string cefrEnd;
    }

    public class PlaythroughCompletionRequestedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.PlaythroughCompletionRequested;
        public string trigger;
    }

    public class DepartureAssessmentTriggeredEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.DepartureAssessmentTriggered;
        public string playthroughId;
    }

    // ── UI Panel Events ─────────────────────────────────────────────────────
    public class InventoryOpenedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.InventoryOpened;
    }

    public class QuestLogOpenedEvent : GameEvent
    {
        public override GameEventType EventType => GameEventType.QuestLogOpened;
    }

    // ── Event Bus ────────────────────────────────────────────────────────────

    /// <summary>
    /// Centralized typed event system that bridges player actions to quest tracking
    /// and Prolog fact assertion. Ported from GameEventBus.ts (Babylon.js source).
    ///
    /// Usage:
    ///   var unsub = GameEventBus.Instance.On&lt;ItemCollectedEvent&gt;(e => Debug.Log(e.itemName));
    ///   GameEventBus.Instance.Emit(new ItemCollectedEvent { itemId = "...", itemName = "Sword", quantity = 1 });
    ///   unsub(); // unsubscribe
    /// </summary>
    public class GameEventBus
    {
        private static GameEventBus _instance;
        public static GameEventBus Instance => _instance ??= new GameEventBus();

        private readonly Dictionary<GameEventType, List<Action<GameEvent>>> _handlers = new();
        private readonly List<Action<GameEvent>> _globalHandlers = new();

        /// <summary>
        /// Subscribe to a specific event type via its concrete subclass.
        /// Returns an Action that unsubscribes when invoked.
        /// </summary>
        public Action On<T>(Action<T> handler) where T : GameEvent
        {
            // Determine event type from a temporary instance
            var sample = Activator.CreateInstance<T>();
            var eventType = sample.EventType;

            Action<GameEvent> wrapped = (e) =>
            {
                if (e is T typed)
                {
                    try { handler(typed); }
                    catch (Exception ex)
                    {
                        Debug.LogError($"[GameEventBus] Error in handler for {eventType}: {ex}");
                    }
                }
            };

            if (!_handlers.ContainsKey(eventType))
                _handlers[eventType] = new List<Action<GameEvent>>();

            _handlers[eventType].Add(wrapped);

            return () => _handlers[eventType]?.Remove(wrapped);
        }

        /// <summary>
        /// Subscribe to all events regardless of type.
        /// Returns an Action that unsubscribes when invoked.
        /// </summary>
        public Action OnAny(Action<GameEvent> handler)
        {
            _globalHandlers.Add(handler);
            return () => _globalHandlers.Remove(handler);
        }

        /// <summary>
        /// Emit an event to all matching handlers and all global handlers.
        /// </summary>
        public void Emit(GameEvent gameEvent)
        {
            // Type-specific handlers
            if (_handlers.TryGetValue(gameEvent.EventType, out var list))
            {
                for (int i = list.Count - 1; i >= 0; i--)
                {
                    try { list[i]?.Invoke(gameEvent); }
                    catch (Exception ex)
                    {
                        Debug.LogError($"[GameEventBus] Error in handler for {gameEvent.EventType}: {ex}");
                    }
                }
            }

            // Global handlers
            for (int i = _globalHandlers.Count - 1; i >= 0; i--)
            {
                try { _globalHandlers[i]?.Invoke(gameEvent); }
                catch (Exception ex)
                {
                    Debug.LogError($"[GameEventBus] Error in global handler: {ex}");
                }
            }
        }

        /// <summary>
        /// Remove all handlers.
        /// </summary>
        public void Dispose()
        {
            _handlers.Clear();
            _globalHandlers.Clear();
        }
    }
}
