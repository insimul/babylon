#include "PrologEngine.h"
#include "EventBus.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UPrologEngine::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine initialized (stub — no native Prolog runtime)"));
}

void UPrologEngine::Deinitialize()
{
    // Unsubscribe from event bus if subscribed
    if (SubscribedEventBus.IsValid() && EventBusSubscriptionHandle >= 0)
    {
        SubscribedEventBus->Unsubscribe(EventBusSubscriptionHandle);
        EventBusSubscriptionHandle = -1;
    }
    SubscribedEventBus = nullptr;
    EventBusRef = nullptr;

    KnowledgeBase.Empty();
    Facts.Empty();
    Rules.Empty();
    ActiveQuestIds.Empty();
    ItemQuantities.Empty();
    PlayerFacts.Empty();
    CompletedObjectives.Empty();
    CompletedQuests.Empty();
    bInitialized = false;
    FactCount = 0;
    RuleCount = 0;
    Super::Deinitialize();
}

void UPrologEngine::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    // Load pre-generated Prolog content if available
    FString PrologContent;
    const TSharedPtr<FJsonObject>* SystemsObj;
    if (Root->TryGetObjectField(TEXT("systems"), SystemsObj))
    {
        (*SystemsObj)->TryGetStringField(TEXT("prologContent"), PrologContent);
    }

    if (!PrologContent.IsEmpty())
    {
        KnowledgeBase = PrologContent;
    }

    // Assert character facts from IR
    const TArray<TSharedPtr<FJsonValue>>* CharactersArr;
    if (Root->TryGetArrayField(TEXT("characters"), CharactersArr))
    {
        for (const TSharedPtr<FJsonValue>& CharVal : *CharactersArr)
        {
            const TSharedPtr<FJsonObject>* CharObj;
            if (!CharVal->TryGetObject(CharObj)) continue;

            FString FirstName, LastName, Id;
            (*CharObj)->TryGetStringField(TEXT("firstName"), FirstName);
            (*CharObj)->TryGetStringField(TEXT("lastName"), LastName);
            (*CharObj)->TryGetStringField(TEXT("id"), Id);

            FString CharId = Sanitize(FirstName + TEXT("_") + LastName + TEXT("_") + Id);
            AssertFact(FString::Printf(TEXT("person(%s)"), *CharId));

            if (!FirstName.IsEmpty())
            {
                FString FullName = FirstName + TEXT(" ") + LastName;
                AssertFact(FString::Printf(TEXT("name(%s, '%s')"), *CharId, *EscapeProlog(FullName)));
            }

            int32 Age = 0;
            if ((*CharObj)->TryGetNumberField(TEXT("age"), Age))
            {
                AssertFact(FString::Printf(TEXT("age(%s, %d)"), *CharId, Age));
            }

            FString Occupation;
            if ((*CharObj)->TryGetStringField(TEXT("occupation"), Occupation))
            {
                AssertFact(FString::Printf(TEXT("occupation(%s, %s)"), *CharId, *Sanitize(Occupation)));
            }

            FString Gender;
            if ((*CharObj)->TryGetStringField(TEXT("gender"), Gender))
            {
                AssertFact(FString::Printf(TEXT("gender(%s, %s)"), *CharId, *Sanitize(Gender)));
            }
        }
    }

    // Assert settlement facts from IR
    const TArray<TSharedPtr<FJsonValue>>* SettlementsArr;
    if (Root->TryGetArrayField(TEXT("settlements"), SettlementsArr))
    {
        for (const TSharedPtr<FJsonValue>& SettVal : *SettlementsArr)
        {
            const TSharedPtr<FJsonObject>* SettObj;
            if (!SettVal->TryGetObject(SettObj)) continue;

            FString SettName, SettId, SettType;
            (*SettObj)->TryGetStringField(TEXT("name"), SettName);
            (*SettObj)->TryGetStringField(TEXT("id"), SettId);
            FString SId = Sanitize(!SettName.IsEmpty() ? SettName : SettId);
            AssertFact(FString::Printf(TEXT("settlement(%s)"), *SId));

            if ((*SettObj)->TryGetStringField(TEXT("type"), SettType))
            {
                AssertFact(FString::Printf(TEXT("settlement_type(%s, %s)"), *SId, *Sanitize(SettType)));
            }
        }
    }

    // Load Prolog content from rules, actions, quests
    if (SystemsObj)
    {
        auto LoadContentArray = [this](const TSharedPtr<FJsonObject>& Obj, const FString& FieldName)
        {
            const TArray<TSharedPtr<FJsonValue>>* Arr;
            if (Obj->TryGetArrayField(FieldName, Arr))
            {
                for (const TSharedPtr<FJsonValue>& Val : *Arr)
                {
                    const TSharedPtr<FJsonObject>* ItemObj;
                    if (!Val->TryGetObject(ItemObj)) continue;
                    FString Content;
                    if ((*ItemObj)->TryGetStringField(TEXT("content"), Content) && !Content.IsEmpty())
                    {
                        KnowledgeBase += TEXT("\n") + Content;
                    }
                }
            }
        };

        LoadContentArray(*SystemsObj, TEXT("rules"));
        LoadContentArray(*SystemsObj, TEXT("baseRules"));
        LoadContentArray(*SystemsObj, TEXT("actions"));
        LoadContentArray(*SystemsObj, TEXT("quests"));

        // Track active quest IDs
        const TArray<TSharedPtr<FJsonValue>>* QuestsArr;
        if ((*SystemsObj)->TryGetArrayField(TEXT("quests"), QuestsArr))
        {
            for (const TSharedPtr<FJsonValue>& QVal : *QuestsArr)
            {
                const TSharedPtr<FJsonObject>* QObj;
                if (!QVal->TryGetObject(QObj)) continue;
                FString QId;
                if ((*QObj)->TryGetStringField(TEXT("id"), QId))
                {
                    ActiveQuestIds.Add(QId);
                }
            }
        }
    }

    // Parse the accumulated KB into facts and rules
    ParseKnowledgeBase();

    bInitialized = true;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine loaded: %d facts, %d rules"), FactCount, RuleCount);
}

