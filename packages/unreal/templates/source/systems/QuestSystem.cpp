#include "QuestSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// ── Initialization ──────────────────────────────────────────────────────────

void UQuestSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    BuildActionMappingCatalog();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] QuestSystem initialized"));
}

void UQuestSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UQuestSystem::BuildActionMappingCatalog()
{
    ActionMappings.Empty();

    // collect_item ← item_collected
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("collect_item");
        M.EventType = TEXT("item_collected");
        M.MatchFields.Add({ TEXT("itemName"), TEXT("ItemName"), EFieldComparison::ContainsLower, true });
        M.bHasQuantity = true;
        M.Quantity = { TEXT("CollectedCount"), TEXT("ItemCount"), 1 };
        M.Description = TEXT("Player collects an item into inventory");
        ActionMappings.Add(M);
    }
    // visit_location ← location_visited
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("visit_location");
        M.EventType = TEXT("location_visited");
        M.MatchFields.Add({ TEXT("locationName"), TEXT("LocationName"), EFieldComparison::ContainsLower, true });
        M.Description = TEXT("Player visits a named location");
        ActionMappings.Add(M);
    }
    // discover_location ← location_discovered
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("discover_location");
        M.EventType = TEXT("location_discovered");
        M.MatchFields.Add({ TEXT("locationName"), TEXT("LocationName"), EFieldComparison::ContainsLower, true });
        M.Description = TEXT("Player discovers a new location");
        ActionMappings.Add(M);
    }
    // talk_to_npc ← npc_talked
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("talk_to_npc");
        M.EventType = TEXT("npc_talked");
        M.MatchFields.Add({ TEXT("npcId"), TEXT("NpcId"), EFieldComparison::Exact, true });
        M.Description = TEXT("Player talks to an NPC");
        ActionMappings.Add(M);
    }
    // complete_reading ← reading_completed
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("complete_reading");
        M.EventType = TEXT("reading_completed");
        M.MatchFields.Add({ TEXT("textId"), TEXT("TextId"), EFieldComparison::Exact, true });
        M.Description = TEXT("Player completes reading a text");
        ActionMappings.Add(M);
    }
    // photograph_subject ← photo_taken
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("photograph_subject");
        M.EventType = TEXT("photo_taken");
        M.MatchFields.Add({ TEXT("subjectName"), TEXT("TargetSubject"), EFieldComparison::ContainsLower, true });
        M.MatchFields.Add({ TEXT("subjectCategory"), TEXT("TargetCategory"), EFieldComparison::Exact, true });
        M.bHasQuantity = true;
        M.Quantity = { TEXT("CurrentCount"), TEXT("RequiredCount"), 1 };
        M.Description = TEXT("Player photographs a subject");
        ActionMappings.Add(M);
    }
    // photograph_activity ← photo_taken
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("photograph_activity");
        M.EventType = TEXT("photo_taken");
        M.MatchFields.Add({ TEXT("subjectName"), TEXT("TargetSubject"), EFieldComparison::ContainsLower, true });
        M.MatchFields.Add({ TEXT("subjectCategory"), TEXT("TargetCategory"), EFieldComparison::Exact, true });
        M.bHasQuantity = true;
        M.Quantity = { TEXT("CurrentCount"), TEXT("RequiredCount"), 1 };
        M.Description = TEXT("Player photographs an activity");
        ActionMappings.Add(M);
    }
    // physical_action ← physical_action_completed
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("physical_action");
        M.EventType = TEXT("physical_action_completed");
        M.MatchFields.Add({ TEXT("actionType"), TEXT("ActionType"), EFieldComparison::Exact, true });
        M.bHasQuantity = true;
        M.Quantity = { TEXT("ActionsCompleted"), TEXT("ActionsRequired"), 1 };
        M.Description = TEXT("Player performs a physical action at a hotspot");
        ActionMappings.Add(M);
    }
    // craft_item ← item_crafted
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("craft_item");
        M.EventType = TEXT("item_crafted");
        M.MatchFields.Add({ TEXT("itemName"), TEXT("ItemName"), EFieldComparison::ContainsLower, true });
        M.bHasQuantity = true;
        M.Quantity = { TEXT("CraftedCount"), TEXT("RequiredCount"), 1 };
        M.Description = TEXT("Player crafts an item");
        ActionMappings.Add(M);
    }
    // buy_item ← item_purchased
    {
        FQuestActionMapping M;
        M.ObjectiveType = TEXT("buy_item");
        M.EventType = TEXT("item_purchased");
        M.MatchFields.Add({ TEXT("itemName"), TEXT("ItemName"), EFieldComparison::ContainsLower, true });
        M.bHasQuantity = true;
        M.Quantity = { TEXT("CurrentCount"), TEXT("RequiredCount"), 1 };
        M.Description = TEXT("Player purchases an item from a merchant");
        ActionMappings.Add(M);
    }
}

void UQuestSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* SystemsObj;
    if (Root->TryGetObjectField(TEXT("systems"), SystemsObj))
    {
        const TArray<TSharedPtr<FJsonValue>>* QuestsArr;
        if ((*SystemsObj)->TryGetArrayField(TEXT("quests"), QuestsArr))
        {
            QuestCount = QuestsArr->Num();
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d quests"), QuestCount);
        }
    }
}

// ── Internal helpers ────────────────────────────────────────────────────────

