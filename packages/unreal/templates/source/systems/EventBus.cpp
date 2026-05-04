#include "EventBus.h"

// ── String ↔ Enum Mappings ──────────────────────────────────────────────────
// These mirror the snake_case type strings from GameEventBus.ts so that events
// round-trip through IR JSON serialization.

static const TMap<FString, EInsimulEventType>& GetStringToEventTypeMap()
{
    static const TMap<FString, EInsimulEventType> Map = {
        { TEXT("item_collected"),                    EInsimulEventType::ItemCollected },
        { TEXT("enemy_defeated"),                    EInsimulEventType::EnemyDefeated },
        { TEXT("location_visited"),                  EInsimulEventType::LocationVisited },
        { TEXT("npc_talked"),                        EInsimulEventType::NPCTalked },
        { TEXT("item_delivered"),                    EInsimulEventType::ItemDelivered },
        { TEXT("vocabulary_used"),                   EInsimulEventType::VocabularyUsed },
        { TEXT("conversation_turn"),                 EInsimulEventType::ConversationTurn },
        { TEXT("quest_accepted"),                    EInsimulEventType::QuestAccepted },
        { TEXT("quest_completed"),                   EInsimulEventType::QuestCompleted },
        { TEXT("quest_objective_completed"),         EInsimulEventType::QuestObjectiveCompleted },
        { TEXT("combat_action"),                     EInsimulEventType::CombatAction },
        { TEXT("reputation_changed"),                EInsimulEventType::ReputationChanged },
        { TEXT("item_purchased"),                    EInsimulEventType::ItemPurchased },
        { TEXT("gift_given"),                        EInsimulEventType::GiftGiven },
        { TEXT("item_crafted"),                      EInsimulEventType::ItemCrafted },
        { TEXT("location_discovered"),               EInsimulEventType::LocationDiscovered },
        { TEXT("settlement_entered"),                EInsimulEventType::SettlementEntered },
        { TEXT("puzzle_solved"),                     EInsimulEventType::PuzzleSolved },
        { TEXT("item_removed"),                      EInsimulEventType::ItemRemoved },
        { TEXT("item_used"),                         EInsimulEventType::ItemUsed },
        { TEXT("item_dropped"),                      EInsimulEventType::ItemDropped },
        { TEXT("item_equipped"),                     EInsimulEventType::ItemEquipped },
        { TEXT("item_unequipped"),                   EInsimulEventType::ItemUnequipped },
        { TEXT("utterance_evaluated"),               EInsimulEventType::UtteranceEvaluated },
        { TEXT("utterance_quest_progress"),          EInsimulEventType::UtteranceQuestProgress },
        { TEXT("utterance_quest_completed"),         EInsimulEventType::UtteranceQuestCompleted },
        { TEXT("ambient_conversation_started"),      EInsimulEventType::AmbientConversationStarted },
        { TEXT("ambient_conversation_ended"),        EInsimulEventType::AmbientConversationEnded },
        { TEXT("vocabulary_overheard"),              EInsimulEventType::VocabularyOverheard },
        { TEXT("state_created_truth"),               EInsimulEventType::StateCreatedTruth },
        { TEXT("state_expired_truth"),               EInsimulEventType::StateExpiredTruth },
        { TEXT("romance_action"),                    EInsimulEventType::RomanceAction },
        { TEXT("romance_stage_changed"),             EInsimulEventType::RomanceStageChanged },
        { TEXT("npc_volition_action"),               EInsimulEventType::NpcVolitionAction },
        { TEXT("puzzle_failed"),                     EInsimulEventType::PuzzleFailed },
        { TEXT("quest_failed"),                      EInsimulEventType::QuestFailed },
        { TEXT("quest_abandoned"),                   EInsimulEventType::QuestAbandoned },
        { TEXT("quest_declined"),                    EInsimulEventType::QuestDeclined },
        { TEXT("conversation_overheard"),            EInsimulEventType::ConversationOverheard },
        { TEXT("create_truth"),                      EInsimulEventType::CreateTruth },
        { TEXT("assessment_started"),                EInsimulEventType::AssessmentStarted },
        { TEXT("assessment_phase_started"),          EInsimulEventType::AssessmentPhaseStarted },
        { TEXT("assessment_phase_completed"),        EInsimulEventType::AssessmentPhaseCompleted },
        { TEXT("assessment_tier_change"),            EInsimulEventType::AssessmentTierChange },
        { TEXT("assessment_completed"),              EInsimulEventType::AssessmentCompleted },
        { TEXT("onboarding_step_started"),           EInsimulEventType::OnboardingStepStarted },
        { TEXT("onboarding_step_completed"),         EInsimulEventType::OnboardingStepCompleted },
        { TEXT("onboarding_completed"),              EInsimulEventType::OnboardingCompleted },
        { TEXT("periodic_assessment_triggered"),     EInsimulEventType::PeriodicAssessmentTriggered },
        { TEXT("assessment_conversation_quest_start"), EInsimulEventType::AssessmentConversationQuestStart },
        { TEXT("assessment_conversation_completed"), EInsimulEventType::AssessmentConversationCompleted },
        { TEXT("visual_vocab_prompted"),             EInsimulEventType::VisualVocabPrompted },
        { TEXT("visual_vocab_answered"),             EInsimulEventType::VisualVocabAnswered },
        { TEXT("direction_step_completed"),          EInsimulEventType::DirectionStepCompleted },
        { TEXT("pronunciation_assessment_data"),     EInsimulEventType::PronunciationAssessmentData },
        { TEXT("object_named"),                      EInsimulEventType::ObjectNamed },
        { TEXT("object_examined"),                    EInsimulEventType::ObjectExamined },
        { TEXT("npc_exam_started"),                   EInsimulEventType::NpcExamStarted },
        { TEXT("npc_exam_listening_ready"),           EInsimulEventType::NpcExamListeningReady },
        { TEXT("npc_exam_question_answered"),          EInsimulEventType::NpcExamQuestionAnswered },
        { TEXT("achievement_unlocked"),              EInsimulEventType::AchievementUnlocked },
        { TEXT("quest_reminder"),                    EInsimulEventType::QuestReminder },
        { TEXT("quest_expired"),                     EInsimulEventType::QuestExpired },
        { TEXT("quest_milestone"),                   EInsimulEventType::QuestMilestone },
        { TEXT("daily_quests_reset"),                EInsimulEventType::DailyQuestsReset },
        { TEXT("npc_exam_requested"),                EInsimulEventType::NpcExamRequested },
        { TEXT("npc_exam_completed"),                EInsimulEventType::NpcExamCompleted },
        { TEXT("npc_conversation_turn"),             EInsimulEventType::NpcConversationTurn },
        { TEXT("skill_rewards_applied"),             EInsimulEventType::SkillRewardsApplied },
        { TEXT("assessment_conversation_initiated"), EInsimulEventType::AssessmentConversationInitiated },
        { TEXT("assessment_guided_conversation_start"), EInsimulEventType::AssessmentGuidedConversationStart },
        { TEXT("knowledge_applied"),                 EInsimulEventType::KnowledgeApplied },
        { TEXT("identification_prompted"),           EInsimulEventType::IdentificationPrompted },
        { TEXT("identification_correct"),            EInsimulEventType::IdentificationCorrect },
        { TEXT("identification_incorrect"),          EInsimulEventType::IdentificationIncorrect },
        { TEXT("playthrough_completed"),             EInsimulEventType::PlaythroughCompleted },
        { TEXT("playthrough_completion_requested"),  EInsimulEventType::PlaythroughCompletionRequested },
        { TEXT("departure_assessment_triggered"),    EInsimulEventType::DepartureAssessmentTriggered },
        // Object identification events
        { TEXT("object_identified"),                EInsimulEventType::ObjectIdentified },
        // Sign reading events
        { TEXT("sign_read"),                        EInsimulEventType::SignRead },
        // Time events
        { TEXT("hour_changed"),                     EInsimulEventType::HourChanged },
        { TEXT("day_changed"),                      EInsimulEventType::DayChanged },
        { TEXT("time_of_day_changed"),              EInsimulEventType::TimeOfDayChanged },
        // NPC relationship events
        { TEXT("npc_relationship_changed"),            EInsimulEventType::NpcRelationshipChanged },
        // Container events
        { TEXT("container_opened"),                  EInsimulEventType::ContainerOpened },
        // Escort quest events
        { TEXT("escort_started"),                    EInsimulEventType::EscortStarted },
        { TEXT("escort_completed"),                  EInsimulEventType::EscortCompleted },
        // Mercantile events
        { TEXT("item_purchased"),                    EInsimulEventType::ItemPurchased },
        { TEXT("food_ordered"),                      EInsimulEventType::FoodOrdered },
        { TEXT("price_haggled"),                     EInsimulEventType::PriceHaggled },
        // Text collection events
        { TEXT("text_collected"),                    EInsimulEventType::TextCollected },
        // XP and level-up events
        { TEXT("xp_gained"),                        EInsimulEventType::XpGained },
        { TEXT("level_up"),                         EInsimulEventType::LevelUp },
        // Vocabulary hover-lookup events
        { TEXT("vocabulary_lookup"),                 EInsimulEventType::VocabularyLookup },
        // Vehicle events
        { TEXT("vehicle_mounted"),                   EInsimulEventType::VehicleMounted },
        { TEXT("vehicle_dismounted"),                EInsimulEventType::VehicleDismounted },
        // Photography events
        { TEXT("photo_taken"),                       EInsimulEventType::PhotoTaken },
        // Furniture interaction events
        { TEXT("furniture_sat"),                     EInsimulEventType::FurnitureSat },
        { TEXT("furniture_stood"),                   EInsimulEventType::FurnitureStood },
        { TEXT("furniture_slept"),                   EInsimulEventType::FurnitureSlept },
        { TEXT("furniture_read_lore"),               EInsimulEventType::FurnitureReadLore },
        { TEXT("furniture_worked"),                  EInsimulEventType::FurnitureWorked },
        // Clue discovery events
        { TEXT("clue_discovered"),                  EInsimulEventType::ClueDiscovered },
        // Conversational action events
        { TEXT("conversational_action"),            EInsimulEventType::ConversationalAction },
        { TEXT("conversation_turn_counted"),        EInsimulEventType::ConversationTurnCounted },
        // Physical action events
        { TEXT("physical_action_completed"),        EInsimulEventType::PhysicalActionCompleted },
        // Reading completion events
        { TEXT("reading_completed"),                 EInsimulEventType::ReadingCompleted },
        { TEXT("questions_answered"),                EInsimulEventType::QuestionsAnswered },
        // Assessment objective triggers
        { TEXT("writing_submitted"),                 EInsimulEventType::WritingSubmitted },
        { TEXT("listening_completed"),               EInsimulEventType::ListeningCompleted },
        // Exploration discovery events
        { TEXT("investigation_completed"),          EInsimulEventType::InvestigationCompleted },
        // NPC activity observation events
        { TEXT("activity_observed"),                EInsimulEventType::ActivityObserved },
        // UI panel events (tutorial completion triggers)
        { TEXT("inventory_opened"),                 EInsimulEventType::InventoryOpened },
        { TEXT("quest_log_opened"),                 EInsimulEventType::QuestLogOpened },
        // CEFR level advancement
        { TEXT("cefr_level_advanced"),              EInsimulEventType::CefrLevelAdvanced },
        // Conversational action completion events
        { TEXT("conversational_action_completed"), EInsimulEventType::ConversationalActionCompleted },
        // Language learning discovery events
        { TEXT("text_found"),                      EInsimulEventType::TextFound },
        { TEXT("text_read"),                       EInsimulEventType::TextRead },
        // Object point-and-name events
        { TEXT("object_pointed_and_named"),         EInsimulEventType::ObjectPointedAndNamed },
        // Translation / pronunciation attempt events
        { TEXT("translation_attempt"),              EInsimulEventType::TranslationAttempt },
        { TEXT("pronunciation_attempt"),            EInsimulEventType::PronunciationAttempt },
        // Volition schedule events
        { TEXT("volition_schedule_override"),        EInsimulEventType::VolitionScheduleOverride },
        { TEXT("volition_return_to_schedule"),       EInsimulEventType::VolitionReturnToSchedule },
        // NPC greeting events
        { TEXT("npc_greeting"),                     EInsimulEventType::NpcGreeting },
        // Item sold events
        { TEXT("item_sold"),                        EInsimulEventType::ItemSold },
        // Conversation assessment completed
        { TEXT("conversation_assessment_completed"), EInsimulEventType::ConversationAssessmentCompleted },
        // Unified action execution event
        { TEXT("action_executed"),                   EInsimulEventType::ActionExecuted },
        // NPC speech act events
        { TEXT("npc_speech_act"),                    EInsimulEventType::NpcSpeechAct },
        // Grammar weakness events
        { TEXT("grammar_weakness_detected"),         EInsimulEventType::GrammarWeaknessDetected },
        // Player proximity events
        { TEXT("player_near_npc"),                   EInsimulEventType::PlayerNearNpc },
    };
    return Map;
}