void UPrologEngine::InitializeInventory(const TArray<FInsimulPrologItem>& Items)
{
    if (!bInitialized) return;

    for (const FInsimulPrologItem& Item : Items)
    {
        FString Name = Sanitize(Item.Name);
        int32 Qty = FMath::Max(1, Item.Quantity);

        AssertFact(FString::Printf(TEXT("has(player, %s)"), *Name));
        AssertFact(FString::Printf(TEXT("has_item(player, %s, %d)"), *Name, Qty));

        // Track quantity
        int32& CurrentQty = ItemQuantities.FindOrAdd(Name);
        CurrentQty += Qty;

        if (!Item.Type.IsEmpty())
        {
            AssertFact(FString::Printf(TEXT("item_type(%s, %s)"), *Name, *Sanitize(Item.Type)));
        }
        if (Item.Value > 0)
        {
            AssertFact(FString::Printf(TEXT("item_value(%s, %d)"), *Name, Item.Value));
        }

        // Assert taxonomy
        AssertItemTaxonomy(Name, Item.Category, Item.Material, Item.BaseType, Item.Rarity, Item.Type);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine initialized %d inventory items as facts"), Items.Num());
}

void UPrologEngine::InitializeWorldItems(const TArray<FInsimulWorldItemDef>& Items)
{
    if (!bInitialized) return;

    for (const FInsimulWorldItemDef& Item : Items)
    {
        FString Name = Sanitize(Item.Name);

        if (!Item.ItemType.IsEmpty())
        {
            AssertFact(FString::Printf(TEXT("item_type(%s, %s)"), *Name, *Sanitize(Item.ItemType)));
        }
        if (Item.Value > 0)
        {
            AssertFact(FString::Printf(TEXT("item_value(%s, %d)"), *Name, Item.Value));
        }

        AssertItemTaxonomy(Name, Item.Category, Item.Material, Item.BaseType, Item.Rarity, Item.ItemType);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine initialized %d world item definitions as facts"), Items.Num());
}

void UPrologEngine::LoadItemReasoningRules()
{
    if (!bInitialized) return;

    // Assert IS-A reasoning rules as facts/rules in the KB text.
    // These mirror the rules from GamePrologEngine.loadItemReasoningRules().
    const FString ItemRules = TEXT(
        "item_is_a(Item, Category) :- item_category(Item, Category).\n"
        "item_is_a(Item, BaseType) :- item_base_type(Item, BaseType).\n"
        "item_is_a(Item, Type) :- item_type(Item, Type).\n"
        "has_item_of_type(Player, Type) :- has(Player, Item), item_is_a(Item, Type).\n"
        "has_at_least(Player, Item, N) :- has_item(Player, Item, Qty), Qty >= N.\n"
    );

    KnowledgeBase += TEXT("\n") + ItemRules;
    ParseKnowledgeBase(); // Re-parse to pick up new rules

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine loaded item IS-A reasoning rules"));
}

void UPrologEngine::LoadHelperPredicates()
{
    if (!bInitialized) return;

    // Gameplay helper predicates — mirrors HELPER_PREDICATES_PROLOG from
    // shared/prolog/helper-predicates.ts (CEFR comparison, weapon/tool
    // type classification, skill tier names, skill level comparison).
    const FString HelperRules = TEXT(
        "% CEFR level ranks\n"
        "cefr_level_rank(a1, 1).\n"
        "cefr_level_rank(a2, 2).\n"
        "cefr_level_rank(b1, 3).\n"
        "cefr_level_rank(b2, 4).\n"
        "cefr_level_rank(c1, 5).\n"
        "cefr_level_rank(c2, 6).\n"
        "cefr_gte(Actual, Required) :- cefr_level_rank(Actual, AR), cefr_level_rank(Required, RR), AR >= RR.\n"
        "\n"
        "% Weapon type classification\n"
        "is_weapon_type(ItemId, sword) :- item_type(ItemId, sword).\n"
        "is_weapon_type(ItemId, axe) :- item_type(ItemId, axe).\n"
        "is_weapon_type(ItemId, bow) :- item_type(ItemId, bow).\n"
        "is_weapon_type(ItemId, staff) :- item_type(ItemId, staff).\n"
        "is_weapon_type(ItemId, pistol) :- item_type(ItemId, pistol).\n"
        "\n"
        "% Tool type classification\n"
        "is_tool_type(ItemId, fishing_rod) :- item_type(ItemId, fishing_rod).\n"
        "is_tool_type(ItemId, pickaxe) :- item_type(ItemId, pickaxe).\n"
        "is_tool_type(ItemId, axe) :- item_type(ItemId, axe).\n"
        "is_tool_type(ItemId, hoe) :- item_type(ItemId, hoe).\n"
        "\n"
        "% Skill tier names\n"
        "skill_tier_name(1, novice).\n"
        "skill_tier_name(2, novice).\n"
        "skill_tier_name(3, apprentice).\n"
        "skill_tier_name(4, apprentice).\n"
        "skill_tier_name(5, journeyman).\n"
        "skill_tier_name(6, journeyman).\n"
        "skill_tier_name(7, expert).\n"
        "skill_tier_name(8, expert).\n"
        "skill_tier_name(9, expert).\n"
        "skill_tier_name(10, master).\n"
        "\n"
        "% Skill level comparison\n"
        "skill_gte(Actor, Skill, MinLevel) :- has_skill(Actor, Skill, Level), Level >= MinLevel.\n"
    );

    KnowledgeBase += TEXT("\n") + HelperRules;
    ParseKnowledgeBase();

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine loaded gameplay helper predicates"));
}

void UPrologEngine::UpdateGameState(const FInsimulGameState& State)
{
    if (!bInitialized) return;

    FString PlayerId = Sanitize(State.PlayerCharacterId);

    // Retract old dynamic state
    RetractPattern(TEXT("energy"), PlayerId);
    RetractPattern(TEXT("at_location"), PlayerId);
    RetractPattern(TEXT("nearby_npc"), PlayerId);

    // Assert current state
    AssertFact(FString::Printf(TEXT("energy(%s, %d)"), *PlayerId, FMath::RoundToInt(State.PlayerEnergy)));

    if (!State.CurrentSettlement.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("at_location(%s, %s)"), *PlayerId, *Sanitize(State.CurrentSettlement)));
    }

    for (const FString& NPCId : State.NearbyNPCs)
    {
        AssertFact(FString::Printf(TEXT("nearby_npc(%s, %s)"), *PlayerId, *Sanitize(NPCId)));
    }

    // Assert environment facts if provided
    if (State.GameHour >= 0 || !State.Weather.IsEmpty())
    {
        UpdateEnvironment(State.GameHour, State.Weather, State.Season, State.QuestsCompleted, State.Reputation, State.bIsNewToTown);
    }

    CurrentGameState = State;
}

void UPrologEngine::UpdateEnvironment(int32 GameHour, const FString& Weather, const FString& Season, int32 QuestsCompleted, float Reputation, bool bIsNewToTown)
{
    if (!bInitialized) return;

    RetractByPredicate(TEXT("game_hour"));
    RetractByPredicate(TEXT("time_period"));
    RetractByPredicate(TEXT("time_of_day"));
    RetractByPredicate(TEXT("weather"));
    RetractByPredicate(TEXT("season"));
    RetractByPredicate(TEXT("player_quests_completed"));
    RetractByPredicate(TEXT("player_reputation"));
    RetractByPredicate(TEXT("player_is_new"));

    int32 Hour = GameHour >= 0 ? GameHour : 12;
    AssertFact(FString::Printf(TEXT("game_hour(%d)"), Hour));

    // Derive time_period
    FString Period;
    if (Hour >= 5 && Hour < 7) Period = TEXT("dawn");
    else if (Hour >= 7 && Hour < 12) Period = TEXT("morning");
    else if (Hour >= 12 && Hour < 17) Period = TEXT("afternoon");
    else if (Hour >= 17 && Hour < 21) Period = TEXT("evening");
    else Period = TEXT("night");
    AssertFact(FString::Printf(TEXT("time_period(%s)"), *Period));

    // Schedule-compatible time_of_day
    FString ScheduleTime;
    if (Hour < 12) ScheduleTime = TEXT("morning");
    else if (Hour < 17) ScheduleTime = TEXT("afternoon");
    else if (Hour < 21) ScheduleTime = TEXT("evening");
    else ScheduleTime = TEXT("night");
    AssertFact(FString::Printf(TEXT("time_of_day(%s)"), *ScheduleTime));

    if (!Weather.IsEmpty())
        AssertFact(FString::Printf(TEXT("weather(%s)"), *Sanitize(Weather)));
    else
        AssertFact(TEXT("weather(clear)"));

    if (!Season.IsEmpty())
        AssertFact(FString::Printf(TEXT("season(%s)"), *Sanitize(Season)));

    if (QuestsCompleted >= 0)
        AssertFact(FString::Printf(TEXT("player_quests_completed(%d)"), QuestsCompleted));

    if (Reputation != 0.f)
        AssertFact(FString::Printf(TEXT("player_reputation(%d)"), FMath::RoundToInt(Reputation)));

    if (bIsNewToTown)
        AssertFact(TEXT("player_is_new"));
}

bool UPrologEngine::ShouldMentionWeather(const FString& NPCId)
{
    if (!bInitialized) return false;
    return HasFact(FString::Printf(TEXT("weather_complaint_likely(%s)"), *Sanitize(NPCId)));
}

FString UPrologEngine::GetPlayerAttitude(const FString& NPCId)
{
    if (!bInitialized) return TEXT("neutral");
    FString Id = Sanitize(NPCId);
    if (HasFact(FString::Printf(TEXT("impressed_by_player(%s)"), *Id))) return TEXT("impressed");
    if (HasFact(FString::Printf(TEXT("respects_player(%s)"), *Id))) return TEXT("respectful");
    if (HasFact(FString::Printf(TEXT("wary_of_newcomer(%s)"), *Id))) return TEXT("wary");
    if (HasFact(FString::Printf(TEXT("welcoming_to_newcomer(%s)"), *Id))) return TEXT("welcoming");
    return TEXT("neutral");
}

// ── Action & Quest Queries ──────────────────────────────────────────────────

FInsimulPrologActionResult UPrologEngine::CanPerformAction(const FString& ActionId, const FString& ActorId, const FString& TargetId)
{
    FInsimulPrologActionResult Result;

    if (!bInitialized)
    {
        Result.bAllowed = true;
        return Result;
    }

    FString ActionAtom = Sanitize(ActionId);
    FString ActorAtom = Sanitize(ActorId);

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::CanPerformAction(%s, %s, %s) — stub query"),
        *ActionId, *ActorId, *TargetId);

    // Stub: check if there's a can_perform fact in the KB
    FString Query2 = FString::Printf(TEXT("can_perform(%s, %s)"), *ActorAtom, *ActionAtom);
    FString Query3 = TargetId.IsEmpty() ? TEXT("")
        : FString::Printf(TEXT("can_perform(%s, %s, %s)"), *ActorAtom, *ActionAtom, *Sanitize(TargetId));

    // Check for explicit blocks first
    FString BlockQuery = FString::Printf(TEXT("cannot_perform(%s, %s)"), *ActorAtom, *ActionAtom);
    if (HasFact(BlockQuery))
    {
        Result.bAllowed = false;
        Result.Reason = FString::Printf(TEXT("Prerequisites not met for action: %s"), *ActionId);
        return Result;
    }

    // If KB has can_perform rules, check for a matching fact
    // Otherwise, allow by default (graceful degradation like the TypeScript source)
    bool bHasCanPerformRules = FindFacts(TEXT("can_perform(")).Num() > 0;
    if (bHasCanPerformRules)
    {
        bool bFound = HasFact(Query2) || (!Query3.IsEmpty() && HasFact(Query3));
        if (!bFound)
        {
            Result.bAllowed = false;
            Result.Reason = FString::Printf(TEXT("Prerequisites not met for action: %s"), *ActionId);
            return Result;
        }
    }

    Result.bAllowed = true;
    return Result;
}