bool UQuestSystem::IsObjectiveLockedInternal(const FQuestObjective& Objective) const
{
    // Check explicit dependsOn
    if (Objective.DependsOn.Num() > 0)
    {
        for (const FString& DepId : Objective.DependsOn)
        {
            const FQuestObjective* Dep = Objectives.FindByPredicate(
                [&](const FQuestObjective& O) { return O.Id == DepId; });
            if (Dep && !Dep->bCompleted) return true;
        }
    }

    // Check order-based sequencing
    if (Objective.Order >= 0)
    {
        for (const auto& Other : Objectives)
        {
            if (Other.Id == Objective.Id) continue;
            if (Other.QuestId != Objective.QuestId) continue;
            if (Other.Order >= 0 && Other.Order < Objective.Order && !Other.bCompleted)
            {
                return true;
            }
        }
    }

    return false;
}

void UQuestSystem::ForEachObjective(const FString& QuestId, const TArray<FString>& Types, TFunction<void(FQuestObjective&)> Callback)
{
    // Snapshot eligible objectives before iteration
    TArray<FQuestObjective*> Eligible;
    for (auto& Obj : Objectives)
    {
        if (Obj.bCompleted) continue;
        if (!QuestId.IsEmpty() && Obj.QuestId != QuestId) continue;
        if (!Types.Contains(Obj.Type)) continue;
        if (IsObjectiveLockedInternal(Obj)) continue;
        Eligible.Add(&Obj);
    }

    for (auto* Obj : Eligible)
    {
        if (Obj->bCompleted) continue; // re-check
        Callback(*Obj);
    }
}

FString UQuestSystem::GetObjectiveFieldValue(const FQuestObjective& Obj, const FString& FieldName)
{
    if (FieldName == TEXT("ItemName")) return Obj.ItemName;
    if (FieldName == TEXT("NpcId")) return Obj.NpcId;
    if (FieldName == TEXT("NpcName")) return Obj.NpcName;
    if (FieldName == TEXT("LocationName")) return Obj.LocationName;
    if (FieldName == TEXT("TextId")) return Obj.TextId;
    if (FieldName == TEXT("FactionId")) return Obj.FactionId;
    if (FieldName == TEXT("EnemyType")) return Obj.EnemyType;
    if (FieldName == TEXT("TargetSubject")) return Obj.TargetSubject;
    if (FieldName == TEXT("TargetCategory")) return Obj.TargetCategory;
    if (FieldName == TEXT("TargetActivity")) return Obj.TargetActivity;
    if (FieldName == TEXT("ActionType")) return Obj.ActionType;
    if (FieldName == TEXT("MerchantId")) return Obj.MerchantId;
    if (FieldName == TEXT("CraftedItemId")) return Obj.CraftedItemId;
    return TEXT("");
}

bool UQuestSystem::MatchesField(const FFieldMatchRule& Rule, const FString& EventValue, const FString& ObjectiveValue)
{
    if ((ObjectiveValue.IsEmpty()) && Rule.bOptional) return true;
    if (EventValue.IsEmpty() || ObjectiveValue.IsEmpty()) return false;

    switch (Rule.Comparison)
    {
        case EFieldComparison::Exact:
            return EventValue == ObjectiveValue;
        case EFieldComparison::Contains:
            return EventValue.Contains(ObjectiveValue) || ObjectiveValue.Contains(EventValue);
        case EFieldComparison::ContainsLower:
            return EventValue.ToLower().Contains(ObjectiveValue.ToLower()) || ObjectiveValue.ToLower().Contains(EventValue.ToLower());
        default:
            return EventValue == ObjectiveValue;
    }
}

bool UQuestSystem::MatchesAllFields(const FQuestActionMapping& Mapping, const TMap<FString, FString>& EventData, const FQuestObjective& Objective)
{
    for (const auto& Rule : Mapping.MatchFields)
    {
        const FString* EventVal = EventData.Find(Rule.EventField);
        FString EV = EventVal ? *EventVal : TEXT("");
        FString OV = GetObjectiveFieldValue(Objective, Rule.ObjectiveField);
        if (!MatchesField(Rule, EV, OV)) return false;
    }
    return true;
}

// ── Quest management ────────────────────────────────────────────────────────

bool UQuestSystem::AcceptQuest(const FString& QuestId)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AcceptQuest: %s"), *QuestId);
    return true;
}

bool UQuestSystem::CompleteObjective(const FString& QuestId, const FString& ObjectiveId)
{
    for (auto& Obj : Objectives)
    {
        if (Obj.QuestId == QuestId && Obj.Id == ObjectiveId && !Obj.bCompleted)
        {
            if (IsObjectiveLockedInternal(Obj)) return false;

            Obj.bCompleted = true;
            OnObjectiveCompleted.Broadcast(QuestId, ObjectiveId);
            UE_LOG(LogTemp, Log, TEXT("[Insimul] CompleteObjective: %s / %s"), *QuestId, *ObjectiveId);

            // Check if all objectives for this quest are now complete
            if (IsQuestComplete(QuestId))
            {
                OnQuestCompletedEvent.Broadcast(QuestId);
            }
            return true;
        }
    }
    return false;
}

bool UQuestSystem::IsObjectiveLocked(const FString& QuestId, const FString& ObjectiveId) const
{
    for (const auto& Obj : Objectives)
    {
        if (Obj.QuestId == QuestId && Obj.Id == ObjectiveId)
        {
            return IsObjectiveLockedInternal(Obj);
        }
    }
    return false;
}

TArray<FQuestObjective> UQuestSystem::GetAvailableObjectives(const FString& QuestId) const
{
    TArray<FQuestObjective> Result;
    for (const auto& Obj : Objectives)
    {
        if (Obj.QuestId != QuestId) continue;
        if (!Obj.bCompleted && !IsObjectiveLockedInternal(Obj))
        {
            Result.Add(Obj);
        }
    }
    return Result;
}