static const TMap<EInsimulEventType, FString>& GetEventTypeToStringMap()
{
    static TMap<EInsimulEventType, FString> Map;
    if (Map.Num() == 0)
    {
        // Build reverse map from the canonical string→enum map.
        for (const auto& Pair : GetStringToEventTypeMap())
        {
            Map.Add(Pair.Value, Pair.Key);
        }
    }
    return Map;
}

EInsimulEventType EventTypeFromString(const FString& TypeString)
{
    const auto* Found = GetStringToEventTypeMap().Find(TypeString);
    if (Found)
    {
        return *Found;
    }
    UE_LOG(LogTemp, Warning, TEXT("[Insimul] EventTypeFromString: unknown event type '%s', defaulting to ItemCollected"), *TypeString);
    return EInsimulEventType::ItemCollected;
}

FString EventTypeToString(EInsimulEventType EventType)
{
    const auto* Found = GetEventTypeToStringMap().Find(EventType);
    if (Found)
    {
        return *Found;
    }
    return TEXT("unknown");
}

// ── UEventBus Implementation ────────────────────────────────────────────────

void UEventBus::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    NextHandle = 1;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] EventBus initialized"));
}

void UEventBus::Deinitialize()
{
    Dispose();
    Super::Deinitialize();
}

void UEventBus::Emit(const FInsimulGameEvent& Event)
{
    // Fire type-specific handlers
    for (const FTypedHandler& Handler : TypedHandlers)
    {
        if (Handler.EventType == Event.EventType)
        {
            // Wrap in try-equivalent: Unreal delegates don't throw, but
            // we guard against removed/invalid delegates gracefully.
            if (Handler.Delegate.IsBound())
            {
                Handler.Delegate.Broadcast(Event);
            }
        }
    }

    // Fire global handlers
    if (OnAnyEvent.IsBound())
    {
        OnAnyEvent.Broadcast(Event);
    }

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] EventBus::Emit type=%d"), (int32)Event.EventType);
}

int32 UEventBus::Subscribe(EInsimulEventType EventType, const FOnGameEvent& Handler)
{
    FTypedHandler Entry;
    Entry.Handle = NextHandle++;
    Entry.EventType = EventType;
    Entry.Delegate = Handler;
    TypedHandlers.Add(Entry);

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] EventBus::Subscribe type=%d handle=%d"), (int32)EventType, Entry.Handle);
    return Entry.Handle;
}

void UEventBus::Unsubscribe(int32 Handle)
{
    TypedHandlers.RemoveAll([Handle](const FTypedHandler& H) {
        return H.Handle == Handle;
    });

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] EventBus::Unsubscribe handle=%d"), Handle);
}

void UEventBus::Dispose()
{
    TypedHandlers.Empty();
    OnAnyEvent.Clear();
    NextHandle = 1;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] EventBus disposed"));
}