bool UPrologEngine::IsQuestAvailable(const FString& QuestId, const FString& PlayerId)
{
    if (!bInitialized) return true;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::IsQuestAvailable(%s, %s) — stub query"),
        *QuestId, *PlayerId);

    // Check for quest_available fact
    FString Pattern = FString::Printf(TEXT("quest_available(%s, %s)"), *Sanitize(PlayerId), *Sanitize(QuestId));
    if (HasFact(Pattern)) return true;

    // If no quest_available rules exist, default to available
    bool bHasQuestAvailableRules = FindFacts(TEXT("quest_available(")).Num() > 0;
    return !bHasQuestAvailableRules;
}

bool UPrologEngine::IsQuestComplete(const FString& QuestId, const FString& PlayerId)
{
    if (!bInitialized) return false;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::IsQuestComplete(%s, %s) — stub query"),
        *QuestId, *PlayerId);

    FString Pattern = FString::Printf(TEXT("quest_complete(%s, %s)"), *Sanitize(PlayerId), *Sanitize(QuestId));
    return HasFact(Pattern);
}

bool UPrologEngine::IsStageComplete(const FString& QuestId, const FString& StageId, const FString& PlayerId)
{
    if (!bInitialized) return false;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::IsStageComplete(%s, %s, %s) — stub query"),
        *QuestId, *StageId, *PlayerId);

    FString Pattern = FString::Printf(TEXT("stage_complete(%s, %s, %s)"),
        *Sanitize(PlayerId), *Sanitize(QuestId), *Sanitize(StageId));
    return HasFact(Pattern);
}

TArray<FString> UPrologEngine::GetApplicableRules(const FString& ActorId)
{
    if (!bInitialized) return {};

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::GetApplicableRules(%s) — stub query"), *ActorId);

    // Look for rule_applies(RuleName, ActorId, _) facts
    FString Prefix = FString::Printf(TEXT("rule_applies("), *Sanitize(ActorId));
    TArray<FString> MatchingFacts = FindFacts(TEXT("rule_applies("));

    TArray<FString> RuleNames;
    FString ActorAtom = Sanitize(ActorId);

    for (const FString& Fact : MatchingFacts)
    {
        // Parse rule_applies(RuleName, ActorId, ...) — extract RuleName if ActorId matches
        if (Fact.Contains(ActorAtom))
        {
            // Extract first argument: everything between first ( and first ,
            int32 OpenParen = INDEX_NONE;
            int32 FirstComma = INDEX_NONE;
            Fact.FindChar(TEXT('('), OpenParen);
            Fact.FindChar(TEXT(','), FirstComma);
            if (OpenParen != INDEX_NONE && FirstComma != INDEX_NONE && FirstComma > OpenParen + 1)
            {
                FString RuleName = Fact.Mid(OpenParen + 1, FirstComma - OpenParen - 1).TrimStartAndEnd();
                RuleNames.AddUnique(RuleName);
            }
        }
    }

    return RuleNames;
}

bool UPrologEngine::EvaluateCondition(const FString& PrologGoal)
{
    if (!bInitialized) return true;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::EvaluateCondition(%s) — stub query"), *PrologGoal);

    // Simple stub: check if the goal matches an asserted fact
    FString CleanGoal = PrologGoal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));
    return HasFact(CleanGoal);
}

// ── Fact Management ─────────────────────────────────────────────────────────

void UPrologEngine::AssertFact(const FString& Fact, const FString& Source)
{
    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));

    // Don't add duplicates
    if (!Facts.Contains(CleanFact))
    {
        Facts.Add(CleanFact);
        FactCount = Facts.Num();

        // Also append to raw KB for export
        KnowledgeBase += FString::Printf(TEXT("\n%s."), *CleanFact);
    }

    if (bDebugLoggingEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[PrologDebug] assert: %s %s"), *CleanFact,
            Source.IsEmpty() ? TEXT("") : *FString::Printf(TEXT("(source: %s)"), *Source));
    }
}

void UPrologEngine::RetractFact(const FString& Fact, const FString& Reason)
{
    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));

    int32 Removed = Facts.RemoveAll([&CleanFact](const FString& F) {
        return F == CleanFact;
    });

    if (Removed > 0)
    {
        FactCount = Facts.Num();
    }

    if (bDebugLoggingEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[PrologDebug] retract: %s %s"), *CleanFact,
            Reason.IsEmpty() ? TEXT("") : *FString::Printf(TEXT("(reason: %s)"), *Reason));
    }
}

TArray<FString> UPrologEngine::Query(const FString& Goal)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine::Query(%s) — stub, no native Prolog runtime. "
        "Integrate SWI-Prolog C++ bindings for full query support."), *Goal);

    // Return matching facts as a basic stub
    FString CleanGoal = Goal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));

    TArray<FString> Results;

    // Extract predicate name for prefix matching
    int32 ParenIdx = INDEX_NONE;
    CleanGoal.FindChar(TEXT('('), ParenIdx);
    if (ParenIdx != INDEX_NONE)
    {
        FString Prefix = CleanGoal.Left(ParenIdx + 1);
        Results = FindFacts(Prefix);
    }

    if (bDebugLoggingEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[PrologDebug] query: %s -> %s (%d results)"),
            *CleanGoal, Results.Num() > 0 ? TEXT("true") : TEXT("false"), Results.Num());
    }

    return Results;
}

FString UPrologEngine::ExportKnowledgeBase() const
{
    return KnowledgeBase;
}

// ── NPC Intelligence Queries ────────────────────────────────────────────────