TArray<FQuestObjective> UQuestSystem::GetLockedObjectives(const FString& QuestId) const
{
    TArray<FQuestObjective> Result;
    for (const auto& Obj : Objectives)
    {
        if (Obj.QuestId != QuestId) continue;
        if (!Obj.bCompleted && IsObjectiveLockedInternal(Obj))
        {
            Result.Add(Obj);
        }
    }
    return Result;
}

bool UQuestSystem::IsObjectiveComplete(const FString& QuestId, const FString& ObjectiveId) const
{
    for (const auto& Obj : Objectives)
    {
        if (Obj.QuestId == QuestId && Obj.Id == ObjectiveId)
        {
            return Obj.bCompleted;
        }
    }
    return false;
}

bool UQuestSystem::IsQuestComplete(const FString& QuestId) const
{
    bool HasObjectives = false;
    for (const auto& Obj : Objectives)
    {
        if (Obj.QuestId != QuestId) continue;
        HasObjectives = true;
        if (!Obj.bCompleted) return false;
    }
    return HasObjectives;
}

// ── Timed objectives ────────────────────────────────────────────────────────

TArray<FString> UQuestSystem::CheckTimedObjectives()
{
    TArray<FString> Expired;

    for (auto& Obj : Objectives)
    {
        if (Obj.bCompleted) continue;
        if (Obj.TimeLimitSeconds <= 0.f || Obj.StartedAt < 0.f) continue;

        float Elapsed = GameTime - Obj.StartedAt;
        if (Elapsed > Obj.TimeLimitSeconds)
        {
            Obj.bCompleted = true;
            Expired.Add(FString::Printf(TEXT("Time expired: %s"), *Obj.Description));
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Timed objective expired: %s"), *Obj.Id);
        }
    }
    return Expired;
}

float UQuestSystem::GetObjectiveTimeRemaining(const FString& ObjectiveId) const
{
    for (const auto& Obj : Objectives)
    {
        if (Obj.Id == ObjectiveId && Obj.TimeLimitSeconds > 0.f && Obj.StartedAt >= 0.f)
        {
            float Elapsed = GameTime - Obj.StartedAt;
            return FMath::Max(0.f, Obj.TimeLimitSeconds - Elapsed);
        }
    }
    return -1.f;
}