TArray<FString> UPrologEngine::WhoShouldTalkTo(const FString& NPCId)
{
    if (!bInitialized) return {};

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::WhoShouldTalkTo(%s) — stub query"), *NPCId);

    // Look for should_talk_to(NPCId, Y) facts
    FString Prefix = FString::Printf(TEXT("should_talk_to(%s,"), *Sanitize(NPCId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    TArray<FString> Targets;
    for (const FString& Fact : MatchingFacts)
    {
        // Extract second argument
        int32 CommaIdx = INDEX_NONE;
        int32 CloseParenIdx = INDEX_NONE;
        Fact.FindChar(TEXT(','), CommaIdx);
        Fact.FindLastChar(TEXT(')'), CloseParenIdx);
        if (CommaIdx != INDEX_NONE && CloseParenIdx != INDEX_NONE && CloseParenIdx > CommaIdx + 1)
        {
            FString Target = Fact.Mid(CommaIdx + 1, CloseParenIdx - CommaIdx - 1).TrimStartAndEnd();
            if (!Target.IsEmpty())
            {
                Targets.AddUnique(Target);
            }
        }
    }

    return Targets;
}

TArray<FString> UPrologEngine::GetPreferredTopics(const FString& NPCId)
{
    if (!bInitialized) return {};

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::GetPreferredTopics(%s) — stub query"), *NPCId);

    FString Prefix = FString::Printf(TEXT("prefers_topic(%s,"), *Sanitize(NPCId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    TArray<FString> Topics;
    for (const FString& Fact : MatchingFacts)
    {
        int32 CommaIdx = INDEX_NONE;
        int32 CloseParenIdx = INDEX_NONE;
        Fact.FindChar(TEXT(','), CommaIdx);
        Fact.FindLastChar(TEXT(')'), CloseParenIdx);
        if (CommaIdx != INDEX_NONE && CloseParenIdx != INDEX_NONE && CloseParenIdx > CommaIdx + 1)
        {
            FString Topic = Fact.Mid(CommaIdx + 1, CloseParenIdx - CommaIdx - 1).TrimStartAndEnd();
            if (!Topic.IsEmpty())
            {
                Topics.AddUnique(Topic);
            }
        }
    }

    return Topics;
}

bool UPrologEngine::WantsToSocialize(const FString& NPCId)
{
    if (!bInitialized) return false;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::WantsToSocialize(%s) — stub query"), *NPCId);

    FString Pattern = FString::Printf(TEXT("wants_to_socialize(%s)"), *Sanitize(NPCId));
    return HasFact(Pattern);
}

bool UPrologEngine::IsFirstMeeting(const FString& NPCId, const FString& PlayerId)
{
    if (!bInitialized) return true;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::IsFirstMeeting(%s, %s) — stub query"),
        *NPCId, *PlayerId);

    // First meeting if no has_mental_model fact exists (negation-as-absence)
    FString Pattern = FString::Printf(TEXT("has_mental_model(%s, %s)"), *Sanitize(NPCId), *Sanitize(PlayerId));
    return !HasFact(Pattern);
}

TArray<FString> UPrologEngine::WhoToAvoid(const FString& NPCId)
{
    if (!bInitialized) return {};

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::WhoToAvoid(%s) — stub query"), *NPCId);

    FString Prefix = FString::Printf(TEXT("should_avoid(%s,"), *Sanitize(NPCId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    TArray<FString> Targets;
    for (const FString& Fact : MatchingFacts)
    {
        int32 CommaIdx = INDEX_NONE;
        int32 CloseParenIdx = INDEX_NONE;
        Fact.FindChar(TEXT(','), CommaIdx);
        Fact.FindLastChar(TEXT(')'), CloseParenIdx);
        if (CommaIdx != INDEX_NONE && CloseParenIdx != INDEX_NONE && CloseParenIdx > CommaIdx + 1)
        {
            FString Target = Fact.Mid(CommaIdx + 1, CloseParenIdx - CommaIdx - 1).TrimStartAndEnd();
            if (!Target.IsEmpty())
            {
                Targets.AddUnique(Target);
            }
        }
    }

    return Targets;
}

bool UPrologEngine::IsWillingToShare(const FString& NPCId, const FString& TargetId)
{
    if (!bInitialized) return true;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::IsWillingToShare(%s, %s) — stub query"),
        *NPCId, *TargetId);

    // If no willing_to_share facts exist, default to true (graceful degradation)
    FString Pattern = FString::Printf(TEXT("willing_to_share(%s, %s)"), *Sanitize(NPCId), *Sanitize(TargetId));
    bool bHasWillingRules = FindFacts(TEXT("willing_to_share(")).Num() > 0;
    if (!bHasWillingRules) return true;
    return HasFact(Pattern);
}

// ── NPC Intelligence Queries (additional) ───────────────────────────────────

FString UPrologEngine::GetConflictStyle(const FString& NPCId)
{
    if (!bInitialized) return FString();

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::GetConflictStyle(%s) — stub query"), *NPCId);

    FString Prefix = FString::Printf(TEXT("conflict_style(%s,"), *Sanitize(NPCId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    if (MatchingFacts.Num() > 0)
    {
        // Extract second argument
        int32 CommaIdx = INDEX_NONE;
        int32 CloseParenIdx = INDEX_NONE;
        MatchingFacts[0].FindChar(TEXT(','), CommaIdx);
        MatchingFacts[0].FindLastChar(TEXT(')'), CloseParenIdx);
        if (CommaIdx != INDEX_NONE && CloseParenIdx != INDEX_NONE && CloseParenIdx > CommaIdx + 1)
        {
            return MatchingFacts[0].Mid(CommaIdx + 1, CloseParenIdx - CommaIdx - 1).TrimStartAndEnd();
        }
    }

    return FString();
}

bool UPrologEngine::IsGrieving(const FString& NPCId)
{
    if (!bInitialized) return false;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::IsGrieving(%s) — stub query"), *NPCId);

    FString Pattern = FString::Printf(TEXT("is_grieving(%s)"), *Sanitize(NPCId));
    return HasFact(Pattern);
}

// ── NPC State Updates ───────────────────────────────────────────────────────

void UPrologEngine::UpdateNPCPersonality(const FString& NPCId, const FInsimulNPCPersonality& Personality)
{
    if (!bInitialized) return;

    FString Id = Sanitize(NPCId);
    RetractPattern(TEXT("personality"), Id);

    if (Personality.Openness >= 0.f)
        AssertFact(FString::Printf(TEXT("personality(%s, openness, %d)"), *Id, FMath::RoundToInt(Personality.Openness * 100)));
    if (Personality.Conscientiousness >= 0.f)
        AssertFact(FString::Printf(TEXT("personality(%s, conscientiousness, %d)"), *Id, FMath::RoundToInt(Personality.Conscientiousness * 100)));
    if (Personality.Extroversion >= 0.f)
        AssertFact(FString::Printf(TEXT("personality(%s, extroversion, %d)"), *Id, FMath::RoundToInt(Personality.Extroversion * 100)));
    if (Personality.Agreeableness >= 0.f)
        AssertFact(FString::Printf(TEXT("personality(%s, agreeableness, %d)"), *Id, FMath::RoundToInt(Personality.Agreeableness * 100)));
    if (Personality.Neuroticism >= 0.f)
        AssertFact(FString::Printf(TEXT("personality(%s, neuroticism, %d)"), *Id, FMath::RoundToInt(Personality.Neuroticism * 100)));
}

void UPrologEngine::UpdateNPCEmotionalState(const FString& NPCId, const FInsimulNPCEmotionalState& State)
{
    if (!bInitialized) return;

    FString Id = Sanitize(NPCId);
    RetractPattern(TEXT("mood"), Id);
    RetractPattern(TEXT("stress_level"), Id);
    RetractPattern(TEXT("social_desire"), Id);

    if (!State.Mood.IsEmpty())
        AssertFact(FString::Printf(TEXT("mood(%s, %s)"), *Id, *Sanitize(State.Mood)));
    if (State.StressLevel >= 0.f)
        AssertFact(FString::Printf(TEXT("stress_level(%s, %d)"), *Id, FMath::RoundToInt(State.StressLevel * 100)));
    if (State.SocialDesire >= 0.f)
        AssertFact(FString::Printf(TEXT("social_desire(%s, %d)"), *Id, FMath::RoundToInt(State.SocialDesire * 100)));
    if (State.Energy >= 0.f)
        AssertFact(FString::Printf(TEXT("energy(%s, %d)"), *Id, FMath::RoundToInt(State.Energy)));
}

void UPrologEngine::UpdateNPCRelationship(const FString& NPC1Id, const FString& NPC2Id, const FInsimulNPCRelationship& Relationship)
{
    if (!bInitialized) return;

    FString Id1 = Sanitize(NPC1Id);
    FString Id2 = Sanitize(NPC2Id);

    RetractPattern(TEXT("relationship_charge"), Id1, Id2);
    RetractPattern(TEXT("relationship_trust"), Id1, Id2);
    RetractPattern(TEXT("conversation_count"), Id1, Id2);
    RetractPattern(TEXT("friends"), Id1, Id2);
    RetractPattern(TEXT("enemies"), Id1, Id2);

    AssertFact(FString::Printf(TEXT("relationship_charge(%s, %s, %d)"), *Id1, *Id2, FMath::RoundToInt(Relationship.Charge * 100)));
    AssertFact(FString::Printf(TEXT("relationship_trust(%s, %s, %d)"), *Id1, *Id2, FMath::RoundToInt(Relationship.Trust * 100)));

    if (Relationship.ConversationCount > 0)
        AssertFact(FString::Printf(TEXT("conversation_count(%s, %s, %d)"), *Id1, *Id2, Relationship.ConversationCount));
    if (Relationship.bIsFriend)
        AssertFact(FString::Printf(TEXT("friends(%s, %s)"), *Id1, *Id2));
    if (Relationship.bIsEnemy)
        AssertFact(FString::Printf(TEXT("enemies(%s, %s)"), *Id1, *Id2));
}

void UPrologEngine::RecordPlayerAction(const FString& PlayerId, const FString& NPCId, const FString& ActionName)
{
    if (!bInitialized) return;

    AssertFact(FString::Printf(TEXT("player_action(%s, %s, %s)"),
        *Sanitize(PlayerId), *Sanitize(NPCId), *Sanitize(ActionName)));
}

// ── Event Bus Integration ───────────────────────────────────────────────────

void UPrologEngine::SubscribeToEventBus(UEventBus* EventBus)
{
    if (!EventBus) return;

    // Unsubscribe from previous
    if (SubscribedEventBus.IsValid() && EventBusSubscriptionHandle >= 0)
    {
        SubscribedEventBus->Unsubscribe(EventBusSubscriptionHandle);
    }

    SubscribedEventBus = EventBus;
    EventBusRef = EventBus;

    // Subscribe to all events via the global delegate
    EventBus->OnAnyEvent.AddDynamic(this, &UPrologEngine::HandleGameEvent);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine subscribed to EventBus"));
}

void UPrologEngine::SetActiveQuests(const TArray<FString>& QuestIds)
{
    ActiveQuestIds = QuestIds;

    // Clear completion tracking for quests no longer active
    TArray<FString> KeysToRemove;
    for (const FString& Key : CompletedObjectives)
    {
        FString QuestPart;
        Key.Split(TEXT(":"), &QuestPart, nullptr);
        if (!QuestIds.Contains(QuestPart))
        {
            KeysToRemove.Add(Key);
        }
    }
    for (const FString& Key : KeysToRemove)
    {
        CompletedObjectives.Remove(Key);
    }
}

void UPrologEngine::HandleGameEvent(const FInsimulGameEvent& Event)
{
    if (!bInitialized) return;

    switch (Event.EventType)
    {
        case EInsimulEventType::ItemCollected:
        {
            FString Name = Sanitize(Event.ItemName);
            AssertPlayerFact(FString::Printf(TEXT("collected(player, %s, %d)"), *Name, Event.Quantity));
            AssertPlayerFact(FString::Printf(TEXT("has(player, %s)"), *Name));
            UpdateItemQuantityTracked(Name, Event.Quantity);
            AssertItemTaxonomyTracked(Name, Event.Taxonomy.Category, Event.Taxonomy.Material,
                Event.Taxonomy.BaseType, Event.Taxonomy.Rarity, Event.Taxonomy.ItemType);
            break;
        }
        case EInsimulEventType::EnemyDefeated:
            AssertPlayerFact(FString::Printf(TEXT("defeated(player, %s)"), *Sanitize(Event.EnemyType)));
            break;
        case EInsimulEventType::LocationVisited:
            AssertPlayerFact(FString::Printf(TEXT("visited(player, %s)"), *Sanitize(Event.LocationId)));
            break;
        case EInsimulEventType::NPCTalked:
            AssertPlayerFact(FString::Printf(TEXT("talked_to(player, %s, %d)"), *Sanitize(Event.NPCId), Event.TurnCount));
            break;
        case EInsimulEventType::ItemDelivered:
            AssertPlayerFact(FString::Printf(TEXT("delivered(player, %s, %s)"), *Sanitize(Event.NPCId), *Sanitize(Event.ItemName)));
            break;
        case EInsimulEventType::VocabularyUsed:
            AssertPlayerFact(FString::Printf(TEXT("vocab_used(player, %s, %d)"), *Sanitize(Event.Word), Event.bCorrect ? 1 : 0));
            break;
        case EInsimulEventType::ItemCrafted:
        {
            FString Name = Sanitize(Event.ItemName);
            AssertPlayerFact(FString::Printf(TEXT("crafted(player, %s, %d)"), *Name, Event.Quantity));
            AssertPlayerFact(FString::Printf(TEXT("has(player, %s)"), *Name));
            UpdateItemQuantityTracked(Name, Event.Quantity);
            AssertItemTaxonomyTracked(Name, Event.Taxonomy.Category, Event.Taxonomy.Material,
                Event.Taxonomy.BaseType, Event.Taxonomy.Rarity, Event.Taxonomy.ItemType);
            break;
        }
        case EInsimulEventType::LocationDiscovered:
            AssertPlayerFact(FString::Printf(TEXT("discovered(player, %s)"), *Sanitize(Event.LocationId)));
            break;
        case EInsimulEventType::SettlementEntered:
            AssertPlayerFact(FString::Printf(TEXT("visited(player, %s)"), *Sanitize(Event.SettlementId)));
            break;
        case EInsimulEventType::ReputationChanged:
            AssertPlayerFact(FString::Printf(TEXT("reputation_change(player, %s, %d)"), *Sanitize(Event.FactionId), Event.Delta));
            break;
        case EInsimulEventType::QuestAccepted:
            AssertPlayerFact(FString::Printf(TEXT("quest_active(player, %s)"), *Sanitize(Event.QuestId)));
            if (!Event.AssignedByNpcId.IsEmpty())
            {
                AssertPlayerFact(FString::Printf(TEXT("npc_gave_quest(%s, player, %s)"), *Sanitize(Event.AssignedByNpcId), *Sanitize(Event.QuestId)));
            }
            break;
        case EInsimulEventType::QuestCompleted:
            AssertPlayerFact(FString::Printf(TEXT("quest_completed(player, %s)"), *Sanitize(Event.QuestId)));
            if (!Event.AssignedByNpcId.IsEmpty())
            {
                AssertPlayerFact(FString::Printf(TEXT("quest_outcome(%s, player, completed)"), *Sanitize(Event.QuestId)));
            }
            break;
        case EInsimulEventType::PuzzleSolved:
            AssertPlayerFact(FString::Printf(TEXT("puzzle_solved(player, %s)"), *Sanitize(Event.PuzzleId)));
            break;
        case EInsimulEventType::ItemRemoved:
        case EInsimulEventType::ItemDropped:
        {
            FString Name = Sanitize(Event.ItemName);
            int32 Qty = FMath::Max(1, Event.Quantity);
            UpdateItemQuantityTracked(Name, -Qty);
            int32* Remaining = ItemQuantities.Find(Name);
            if (!Remaining || *Remaining <= 0)
            {
                RetractPlayerFact(FString::Printf(TEXT("has(player, %s)"), *Name));
            }
            break;
        }
        case EInsimulEventType::ItemUsed:
        {
            FString Name = Sanitize(Event.ItemName);
            UpdateItemQuantityTracked(Name, -1);
            int32* Remaining = ItemQuantities.Find(Name);
            if (!Remaining || *Remaining <= 0)
            {
                RetractPlayerFact(FString::Printf(TEXT("has(player, %s)"), *Name));
            }
            break;
        }
        case EInsimulEventType::ItemEquipped:
            AssertPlayerFact(FString::Printf(TEXT("equipped(player, %s, %s)"), *Sanitize(Event.ItemName), *Sanitize(Event.Slot)));
            break;
        case EInsimulEventType::ItemUnequipped:
            RetractPlayerFact(FString::Printf(TEXT("equipped(player, %s, %s)"), *Sanitize(Event.ItemName), *Sanitize(Event.Slot)));
            break;
        case EInsimulEventType::RomanceAction:
        {
            FString Status = Event.bAccepted ? TEXT("accepted") : TEXT("rejected");
            AssertPlayerFact(FString::Printf(TEXT("romance_action(player, %s, %s, %s)"),
                *Sanitize(Event.NPCId), *Sanitize(Event.ActionType), *Status));
            // Emit create_truth event for accepted actions
            if (Event.bAccepted && EventBusRef.IsValid())
            {
                FInsimulGameEvent TruthEvent;
                TruthEvent.EventType = EInsimulEventType::StateCreatedTruth;
                TruthEvent.CharacterId = TEXT("player");
                TruthEvent.Title = FString::Printf(TEXT("Romance: %s with %s"), *Event.ActionType, *Event.NPCName);
                TruthEvent.Content = FString::Printf(TEXT("Player performed %s on %s"), *Event.ActionType, *Event.NPCName);
                TruthEvent.EntryType = TEXT("romance");
                EventBusRef->Emit(TruthEvent);
            }
            break;
        }
        case EInsimulEventType::RomanceStageChanged:
        {
            RetractPlayerFactByPattern(TEXT("romance_stage"), TEXT("player"), Sanitize(Event.NPCId));
            AssertPlayerFact(FString::Printf(TEXT("romance_stage(player, %s, %s)"),
                *Sanitize(Event.NPCId), *Sanitize(Event.ToStage)));
            AssertPlayerFact(FString::Printf(TEXT("romance_history(player, %s, %s, %s)"),
                *Sanitize(Event.NPCId), *Sanitize(Event.FromStage), *Sanitize(Event.ToStage)));
            // Emit create_truth event
            if (EventBusRef.IsValid())
            {
                FInsimulGameEvent TruthEvent;
                TruthEvent.EventType = EInsimulEventType::StateCreatedTruth;
                TruthEvent.CharacterId = TEXT("player");
                TruthEvent.Title = FString::Printf(TEXT("Romance stage: %s -> %s with %s"), *Event.FromStage, *Event.ToStage, *Event.NPCName);
                TruthEvent.Content = FString::Printf(TEXT("Romance stage changed from %s to %s"), *Event.FromStage, *Event.ToStage);
                TruthEvent.EntryType = TEXT("romance");
                EventBusRef->Emit(TruthEvent);
            }
            break;
        }
        case EInsimulEventType::NpcVolitionAction:
            AssertPlayerFact(FString::Printf(TEXT("volition_acted(%s, %s, %s)"),
                *Sanitize(Event.NPCId), *Sanitize(Event.ActionId), *Sanitize(Event.TargetId)));
            break;
        case EInsimulEventType::ConversationOverheard:
            AssertPlayerFact(FString::Printf(TEXT("overheard_conversation(player, %s, %s, %s)"),
                *Sanitize(Event.NpcId1), *Sanitize(Event.NpcId2), *Sanitize(Event.Topic)));
            break;
        case EInsimulEventType::StateCreatedTruth:
            AssertPlayerFact(FString::Printf(TEXT("has_state(%s, %s)"),
                *Sanitize(Event.CharacterId), *Sanitize(Event.StateType)));
            break;
        case EInsimulEventType::StateExpiredTruth:
            RetractPlayerFactByPattern(TEXT("has_state"), Sanitize(Event.CharacterId), Sanitize(Event.StateType));
            break;
        case EInsimulEventType::PuzzleFailed:
            AssertPlayerFact(FString::Printf(TEXT("puzzle_failed(player, %s, %d)"),
                *Sanitize(Event.PuzzleId), Event.Attempts));
            break;
        case EInsimulEventType::QuestFailed:
            AssertPlayerFact(FString::Printf(TEXT("quest_failed(player, %s)"), *Sanitize(Event.QuestId)));
            if (!Event.AssignedByNpcId.IsEmpty())
            {
                AssertPlayerFact(FString::Printf(TEXT("quest_outcome(%s, player, failed)"), *Sanitize(Event.QuestId)));
            }
            break;
        case EInsimulEventType::QuestAbandoned:
            AssertPlayerFact(FString::Printf(TEXT("quest_abandoned(player, %s)"), *Sanitize(Event.QuestId)));
            if (!Event.AssignedByNpcId.IsEmpty())
            {
                AssertPlayerFact(FString::Printf(TEXT("quest_outcome(%s, player, abandoned)"), *Sanitize(Event.QuestId)));
            }
            RetractPlayerFactByPattern(TEXT("quest_active"), TEXT("player"), Sanitize(Event.QuestId));
            break;
        case EInsimulEventType::DirectionStepCompleted:
            RetractPlayerFactByPattern(TEXT("quest_progress"), TEXT("player"), Sanitize(Event.QuestId));
            AssertPlayerFact(FString::Printf(TEXT("quest_progress(player, %s, %d)"), *Sanitize(Event.QuestId), Event.StepsCompleted));
            AssertPlayerFact(FString::Printf(TEXT("direction_step_done(player, %s, %d)"), *Sanitize(Event.QuestId), Event.StepIndex));
            break;
        case EInsimulEventType::ConversationalActionCompleted:
            AssertPlayerFact(FString::Printf(TEXT("conversational_action(player, %s, %s, %s)"),
                *Sanitize(Event.NPCId), *Sanitize(Event.ActionType), *Sanitize(Event.QuestId)));
            break;
        // Language learning events
        case EInsimulEventType::TextFound:
            AssertPlayerFact(FString::Printf(TEXT("text_found(player, %s)"), *Sanitize(Event.TextId)));
            break;
        case EInsimulEventType::TextRead:
            AssertPlayerFact(FString::Printf(TEXT("text_read(player, %s)"), *Sanitize(Event.TextId)));
            break;
        case EInsimulEventType::SignRead:
            AssertPlayerFact(FString::Printf(TEXT("sign_read(player, %s)"), *Sanitize(Event.SignId)));
            break;
        case EInsimulEventType::ObjectExamined:
            AssertPlayerFact(FString::Printf(TEXT("object_examined(player, %s)"), *Sanitize(Event.ObjectName)));
            break;
        case EInsimulEventType::ObjectIdentified:
            AssertPlayerFact(FString::Printf(TEXT("object_identified(player, %s)"), *Sanitize(Event.ObjectName)));
            break;
        case EInsimulEventType::ObjectPointedAndNamed:
            AssertPlayerFact(FString::Printf(TEXT("object_pointed_named(player, %s)"), *Sanitize(Event.ObjectName)));
            break;
        case EInsimulEventType::WritingSubmitted:
            AssertPlayerFact(FString::Printf(TEXT("response_written(player, %d)"), Event.WordCount));
            break;
        case EInsimulEventType::PhotoTaken:
            AssertPlayerFact(FString::Printf(TEXT("photo_taken(player, %s)"), *Sanitize(Event.SubjectName)));
            break;
        case EInsimulEventType::FoodOrdered:
            AssertPlayerFact(FString::Printf(TEXT("food_ordered(player, %s)"), *Sanitize(Event.ItemName)));
            break;
        case EInsimulEventType::PriceHaggled:
            AssertPlayerFact(FString::Printf(TEXT("price_haggled(player, %s)"), *Sanitize(Event.ItemName)));
            break;
        case EInsimulEventType::GiftGiven:
            AssertPlayerFact(FString::Printf(TEXT("gift_given(player, %s, %s)"), *Sanitize(Event.NPCId), *Sanitize(Event.ItemName)));
            break;
        case EInsimulEventType::TranslationAttempt:
            if (Event.bCorrect)
            {
                AssertPlayerFact(TEXT("translation_completed(player, correct)"));
            }
            break;
        case EInsimulEventType::PronunciationAttempt:
        {
            FString Phrase = Sanitize(Event.Phrase);
            int32 Timestamp = FMath::FloorToInt(FDateTime::UtcNow().ToUnixTimestamp());
            AssertPlayerFact(FString::Printf(TEXT("pronunciation_score(player, %s, %d, %d)"), *Phrase, static_cast<int32>(Event.Score), Timestamp));
            if (Event.bPassed)
            {
                AssertPlayerFact(FString::Printf(TEXT("pronunciation_passed(player, %s)"), *Phrase));
            }
            break;
        }
        case EInsimulEventType::ReadingCompleted:
            AssertPlayerFact(FString::Printf(TEXT("text_read(player, %s)"), *Sanitize(Event.TextId)));
            break;
        case EInsimulEventType::QuestionsAnswered:
            AssertPlayerFact(FString::Printf(TEXT("comprehension_done(player, %s)"), *Sanitize(Event.TextId)));
            break;
        case EInsimulEventType::ConversationTurn:
        case EInsimulEventType::ConversationTurnCounted:
        {
            FString NId = Sanitize(Event.NPCId);
            RetractPlayerFactByPattern(TEXT("npc_conversation_turns"), TEXT("player"), NId);
            AssertPlayerFact(FString::Printf(TEXT("npc_conversation_turns(player, %s, %d)"), *NId, Event.TotalTurns));
            break;
        }
        case EInsimulEventType::PhysicalActionCompleted:
            AssertPlayerFact(FString::Printf(TEXT("physical_action_done(player, %s)"), *Sanitize(Event.ActionType)));
            break;
        case EInsimulEventType::NpcExamCompleted:
        {
            FString ExamId = Sanitize(Event.ExamId);
            int32 Timestamp = FMath::FloorToInt(FDateTime::UtcNow().ToUnixTimestamp());
            AssertPlayerFact(FString::Printf(TEXT("assessment_result(player, %s, %d, %d, %s, %d)"),
                *ExamId, Event.TotalScoreInt, Event.TotalMaxPointsInt, *Sanitize(Event.CefrLevel), Timestamp));
            AssertPlayerFact(FString::Printf(TEXT("player_cefr_level(player, %s)"), *Sanitize(Event.CefrLevel)));
            break;
        }
        default:
            return; // No re-evaluation needed
    }

    // Re-evaluate active quests after fact assertion
    ReevaluateQuests();
}

void UPrologEngine::ReevaluateQuests()
{
    for (const FString& QuestId : ActiveQuestIds)
    {
        if (CompletedQuests.Contains(QuestId)) continue;

        // Check individual objective completion
        CheckObjectiveCompletion(QuestId);

        // Check whole-quest completion
        if (IsQuestComplete(QuestId, TEXT("player")) && !CompletedQuests.Contains(QuestId))
        {
            CompletedQuests.Add(QuestId);
            FInsimulGameEvent CompletedEvent;
            CompletedEvent.EventType = EInsimulEventType::QuestCompleted;
            CompletedEvent.QuestId = QuestId;
            OnQuestCompleted.Broadcast(CompletedEvent);
        }
    }
}

void UPrologEngine::AssertItemTaxonomy(const FString& ItemName, const FString& Category, const FString& Material, const FString& BaseType, const FString& Rarity, const FString& ItemType)
{
    if (!Category.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("item_category(%s, %s)"), *ItemName, *Sanitize(Category)));
        AssertFact(FString::Printf(TEXT("item_is_a(%s, %s)"), *ItemName, *Sanitize(Category)));
    }
    if (!Material.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("item_material(%s, %s)"), *ItemName, *Sanitize(Material)));
    }
    if (!BaseType.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("item_base_type(%s, %s)"), *ItemName, *Sanitize(BaseType)));
        AssertFact(FString::Printf(TEXT("item_is_a(%s, %s)"), *ItemName, *Sanitize(BaseType)));
    }
    if (!Rarity.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("item_rarity(%s, %s)"), *ItemName, *Sanitize(Rarity)));
    }
    if (!ItemType.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("item_is_a(%s, %s)"), *ItemName, *Sanitize(ItemType)));
    }
}

void UPrologEngine::UpdateItemQuantity(const FString& ItemName, int32 Delta)
{
    int32& CurrentQty = ItemQuantities.FindOrAdd(ItemName);
    CurrentQty = FMath::Max(0, CurrentQty + Delta);

    // Retract old quantity fact
    RetractPattern(TEXT("has_item"), TEXT("player"), ItemName);

    // Assert new quantity if > 0
    if (CurrentQty > 0)
    {
        AssertFact(FString::Printf(TEXT("has_item(player, %s, %d)"), *ItemName, CurrentQty));
    }
}

// ── Player Fact Persistence ────────────────────────────────────────────────

void UPrologEngine::AssertPlayerFact(const FString& Fact)
{
    AssertFact(Fact);

    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));
    PlayerFacts.Add(CleanFact + TEXT("."));
}

void UPrologEngine::RetractPlayerFact(const FString& Fact)
{
    RetractFact(Fact);

    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));
    PlayerFacts.Remove(CleanFact + TEXT("."));
}

void UPrologEngine::RetractPlayerFactByPattern(const FString& Predicate, const FString& FirstArg, const FString& SecondArg)
{
    // Retract from the main KB
    RetractPattern(Predicate, FirstArg, SecondArg);

    // Build the same prefix used by RetractPattern to clean up PlayerFacts
    FString Prefix;
    if (SecondArg.IsEmpty())
    {
        Prefix = FString::Printf(TEXT("%s(%s"), *Predicate, *FirstArg);
    }
    else
    {
        Prefix = FString::Printf(TEXT("%s(%s, %s"), *Predicate, *FirstArg, *SecondArg);
    }

    TArray<FString> ToRemove;
    for (const FString& PF : PlayerFacts)
    {
        // PlayerFacts entries are stored with trailing dot, strip it for prefix match
        FString WithoutDot = PF;
        WithoutDot.RemoveFromEnd(TEXT("."));
        if (WithoutDot.StartsWith(Prefix))
        {
            ToRemove.Add(PF);
        }
    }
    for (const FString& Key : ToRemove)
    {
        PlayerFacts.Remove(Key);
    }
}