FString UQuestSystem::RequestNavigationHint(const FString& QuestId)
{
    for (auto& Obj : Objectives)
    {
        if (Obj.bCompleted) continue;
        if (!QuestId.IsEmpty() && Obj.QuestId != QuestId) continue;
        if (Obj.Type != TEXT("navigate_language") && Obj.Type != TEXT("follow_directions")) continue;

        Obj.HintsRequested++;
        Obj.bShowWaypoint = true;
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Navigation hint requested for %s (hint #%d)"), *Obj.Id, Obj.HintsRequested);
        return Obj.Description;
    }
    return FString();
}

FString UQuestSystem::GetNextScavengerCategory(int32 LastCategoryIndex)
{
    int32 Next = (LastCategoryIndex + 1) % SCAVENGER_CATEGORIES.Num();
    return SCAVENGER_CATEGORIES[Next];
}

// ── NPC / conversation tracking ─────────────────────────────────────────────

void UQuestSystem::TrackNPCConversation(const FString& NpcId, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("talk_to_npc") }, [&](FQuestObjective& Obj) {
        if (Obj.NpcId == NpcId)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackVocabularyUsage(const FString& Word, const FString& QuestId)
{
    FString LowerWord = Word.ToLower();

    ForEachObjective(QuestId, { TEXT("use_vocabulary"), TEXT("collect_vocabulary") }, [&](FQuestObjective& Obj) {
        if (Obj.TargetWords.Num() > 0 && !Obj.TargetWords.Contains(LowerWord)) return;
        if (Obj.WordsUsed.Contains(LowerWord)) return;

        Obj.WordsUsed.Add(LowerWord);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 10))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackConversationTurn(const TArray<FString>& Keywords, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("complete_conversation") }, [&](FQuestObjective& Obj) {
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 5))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackConversationInitiation(const FString& NpcId, bool bAccepted, float ResponseQuality, const FString& QuestId)
{
    if (!bAccepted) return;

    ForEachObjective(QuestId, { TEXT("conversation_initiation") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;

        Obj.CurrentCount++;
        Obj.ResponseQuality = ResponseQuality;

        float MinQuality = Obj.MinResponseQuality;
        bool bMeetsQuality = ResponseQuality >= MinQuality;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1) && bMeetsQuality)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackNpcConversationTurn(const FString& NpcId, const FString& TopicTag, const FString& QuestId)
{
    static const TMap<FString, TArray<FString>> TagToTypes = {
        { TEXT("directions"),    { TEXT("ask_for_directions") } },
        { TEXT("order"),         { TEXT("order_food") } },
        { TEXT("haggle"),        { TEXT("haggle_price") } },
        { TEXT("introduction"),  { TEXT("introduce_self") } },
        { TEXT("friendship"),    { TEXT("build_friendship") } },
    };

    TArray<FString> TargetTypes;
    if (!TopicTag.IsEmpty() && TagToTypes.Contains(TopicTag))
    {
        TargetTypes = TagToTypes[TopicTag];
    }
    else
    {
        TargetTypes = { TEXT("ask_for_directions"), TEXT("order_food"), TEXT("haggle_price"), TEXT("introduce_self"), TEXT("build_friendship") };
    }

    ForEachObjective(QuestId, TargetTypes, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;

        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackConversationTurnCounted(const FString& NpcId, int32 TotalTurns, int32 MeaningfulTurns, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("arrival_conversation") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;
        Obj.CurrentCount = MeaningfulTurns;
        if (MeaningfulTurns >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 3))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackConversationalAction(const FString& Action, const FString& NpcId, const FString& Topic, const FString& QuestId)
{
    static const TMap<FString, TArray<FString>> ActionToObjectiveTypes = {
        { TEXT("asked_about_topic"),     { TEXT("asked_about_topic") } },
        { TEXT("used_target_language"),  { TEXT("used_target_language"), TEXT("arrival_writing") } },
        { TEXT("answered_question"),     { TEXT("answered_question") } },
        { TEXT("requested_information"), { TEXT("requested_information"), TEXT("ask_for_directions") } },
        { TEXT("made_introduction"),     { TEXT("made_introduction"), TEXT("introduce_self") } },
    };

    TArray<FString> TargetTypes;
    if (ActionToObjectiveTypes.Contains(Action))
    {
        TargetTypes = ActionToObjectiveTypes[Action];
    }
    else
    {
        TargetTypes = { Action };
    }

    ForEachObjective(QuestId, TargetTypes, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;

        // For topic-based objectives, check topic match
        if (Obj.Type == TEXT("asked_about_topic") && Obj.TargetWords.Num() > 0)
        {
            if (!Topic.IsEmpty() && !Obj.TargetWords.Contains(Topic)) return;
        }

        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });

    // Also fire arrival_initiate_conversation for any conversational action
    ForEachObjective(QuestId, { TEXT("arrival_initiate_conversation") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;
        CompleteObjective(Obj.QuestId, Obj.Id);
    });
}

// ── Pronunciation ───────────────────────────────────────────────────────────

void UQuestSystem::TrackPronunciationAttempt(bool bPassed, float Score, const FString& Phrase, const FString& QuestId)
{
    TArray<FString> PronunciationTypes = { TEXT("pronunciation_check"), TEXT("listen_and_repeat"), TEXT("speak_phrase") };

    ForEachObjective(QuestId, PronunciationTypes, [&](FQuestObjective& Obj) {
        if (Score > 0.f)
        {
            Obj.PronunciationScores.Add(Score);
            if (Score > Obj.PronunciationBestScore)
            {
                Obj.PronunciationBestScore = Score;
            }
        }

        if (bPassed)
        {
            Obj.CurrentCount++;

            int32 Required = Obj.RequiredCount > 0 ? Obj.RequiredCount : 3;
            if (Obj.CurrentCount >= Required)
            {
                // If minAverageScore is set, check average before completing
                if (Obj.MinAverageScore > 0.f && Obj.PronunciationScores.Num() > 0)
                {
                    float Sum = 0.f;
                    for (float S : Obj.PronunciationScores) Sum += S;
                    float Avg = Sum / Obj.PronunciationScores.Num();
                    if (Avg >= Obj.MinAverageScore)
                    {
                        CompleteObjective(Obj.QuestId, Obj.Id);
                    }
                }
                else
                {
                    CompleteObjective(Obj.QuestId, Obj.Id);
                }
            }
        }
    });
}

FPronunciationStats UQuestSystem::GetPronunciationStats(const FString& QuestId, const FString& ObjectiveId) const
{
    FPronunciationStats Stats;
    for (const auto& Obj : Objectives)
    {
        if (Obj.QuestId == QuestId && Obj.Id == ObjectiveId &&
            Obj.Type == TEXT("pronunciation_check"))
        {
            Stats.Scores = Obj.PronunciationScores;
            Stats.Passed = Obj.PronunciationScores.Num();
            if (Stats.Passed > 0)
            {
                float Sum = 0.f;
                for (float S : Stats.Scores) Sum += S;
                Stats.Average = Sum / Stats.Passed;
            }
            Stats.bValid = true;
            return Stats;
        }
    }
    return Stats;
}

FString UQuestSystem::RevealPronunciationHint(const FString& QuestId, const FString& ObjectiveId)
{
    for (FQuestObjective& Obj : Objectives)
    {
        if (Obj.QuestId != QuestId || Obj.Id != ObjectiveId) continue;
        if (Obj.HintsRevealed >= Obj.HintTexts.Num()) return FString();
        const FString Hint = Obj.HintTexts[Obj.HintsRevealed];
        Obj.HintsRevealed++;
        return Hint;
    }
    return FString();
}

// ── Romance ─────────────────────────────────────────────────────────────────

void UQuestSystem::TrackRomanceStageReach(const FString& CurrentStage, const FString& QuestId)
{
    static const TArray<FString> StageOrder = {
        TEXT("none"), TEXT("attracted"), TEXT("flirting"), TEXT("dating"),
        TEXT("committed"), TEXT("engaged"), TEXT("married")
    };
    const int32 CurrentIdx = StageOrder.IndexOfByKey(CurrentStage.ToLower());
    if (CurrentIdx < 0) return;

    ForEachObjective(QuestId, { TEXT("romance_stage_reach") }, [&](FQuestObjective& Obj) {
        FString Target = Obj.TargetRomanceStage.IsEmpty() ? Obj.TargetPhrase : Obj.TargetRomanceStage;
        Target = Target.ToLower();
        const int32 TargetIdx = StageOrder.IndexOfByKey(Target);
        if (TargetIdx < 0) return;
        if (CurrentIdx >= TargetIdx)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackRomanceGift(const FString& NpcId, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("romance_gift") }, [&](FQuestObjective& Obj) {
        if (!Obj.RomanceGiftRecipientNpcId.IsEmpty() && Obj.RomanceGiftRecipientNpcId != NpcId) return;
        Obj.CurrentCount++;
        const int32 Required = Obj.RequiredCount > 0 ? Obj.RequiredCount : 1;
        if (Obj.CurrentCount >= Required)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Writing ─────────────────────────────────────────────────────────────────

void UQuestSystem::TrackWritingSubmission(const FString& Text, int32 WordCount, const FString& QuestId)
{
    // Complete arrival_writing objectives with word count validation
    ForEachObjective(QuestId, { TEXT("arrival_writing") }, [&](FQuestObjective& Obj) {
        int32 MinWords = Obj.MinWordCount > 0 ? Obj.MinWordCount : 20;
        if (WordCount >= MinWords)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });

    ForEachObjective(QuestId, { TEXT("write_response"), TEXT("describe_scene") }, [&](FQuestObjective& Obj) {
        Obj.WrittenResponses.Add(Text);
        Obj.CurrentCount++;

        int32 MinWords = Obj.MinWordCount;
        if (MinWords > 0 && WordCount < MinWords) return;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Item tracking ───────────────────────────────────────────────────────────

TArray<FCollectedItemMatch> UQuestSystem::TrackCollectedItemByName(const FString& ItemName, const FString& Category, const FString& QuestId)
{
    TArray<FCollectedItemMatch> Matches;
    FString LowerItem = ItemName.ToLower();
    FString LowerCat = Category.ToLower();

    ForEachObjective(QuestId, { TEXT("collect_item") }, [&](FQuestObjective& Obj) {
        FString ObjItemLower = Obj.ItemName.ToLower();
        bool bNameMatch = false;

        // Exact match
        if (!ObjItemLower.IsEmpty() && ObjItemLower == LowerItem)
        {
            bNameMatch = true;
        }
        // Partial match: item name contains objective name or vice versa
        else if (!ObjItemLower.IsEmpty() && (LowerItem.Contains(ObjItemLower) || ObjItemLower.Contains(LowerItem)))
        {
            bNameMatch = true;
        }
        // Category match
        else if (!LowerCat.IsEmpty() && !Obj.VocabularyCategory.IsEmpty() && Obj.VocabularyCategory.ToLower() == LowerCat)
        {
            bNameMatch = true;
        }
        // Word-overlap matching: split both into words, check if any >=3-char word overlaps
        else if (!ObjItemLower.IsEmpty())
        {
            TArray<FString> ObjWords, ItemWords;
            ObjItemLower.ParseIntoArray(ObjWords, TEXT(" "));
            LowerItem.ParseIntoArray(ItemWords, TEXT(" "));
            for (const FString& W : ObjWords)
            {
                if (W.Len() >= 3 && ItemWords.Contains(W)) { bNameMatch = true; break; }
            }
            if (!bNameMatch)
            {
                for (const FString& W : ItemWords)
                {
                    if (W.Len() >= 3 && ObjWords.Contains(W)) { bNameMatch = true; break; }
                }
            }
        }
        // No item name on objective means any item counts
        else if (ObjItemLower.IsEmpty() && Obj.VocabularyCategory.IsEmpty())
        {
            bNameMatch = true;
        }

        if (!bNameMatch) return;

        int32 Required = Obj.ItemCount > 0 ? Obj.ItemCount : 1;
        Obj.CollectedCount++;

        FCollectedItemMatch Match;
        Match.QuestId = Obj.QuestId;
        Match.ObjectiveId = Obj.Id;
        Match.MatchedName = ItemName;
        Match.CollectedCount = Obj.CollectedCount;
        Match.RequiredCount = Required;

        if (Obj.CollectedCount >= Required)
        {
            if (CompleteObjective(Obj.QuestId, Obj.Id))
            {
                Match.bCompleted = true;
            }
        }

        Matches.Add(Match);
        OnQuestItemCollected.Broadcast(Obj.QuestId, Obj.Id, ItemName);
    });
    return Matches;
}

void UQuestSystem::TrackItemDelivery(const FString& NpcId, const TArray<FString>& PlayerItemNames, const FString& QuestId)
{
    TArray<FString> NormalizedItems;
    for (const auto& Name : PlayerItemNames)
    {
        NormalizedItems.Add(Name.ToLower());
    }

    ForEachObjective(QuestId, { TEXT("deliver_item") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;

        FString ObjItemLower = Obj.ItemName.ToLower();
        if (!ObjItemLower.IsEmpty() && NormalizedItems.Contains(ObjItemLower))
        {
            Obj.bDelivered = true;
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::CheckInventoryObjectives(const TArray<FString>& PlayerItemNames, const FString& QuestId)
{
    TArray<FString> NormalizedItems;
    for (const auto& Name : PlayerItemNames)
    {
        NormalizedItems.Add(Name.ToLower());
    }

    ForEachObjective(QuestId, { TEXT("collect_item"), TEXT("collect_items") }, [&](FQuestObjective& Obj) {
        FString ObjName = Obj.ItemName.ToLower();
        if (ObjName.IsEmpty()) return;

        bool bMatched = false;
        for (const FString& N : NormalizedItems)
        {
            if (N == ObjName || N.Contains(ObjName) || ObjName.Contains(N))
            {
                bMatched = true;
                break;
            }
        }
        if (bMatched)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackGiftGiven(const FString& NpcId, const FString& ItemName, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("give_gift") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;
        CompleteObjective(Obj.QuestId, Obj.Id);
    });
}

void UQuestSystem::TrackItemCrafted(const FString& ItemId, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("craft_item") }, [&](FQuestObjective& Obj) {
        if (Obj.CraftedItemId == ItemId)
        {
            Obj.CraftedCount++;
            if (Obj.CraftedCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
            {
                CompleteObjective(Obj.QuestId, Obj.Id);
            }
        }
    });
}

// ── Combat / reputation ─────────────────────────────────────────────────────

void UQuestSystem::TrackEnemyDefeated(const FString& EnemyType, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("defeat_enemies") }, [&](FQuestObjective& Obj) {
        if (!Obj.EnemyType.IsEmpty() && Obj.EnemyType != EnemyType) return;

        Obj.EnemiesDefeated++;
        if (Obj.EnemiesDefeated >= (Obj.EnemiesRequired > 0 ? Obj.EnemiesRequired : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackReputationGain(const FString& FactionId, int32 Amount, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("gain_reputation") }, [&](FQuestObjective& Obj) {
        if (Obj.FactionId != FactionId) return;

        Obj.ReputationGained += Amount;
        if (Obj.ReputationGained >= (Obj.ReputationRequired > 0 ? Obj.ReputationRequired : 100))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackArrival(const FString& NpcOrItemId, bool bReached, const FString& QuestId)
{
    if (!bReached) return;

    ForEachObjective(QuestId, { TEXT("escort_npc"), TEXT("deliver_item") }, [&](FQuestObjective& Obj) {
        if (Obj.Type == TEXT("escort_npc"))
        {
            Obj.bArrived = true;
        }
        else
        {
            Obj.bDelivered = true;
        }
        CompleteObjective(Obj.QuestId, Obj.Id);
    });
}

// ── Location tracking ───────────────────────────────────────────────────────

void UQuestSystem::TrackLocationVisit(const FString& LocationId, const FString& LocationName, const FString& QuestId)
{
    FString LowerName = LocationName.ToLower();
    FString LowerId = LocationId.ToLower();

    ForEachObjective(QuestId, { TEXT("visit_location"), TEXT("discover_location") }, [&](FQuestObjective& Obj) {
        FString ObjName = Obj.LocationName.ToLower();
        if (ObjName.IsEmpty()) return;

        if (ObjName == LowerId || ObjName == LowerName ||
            LowerName.Contains(ObjName) || ObjName.Contains(LowerName))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Teaching ────────────────────────────────────────────────────────────────

void UQuestSystem::TrackTeachWord(const FString& NpcId, const FString& Word, const FString& QuestId)
{
    FString LowerWord = Word.ToLower();
    ForEachObjective(QuestId, { TEXT("teach_vocabulary") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;
        if (Obj.WordsTaught.Contains(LowerWord)) return;

        Obj.WordsTaught.Add(LowerWord);
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 3))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackTeachPhrase(const FString& NpcId, const FString& Phrase, const FString& QuestId)
{
    FString LowerPhrase = Phrase.ToLower();
    ForEachObjective(QuestId, { TEXT("teach_phrase") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcId.IsEmpty() && Obj.NpcId != NpcId) return;
        if (Obj.PhrasesTaught.Contains(LowerPhrase)) return;

        Obj.PhrasesTaught.Add(LowerPhrase);
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Mercantile ──────────────────────────────────────────────────────────────

void UQuestSystem::TrackFoodOrdered(const FString& ItemName, const FString& MerchantId, const FString& BusinessType, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("order_food") }, [&](FQuestObjective& Obj) {
        if (!Obj.MerchantId.IsEmpty() && Obj.MerchantId != MerchantId) return;

        Obj.ItemsPurchased.Add(ItemName);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackPriceHaggled(const FString& ItemName, const FString& MerchantId, const FString& TypedWord, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("haggle_price") }, [&](FQuestObjective& Obj) {
        if (!Obj.MerchantId.IsEmpty() && Obj.MerchantId != MerchantId) return;

        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Direction / navigation ──────────────────────────────────────────────────

void UQuestSystem::TrackDirectionStep(const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("follow_directions") }, [&](FQuestObjective& Obj) {
        Obj.StepsCompleted++;
        Obj.CurrentCount = Obj.StepsCompleted;

        int32 Required = Obj.StepsRequired > 0 ? Obj.StepsRequired : (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1);
        if (Obj.StepsCompleted >= Required)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackNavigationWaypoint(const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("navigate_language") }, [&](FQuestObjective& Obj) {
        Obj.WaypointsReached++;
        Obj.StepsCompleted = Obj.WaypointsReached;

        int32 Required = Obj.StepsRequired > 0 ? Obj.StepsRequired : 1;
        if (Obj.WaypointsReached >= Required)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::CheckDirectionProximity(const FVector& PlayerPos)
{
    for (auto& Obj : Objectives)
    {
        if (Obj.bCompleted) continue;
        if (IsObjectiveLockedInternal(Obj)) continue;

        if (Obj.Type == TEXT("follow_directions") || Obj.Type == TEXT("navigate_language"))
        {
            // Direction step proximity checking stub.
            // Game implementation should deserialize direction_steps/navigation_waypoints
            // from quest data and check player distance against each waypoint target.
            // On proximity match, call TrackDirectionStep or TrackNavigationWaypoint.
        }
    }
}

// ── Listening / translation ─────────────────────────────────────────────────

void UQuestSystem::TrackListeningAnswer(bool bCorrect, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("listening_comprehension") }, [&](FQuestObjective& Obj) {
        Obj.QuestionsAnswered++;
        if (bCorrect)
        {
            Obj.QuestionsCorrect++;
        }
        Obj.CurrentCount = Obj.QuestionsAnswered;

        int32 Required = Obj.RequiredCount > 0 ? Obj.RequiredCount : 3;
        if (Obj.QuestionsCorrect >= Required)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackTranslationAttempt(bool bCorrect, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("translation_challenge") }, [&](FQuestObjective& Obj) {
        if (bCorrect)
        {
            Obj.TranslationsCorrect++;
        }
        Obj.TranslationsCompleted++;
        Obj.CurrentCount = Obj.TranslationsCorrect;

        int32 Required = Obj.RequiredCount > 0 ? Obj.RequiredCount : 3;
        if (Obj.TranslationsCorrect >= Required)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Object interaction ──────────────────────────────────────────────────────

void UQuestSystem::TrackObjectIdentified(const FString& ObjectName, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("identify_object") }, [&](FQuestObjective& Obj) {
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackObjectExamined(const FString& ObjectName, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("examine_object") }, [&](FQuestObjective& Obj) {
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackSignRead(const FString& SignId, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("read_sign") }, [&](FQuestObjective& Obj) {
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackPointAndName(const FString& ObjectName, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("point_and_name") }, [&](FQuestObjective& Obj) {
        Obj.CurrentCount++;
        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Text / reading / comprehension ──────────────────────────────────────────

void UQuestSystem::TrackTextFound(const FString& TextId, const FString& TextName, const FString& QuestId)
{
    FString LowerName = TextName.ToLower();

    ForEachObjective(QuestId, { TEXT("find_text") }, [&](FQuestObjective& Obj) {
        FString TargetName = Obj.ItemName.ToLower();
        if (!TargetName.IsEmpty() && TargetName != LowerName && TargetName != TextId) return;

        if (Obj.TextsFound.Contains(TextId)) return;

        Obj.TextsFound.Add(TextId);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackTextRead(const FString& TextId, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("read_text") }, [&](FQuestObjective& Obj) {
        if (!Obj.TextId.IsEmpty() && Obj.TextId != TextId) return;

        if (Obj.TextsRead.Contains(TextId)) return;

        Obj.TextsRead.Add(TextId);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackComprehensionAnswer(bool bCorrect, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("comprehension_quiz") }, [&](FQuestObjective& Obj) {
        Obj.QuizAnswered++;
        if (bCorrect)
        {
            Obj.QuizCorrect++;
        }
        Obj.CurrentCount = Obj.QuizCorrect;

        int32 Required = Obj.RequiredCount > 0 ? Obj.RequiredCount : 3;
        int32 Threshold = Obj.QuizPassThreshold > 0 ? Obj.QuizPassThreshold : Required;
        if (Obj.QuizCorrect >= Threshold)
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Photography / observation ───────────────────────────────────────────────

void UQuestSystem::TrackPhotoTaken(const FString& SubjectName, const FString& SubjectCategory, const FString& SubjectActivity, const FString& QuestId)
{
    FString LowerName = SubjectName.ToLower();
    FString LowerActivity = SubjectActivity.ToLower();

    ForEachObjective(QuestId, { TEXT("photograph_subject") }, [&](FQuestObjective& Obj) {
        if (!Obj.TargetCategory.IsEmpty() && Obj.TargetCategory != SubjectCategory) return;
        if (!Obj.TargetSubject.IsEmpty() && Obj.TargetSubject.ToLower() != LowerName) return;
        if (!Obj.TargetActivity.IsEmpty())
        {
            if (LowerActivity.IsEmpty()) return;
            if (!LowerActivity.Contains(Obj.TargetActivity.ToLower())) return;
        }

        FString TrackingKey = !Obj.TargetActivity.IsEmpty()
            ? FString::Printf(TEXT("%s:%s"), *LowerName, *LowerActivity)
            : LowerName;

        if (Obj.PhotographedSubjects.Contains(TrackingKey)) return;

        Obj.PhotographedSubjects.Add(TrackingKey);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackActivityPhotographed(const FString& NpcId, const FString& NpcName, const FString& Activity, const FString& QuestId)
{
    FString LowerName = NpcName.ToLower();
    FString LowerActivity = Activity.ToLower();

    ForEachObjective(QuestId, { TEXT("photograph_activity") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcName.IsEmpty() && Obj.NpcName.ToLower() != LowerName) return;
        if (!Obj.TargetActivity.IsEmpty() && !LowerActivity.Contains(Obj.TargetActivity.ToLower())) return;

        FString TrackingKey = FString::Printf(TEXT("%s:%s"), *LowerName, *LowerActivity);
        if (Obj.PhotographedSubjects.Contains(TrackingKey)) return;

        Obj.PhotographedSubjects.Add(TrackingKey);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

void UQuestSystem::TrackActivityObserved(const FString& NpcId, const FString& NpcName, const FString& Activity, float DurationSeconds, const FString& QuestId)
{
    FString LowerName = NpcName.ToLower();
    FString LowerActivity = Activity.ToLower();

    ForEachObjective(QuestId, { TEXT("observe_activity") }, [&](FQuestObjective& Obj) {
        if (!Obj.NpcName.IsEmpty() && Obj.NpcName.ToLower() != LowerName) return;
        if (!Obj.TargetActivity.IsEmpty() && !LowerActivity.Contains(Obj.TargetActivity.ToLower())) return;

        float Required = Obj.ObserveDurationRequired > 0.f ? Obj.ObserveDurationRequired : 5.f;
        if (DurationSeconds < Required) return;

        FString TrackingKey = FString::Printf(TEXT("%s:%s"), *LowerName, *LowerActivity);
        if (Obj.ObservedActivities.Contains(TrackingKey)) return;

        Obj.ObservedActivities.Add(TrackingKey);
        Obj.CurrentCount++;

        if (Obj.CurrentCount >= (Obj.RequiredCount > 0 ? Obj.RequiredCount : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });
}

// ── Physical actions ────────────────────────────────────────────────────────

void UQuestSystem::TrackPhysicalAction(const FString& ActionType, const TArray<FString>& ItemsProduced, const FString& QuestId)
{
    ForEachObjective(QuestId, { TEXT("perform_physical_action") }, [&](FQuestObjective& Obj) {
        if (!Obj.ActionType.IsEmpty() && Obj.ActionType != ActionType) return;

        Obj.ActionsCompleted++;
        if (Obj.ActionsCompleted >= (Obj.ActionsRequired > 0 ? Obj.ActionsRequired : 1))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    });

    // Physical actions that produce items also count toward collect_item objectives
    for (const FString& Item : ItemsProduced)
    {
        TrackCollectedItemByName(Item, TEXT(""), QuestId);
    }

    // Also count toward craft_item if items were produced
    for (const FString& Item : ItemsProduced)
    {
        TrackItemCrafted(Item, QuestId);
    }
}

// ── Declarative trigger & event matching ────────────────────────────────────

void UQuestSystem::TrackByTrigger(const FString& Trigger, const FString& QuestId)
{
    for (auto& Obj : Objectives)
    {
        if (Obj.bCompleted) continue;
        if (!QuestId.IsEmpty() && Obj.QuestId != QuestId) continue;
        if (Obj.CompletionTrigger == Trigger && !IsObjectiveLockedInternal(Obj))
        {
            CompleteObjective(Obj.QuestId, Obj.Id);
        }
    }
}

int32 UQuestSystem::HandleGameEvent(const TMap<FString, FString>& EventData)
{
    const FString* EventTypePtr = EventData.Find(TEXT("type"));
    if (!EventTypePtr || EventTypePtr->IsEmpty()) return 0;
    const FString& EventType = *EventTypePtr;

    int32 Affected = 0;

    for (const auto& Mapping : ActionMappings)
    {
        if (Mapping.EventType != EventType) continue;

        ForEachObjective(TEXT(""), { Mapping.ObjectiveType }, [&](FQuestObjective& Obj) {
            if (!MatchesAllFields(Mapping, EventData, Obj)) return;

            // For photograph_activity: compound check on activity
            if (Mapping.ObjectiveType == TEXT("photograph_activity"))
            {
                FString ObjActivity = Obj.TargetActivity.ToLower();
                const FString* EvAct = EventData.Find(TEXT("subjectActivity"));
                FString EventActivity = EvAct ? EvAct->ToLower() : TEXT("");
                if (!ObjActivity.IsEmpty() && (EventActivity.IsEmpty() || !EventActivity.Contains(ObjActivity)))
                {
                    return;
                }
            }

            Affected++;

            if (Mapping.bHasQuantity)
            {
                Obj.CurrentCount++;
                int32 Required = Obj.RequiredCount > 0 ? Obj.RequiredCount : Mapping.Quantity.DefaultRequired;
                if (Obj.CurrentCount >= Required)
                {
                    CompleteObjective(Obj.QuestId, Obj.Id);
                }
            }
            else
            {
                CompleteObjective(Obj.QuestId, Obj.Id);
            }
        });
    }

    return Affected;
}

// ── Position generation ─────────────────────────────────────────────────────

void UQuestSystem::SetPointInBuildingCheck(const FPointInBuildingCheck& Check)
{
    PointInBuildingCheck = Check;
}

TArray<FVector> UQuestSystem::GenerateItemPositions(int32 Count) const
{
    TArray<FVector> Positions;
    const float Radius = 3000.f; // 30 m in UE units

    for (int32 i = 0; i < Count; i++)
    {
        float X = 0.f, Z = 0.f;
        for (int32 Attempt = 0; Attempt < 8; Attempt++)
        {
            float Angle = (PI * 2.f * i) / Count + FMath::FRandRange(0.f, 0.5f);
            float Dist = 1000.f + FMath::FRandRange(0.f, Radius);
            X = FMath::Cos(Angle) * Dist;
            Z = FMath::Sin(Angle) * Dist;
            if (!PointInBuildingCheck.IsBound() || !PointInBuildingCheck.Execute(X, Z))
            {
                break;
            }
        }
        Positions.Add(FVector(X, Z, 50.f)); // Slightly above ground
    }
    return Positions;
}

FVector UQuestSystem::GenerateLocationPosition() const
{
    for (int32 Attempt = 0; Attempt < 8; Attempt++)
    {
        float Angle = FMath::FRandRange(0.f, PI * 2.f);
        float Dist = 2000.f + FMath::FRandRange(0.f, 2000.f);
        float X = FMath::Cos(Angle) * Dist;
        float Z = FMath::Sin(Angle) * Dist;
        if (!PointInBuildingCheck.IsBound() || !PointInBuildingCheck.Execute(X, Z))
        {
            return FVector(X, Z, 0.f);
        }
    }
    // Fallback — push farther out
    float Angle = FMath::FRandRange(0.f, PI * 2.f);
    float Dist = 4000.f + FMath::FRandRange(0.f, 1000.f);
    return FVector(FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0.f);
}

TArray<FVector> UQuestSystem::GetCollectibleItemPositions() const
{
    TArray<FVector> Positions;
    for (const auto& Obj : Objectives)
    {
        if (Obj.bCompleted) continue;
        if (Obj.Type != TEXT("collect_item") && Obj.Type != TEXT("identify_object") && Obj.Type != TEXT("find_vocabulary_items")) continue;
        TArray<FVector> ItemPositions = GenerateItemPositions(FMath::Max(1, Obj.RequiredCount - Obj.CurrentCount));
        Positions.Append(ItemPositions);
    }
    return Positions;
}

void UQuestSystem::SetMarkerDebugLabel(AActor* Marker, const FString& Label)
{
    if (!Marker) return;
    Marker->Tags.AddUnique(*FString::Printf(TEXT("DebugLabel:%s"), *Label));
}