void UPrologEngine::UpdateItemQuantityTracked(const FString& ItemName, int32 Delta)
{
    int32& CurrentQty = ItemQuantities.FindOrAdd(ItemName);
    CurrentQty = FMath::Max(0, CurrentQty + Delta);

    // Retract old quantity fact (with player fact tracking)
    RetractPlayerFactByPattern(TEXT("has_item"), TEXT("player"), ItemName);

    // Assert new quantity if > 0
    if (CurrentQty > 0)
    {
        AssertPlayerFact(FString::Printf(TEXT("has_item(player, %s, %d)"), *ItemName, CurrentQty));
    }
}

void UPrologEngine::AssertItemTaxonomyTracked(const FString& ItemName, const FString& Category, const FString& Material, const FString& BaseType, const FString& Rarity, const FString& ItemType)
{
    if (!Category.IsEmpty())
    {
        AssertPlayerFact(FString::Printf(TEXT("item_category(%s, %s)"), *ItemName, *Sanitize(Category)));
        AssertPlayerFact(FString::Printf(TEXT("item_is_a(%s, %s)"), *ItemName, *Sanitize(Category)));
    }
    if (!Material.IsEmpty())
    {
        AssertPlayerFact(FString::Printf(TEXT("item_material(%s, %s)"), *ItemName, *Sanitize(Material)));
    }
    if (!BaseType.IsEmpty())
    {
        AssertPlayerFact(FString::Printf(TEXT("item_base_type(%s, %s)"), *ItemName, *Sanitize(BaseType)));
        AssertPlayerFact(FString::Printf(TEXT("item_is_a(%s, %s)"), *ItemName, *Sanitize(BaseType)));
    }
    if (!Rarity.IsEmpty())
    {
        AssertPlayerFact(FString::Printf(TEXT("item_rarity(%s, %s)"), *ItemName, *Sanitize(Rarity)));
    }
    if (!ItemType.IsEmpty())
    {
        AssertPlayerFact(FString::Printf(TEXT("item_is_a(%s, %s)"), *ItemName, *Sanitize(ItemType)));
    }
}

TArray<FString> UPrologEngine::GetPlayerFacts() const
{
    return PlayerFacts.Array();
}

void UPrologEngine::RestorePlayerFacts(const TArray<FString>& InFacts)
{
    if (!bInitialized) return;

    for (const FString& FactWithDot : InFacts)
    {
        FString Fact = FactWithDot;
        if (Fact.EndsWith(TEXT("."))) Fact = Fact.LeftChop(1);
        Fact = Fact.TrimStartAndEnd();
        if (Fact.IsEmpty()) continue;

        AssertFact(Fact);
        PlayerFacts.Add(Fact + TEXT("."));

        // Rebuild ItemQuantities from has_item/3 facts
        if (Fact.StartsWith(TEXT("has_item(player,")))
        {
            // Parse has_item(player, ItemName, Qty)
            int32 FirstComma = INDEX_NONE;
            int32 SecondComma = INDEX_NONE;
            int32 CloseParen = INDEX_NONE;
            Fact.FindChar(TEXT(','), FirstComma);
            if (FirstComma != INDEX_NONE)
            {
                SecondComma = Fact.Find(TEXT(","), ESearchCase::CaseSensitive, ESearchDir::FromStart, FirstComma + 1);
            }
            Fact.FindLastChar(TEXT(')'), CloseParen);

            if (FirstComma != INDEX_NONE && SecondComma != INDEX_NONE && CloseParen != INDEX_NONE)
            {
                FString ItemName = Fact.Mid(FirstComma + 1, SecondComma - FirstComma - 1).TrimStartAndEnd();
                FString QtyStr = Fact.Mid(SecondComma + 1, CloseParen - SecondComma - 1).TrimStartAndEnd();
                int32 Qty = FCString::Atoi(*QtyStr);
                if (!ItemName.IsEmpty() && Qty > 0)
                {
                    ItemQuantities.FindOrAdd(ItemName) = Qty;
                }
            }
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine restored %d player facts from save"), InFacts.Num());
}

void UPrologEngine::RestoreFromSaveState(const FString& SaveStateJson)
{
    if (!bInitialized) return;

    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(SaveStateJson);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] PrologEngine::RestoreFromSaveState — failed to parse JSON"));
        return;
    }

    int32 RestoredCount = 0;

    // Restore inventory from structured data
    const TArray<TSharedPtr<FJsonValue>>* InventoryArr;
    if (Root->TryGetArrayField(TEXT("inventory"), InventoryArr))
    {
        for (const TSharedPtr<FJsonValue>& ItemVal : *InventoryArr)
        {
            const TSharedPtr<FJsonObject>* ItemObj;
            if (!ItemVal->TryGetObject(ItemObj)) continue;

            FString Name;
            int32 Qty = 1;
            (*ItemObj)->TryGetStringField(TEXT("name"), Name);
            (*ItemObj)->TryGetNumberField(TEXT("quantity"), Qty);

            if (Name.IsEmpty()) continue;
            FString SName = Sanitize(Name);

            AssertPlayerFact(FString::Printf(TEXT("has(player, %s)"), *SName));
            AssertPlayerFact(FString::Printf(TEXT("has_item(player, %s, %d)"), *SName, Qty));
            ItemQuantities.FindOrAdd(SName) = Qty;
            RestoredCount += 2;
        }
    }

    // Restore active quests
    const TArray<TSharedPtr<FJsonValue>>* QuestsArr;
    if (Root->TryGetArrayField(TEXT("activeQuests"), QuestsArr))
    {
        for (const TSharedPtr<FJsonValue>& QVal : *QuestsArr)
        {
            FString QId = QVal->AsString();
            if (!QId.IsEmpty())
            {
                AssertPlayerFact(FString::Printf(TEXT("quest_active(player, %s)"), *Sanitize(QId)));
                RestoredCount++;
            }
        }
    }

    // Restore completed quests
    const TArray<TSharedPtr<FJsonValue>>* CompletedArr;
    if (Root->TryGetArrayField(TEXT("completedQuests"), CompletedArr))
    {
        for (const TSharedPtr<FJsonValue>& QVal : *CompletedArr)
        {
            FString QId = QVal->AsString();
            if (!QId.IsEmpty())
            {
                AssertPlayerFact(FString::Printf(TEXT("quest_completed(player, %s)"), *Sanitize(QId)));
                RestoredCount++;
            }
        }
    }

    // Restore raw Prolog facts if present
    const TArray<TSharedPtr<FJsonValue>>* PrologFactsArr;
    if (Root->TryGetArrayField(TEXT("prologFacts"), PrologFactsArr))
    {
        TArray<FString> FactStrings;
        for (const TSharedPtr<FJsonValue>& FVal : *PrologFactsArr)
        {
            FString F = FVal->AsString();
            if (!F.IsEmpty())
            {
                FactStrings.Add(F);
            }
        }
        RestorePlayerFacts(FactStrings);
        RestoredCount += FactStrings.Num();
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine::RestoreFromSaveState restored %d facts from structured save data"), RestoredCount);
}

// ── Volition & Romance Queries ──────────────────────────────────────────────

TArray<FString> UPrologEngine::EvaluateVolitionRules(const FString& NPCId)
{
    if (!bInitialized) return {};

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::EvaluateVolitionRules(%s) — stub query"), *NPCId);

    // Look for volition_score(NPCId, Action, Target, Score) facts
    FString Prefix = FString::Printf(TEXT("volition_score(%s,"), *Sanitize(NPCId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    // Return matching facts as strings (sorted by score descending would require parsing)
    return MatchingFacts;
}

FString UPrologEngine::GetRomanceStage(const FString& NPCId)
{
    if (!bInitialized) return FString();

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::GetRomanceStage(%s) — stub query"), *NPCId);

    // Look for romance_stage(player, NPCId, Stage) fact
    FString Prefix = FString::Printf(TEXT("romance_stage(player, %s,"), *Sanitize(NPCId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    if (MatchingFacts.Num() > 0)
    {
        // Extract third argument (stage)
        int32 LastCommaIdx = INDEX_NONE;
        int32 CloseParenIdx = INDEX_NONE;
        MatchingFacts[0].FindLastChar(TEXT(','), LastCommaIdx);
        MatchingFacts[0].FindLastChar(TEXT(')'), CloseParenIdx);
        if (LastCommaIdx != INDEX_NONE && CloseParenIdx != INDEX_NONE && CloseParenIdx > LastCommaIdx + 1)
        {
            return MatchingFacts[0].Mid(LastCommaIdx + 1, CloseParenIdx - LastCommaIdx - 1).TrimStartAndEnd();
        }
    }

    return FString();
}

bool UPrologEngine::CanPerformRomanceAction(const FString& NPCId, const FString& ActionType)
{
    if (!bInitialized) return true;

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] PrologEngine::CanPerformRomanceAction(%s, %s) — stub query"),
        *NPCId, *ActionType);

    // Check for can_romance_action(player, NPCId, ActionType) fact
    FString Pattern = FString::Printf(TEXT("can_romance_action(player, %s, %s)"),
        *Sanitize(NPCId), *Sanitize(ActionType));

    // If no romance rules loaded, allow by default (graceful degradation)
    bool bHasRomanceRules = FindFacts(TEXT("can_romance_action(")).Num() > 0;
    if (!bHasRomanceRules) return true;

    return HasFact(Pattern);
}

void UPrologEngine::CheckObjectiveCompletion(const FString& QuestId)
{
    FString SanitizedId = Sanitize(QuestId);

    // Find quest_objective facts for this quest
    FString Prefix = FString::Printf(TEXT("quest_objective(%s,"), *SanitizedId);
    TArray<FString> ObjectiveFacts = FindFacts(Prefix);

    for (const FString& Fact : ObjectiveFacts)
    {
        // Extract objective index (second argument)
        int32 FirstComma = INDEX_NONE;
        int32 SecondComma = INDEX_NONE;
        Fact.FindChar(TEXT(','), FirstComma);
        if (FirstComma != INDEX_NONE)
        {
            int32 SearchStart = FirstComma + 1;
            SecondComma = Fact.Find(TEXT(","), ESearchCase::CaseSensitive, ESearchDir::FromStart, SearchStart);
            if (SecondComma == INDEX_NONE)
            {
                Fact.FindLastChar(TEXT(')'), SecondComma);
            }
        }

        if (FirstComma == INDEX_NONE || SecondComma == INDEX_NONE) continue;

        FString IdxStr = Fact.Mid(FirstComma + 1, SecondComma - FirstComma - 1).TrimStartAndEnd();
        int32 Idx = FCString::Atoi(*IdxStr);

        FString Key = FString::Printf(TEXT("%s:%d"), *QuestId, Idx);
        if (CompletedObjectives.Contains(Key)) continue;

        // Check if this objective is complete
        FString CompletePattern = FString::Printf(TEXT("objective_complete(player, %s, %d)"), *SanitizedId, Idx);
        if (HasFact(CompletePattern))
        {
            CompletedObjectives.Add(Key);
            OnObjectiveCompleted.Broadcast(QuestId, Idx);
        }
    }
}

void UPrologEngine::Reconcile(TArray<FString>& OutCompletedQuests, TArray<FString>& OutCompletedObjectiveKeys)
{
    OutCompletedQuests.Empty();
    OutCompletedObjectiveKeys.Empty();

    if (!bInitialized) return;

    for (const FString& QuestId : ActiveQuestIds)
    {
        FString SanitizedId = Sanitize(QuestId);

        // Check objectives
        FString Prefix = FString::Printf(TEXT("quest_objective(%s,"), *SanitizedId);
        TArray<FString> ObjectiveFacts = FindFacts(Prefix);
        for (const FString& Fact : ObjectiveFacts)
        {
            int32 FirstComma = INDEX_NONE;
            int32 SecondComma = INDEX_NONE;
            Fact.FindChar(TEXT(','), FirstComma);
            if (FirstComma != INDEX_NONE)
            {
                int32 SearchStart = FirstComma + 1;
                SecondComma = Fact.Find(TEXT(","), ESearchCase::CaseSensitive, ESearchDir::FromStart, SearchStart);
                if (SecondComma == INDEX_NONE) Fact.FindLastChar(TEXT(')'), SecondComma);
            }
            if (FirstComma == INDEX_NONE || SecondComma == INDEX_NONE) continue;

            FString IdxStr = Fact.Mid(FirstComma + 1, SecondComma - FirstComma - 1).TrimStartAndEnd();
            int32 Idx = FCString::Atoi(*IdxStr);

            FString CompletePattern = FString::Printf(TEXT("objective_complete(player, %s, %d)"), *SanitizedId, Idx);
            if (HasFact(CompletePattern))
            {
                OutCompletedObjectiveKeys.Add(FString::Printf(TEXT("%s:%d"), *QuestId, Idx));
            }
        }

        // Check quest-level
        if (IsQuestComplete(QuestId, TEXT("player")))
        {
            OutCompletedQuests.Add(QuestId);
        }
    }
}

TArray<FString> UPrologEngine::GetBonusRewards(const FString& QuestId)
{
    if (!bInitialized) return {};

    FString Prefix = FString::Printf(TEXT("quest_bonus_reward(player, %s,"), *Sanitize(QuestId));
    TArray<FString> MatchingFacts = FindFacts(Prefix);

    TArray<FString> Results;
    for (const FString& Fact : MatchingFacts)
    {
        // Return raw facts — Blueprint parsing can extract Type and Value
        Results.Add(Fact);
    }
    return Results;
}

// ── Private Helpers ─────────────────────────────────────────────────────────

void UPrologEngine::ParseKnowledgeBase()
{
    Facts.Empty();
    Rules.Empty();

    if (KnowledgeBase.IsEmpty())
    {
        FactCount = 0;
        RuleCount = 0;
        return;
    }

    // Split KB into lines and classify each as fact or rule
    TArray<FString> Lines;
    KnowledgeBase.ParseIntoArrayLines(Lines);

    for (const FString& RawLine : Lines)
    {
        FString Line = RawLine.TrimStartAndEnd();

        // Skip empty lines and comments
        if (Line.IsEmpty()) continue;
        if (Line.StartsWith(TEXT("%"))) continue;
        if (Line.StartsWith(TEXT("/*"))) continue;

        // Remove trailing period for storage
        FString CleanLine = Line;
        CleanLine.RemoveFromEnd(TEXT("."));
        CleanLine = CleanLine.TrimEnd();

        if (CleanLine.IsEmpty()) continue;

        if (Line.Contains(TEXT(":-")))
        {
            // This is a rule/clause
            Rules.AddUnique(CleanLine);
        }
        else
        {
            // This is a fact
            Facts.AddUnique(CleanLine);
        }
    }

    FactCount = Facts.Num();
    RuleCount = Rules.Num();
}

bool UPrologEngine::HasFact(const FString& Pattern) const
{
    FString CleanPattern = Pattern.TrimStartAndEnd();
    CleanPattern.RemoveFromEnd(TEXT("."));

    for (const FString& Fact : Facts)
    {
        if (Fact == CleanPattern) return true;
    }
    return false;
}

TArray<FString> UPrologEngine::FindFacts(const FString& Prefix) const
{
    TArray<FString> Results;
    for (const FString& Fact : Facts)
    {
        if (Fact.StartsWith(Prefix))
        {
            Results.Add(Fact);
        }
    }
    return Results;
}

void UPrologEngine::RetractPattern(const FString& Predicate, const FString& FirstArg, const FString& SecondArg)
{
    FString Prefix;
    if (SecondArg.IsEmpty())
    {
        Prefix = FString::Printf(TEXT("%s(%s"), *Predicate, *FirstArg);
    }
    else
    {
        Prefix = FString::Printf(TEXT("%s(%s, %s"), *Predicate, *FirstArg, *SecondArg);
    }

    Facts.RemoveAll([&Prefix](const FString& F) {
        return F.StartsWith(Prefix);
    });

    FactCount = Facts.Num();
}

void UPrologEngine::RetractByPredicate(const FString& Predicate)
{
    FString Prefix = FString::Printf(TEXT("%s("), *Predicate);
    Facts.RemoveAll([&Prefix, &Predicate](const FString& F) {
        return F.StartsWith(Prefix) || F == Predicate;
    });
    FactCount = Facts.Num();
}

FString UPrologEngine::Sanitize(const FString& Str)
{
    FString Result = Str.ToLower();

    // Replace non-alphanumeric/underscore characters with underscore
    FString Sanitized;
    Sanitized.Reserve(Result.Len());
    for (int32 i = 0; i < Result.Len(); ++i)
    {
        TCHAR Ch = Result[i];
        if (FChar::IsAlpha(Ch) || FChar::IsDigit(Ch) || Ch == TEXT('_'))
        {
            Sanitized.AppendChar(Ch);
        }
        else
        {
            Sanitized.AppendChar(TEXT('_'));
        }
    }

    // Prefix leading digits with underscore
    if (Sanitized.Len() > 0 && FChar::IsDigit(Sanitized[0]))
    {
        Sanitized = TEXT("_") + Sanitized;
    }

    // Collapse multiple underscores
    while (Sanitized.Contains(TEXT("__")))
    {
        Sanitized = Sanitized.Replace(TEXT("__"), TEXT("_"));
    }

    // Remove trailing underscore
    Sanitized.RemoveFromEnd(TEXT("_"));

    return Sanitized;
}

FString UPrologEngine::EscapeProlog(const FString& Str)
{
    FString Result = Str;
    Result = Result.Replace(TEXT("\\"), TEXT("\\\\"));
    Result = Result.Replace(TEXT("'"), TEXT("\\'"));
    return Result;
}
