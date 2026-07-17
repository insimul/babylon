#include "PrologEngine.h"
#include "EventBus.h"
#include "InsimulPrologSubsystem.h"
#include "Engine/GameInstance.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// ─────────────────────────────────────────────────────────────────────────────
// US-XP4: UPrologEngine is now a THIN ADAPTER over the real logic engine
// (UInsimulPrologSubsystem, InsimulRuntime plugin, backed by libinsimul). The
// retired substring stub is gone — every KB read/write here delegates to the
// subsystem, so queries use real SLD unification and rule derivation instead of
// string matching. The game-facing method surface is unchanged; only semantics
// change. See templates/MIGRATION.md.
// ─────────────────────────────────────────────────────────────────────────────

void UPrologEngine::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine adapter initialized (delegates to UInsimulPrologSubsystem)"));
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

    CachedEngine = nullptr;
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

// ── Real-engine delegation helpers ───────────────────────────────────────────

UInsimulPrologSubsystem* UPrologEngine::ResolveEngine()
{
    if (CachedEngine.IsValid())
    {
        return CachedEngine.Get();
    }
    if (UGameInstance* GI = GetGameInstance())
    {
        UInsimulPrologSubsystem* Engine = GI->GetSubsystem<UInsimulPrologSubsystem>();
        CachedEngine = Engine;
        return Engine;
    }
    return nullptr;
}

bool UPrologEngine::QueryHas(const FString& Goal)
{
    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return false;

    FString CleanGoal = Goal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));
    FInsimulPrologBinding Binding;
    return Engine->QueryFirst(CleanGoal, Binding);
}

TArray<FString> UPrologEngine::QueryColumn(const FString& Goal, const FString& VarName)
{
    TArray<FString> Results;
    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return Results;

    FString CleanGoal = Goal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));
    TArray<FInsimulPrologBinding> Solutions;
    if (!Engine->QueryAll(CleanGoal, Solutions)) return Results;

    for (const FInsimulPrologBinding& Solution : Solutions)
    {
        FInsimulPrologValue Value;
        if (UInsimulPrologSubsystem::GetBoundValue(Solution, VarName, Value))
        {
            Results.AddUnique(Value.DisplayString);
        }
    }
    return Results;
}

void UPrologEngine::RetractAllMatching(const FString& Goal)
{
    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return;

    FString CleanGoal = Goal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));

    // The subsystem retracts one unifying clause per call; loop until it stops
    // removing. Cap the iterations so a pathological KB can never spin forever.
    for (int32 Guard = 0; Guard < 4096; ++Guard)
    {
        if (!Engine->RetractFact(CleanGoal))
        {
            break;
        }
    }
}

void UPrologEngine::PurgeTrackedByPrefix(const FString& GroundPrefix)
{
    TArray<FString> ToRemove;
    for (const FString& PF : PlayerFacts)
    {
        FString WithoutDot = PF;
        WithoutDot.RemoveFromEnd(TEXT("."));
        if (WithoutDot.StartsWith(GroundPrefix))
        {
            ToRemove.Add(PF);
        }
    }
    for (const FString& Key : ToRemove)
    {
        PlayerFacts.Remove(Key);
    }
    FactCount = PlayerFacts.Num();
}

// ── Data / KB loading ────────────────────────────────────────────────────────

void UPrologEngine::LoadFromIR(const FString& JsonString)
{
    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine)
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul] PrologEngine::LoadFromIR — UInsimulPrologSubsystem unavailable; KB not loaded"));
        return;
    }

    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    // Accumulate all clause/rule text (prologContent + rules/actions/quests) and
    // consult it in one pass — real Prolog source, not a substring buffer.
    FString ConsultBuffer;

    const TSharedPtr<FJsonObject>* SystemsObj = nullptr;
    if (Root->TryGetObjectField(TEXT("systems"), SystemsObj))
    {
        FString PrologContent;
        if ((*SystemsObj)->TryGetStringField(TEXT("prologContent"), PrologContent) && !PrologContent.IsEmpty())
        {
            ConsultBuffer += PrologContent;
            ConsultBuffer += TEXT("\n");
        }
    }

    if (SystemsObj)
    {
        auto AppendContentArray = [&ConsultBuffer](const TSharedPtr<FJsonObject>& Obj, const FString& FieldName)
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
                        ConsultBuffer += Content;
                        ConsultBuffer += TEXT("\n");
                    }
                }
            }
        };

        AppendContentArray(*SystemsObj, TEXT("rules"));
        AppendContentArray(*SystemsObj, TEXT("baseRules"));
        AppendContentArray(*SystemsObj, TEXT("actions"));
        AppendContentArray(*SystemsObj, TEXT("quests"));

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

    if (!ConsultBuffer.IsEmpty())
    {
        if (!Engine->ConsultWorldData(ConsultBuffer))
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] PrologEngine::LoadFromIR — ConsultWorldData reported: %s"), *Engine->GetLastError());
        }
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

    bInitialized = true;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine loaded via real engine (%d active quests tracked)"), ActiveQuestIds.Num());
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

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine initialized %d world item definitions"), Items.Num());
}

void UPrologEngine::LoadItemReasoningRules()
{
    if (!bInitialized) return;

    // IS-A reasoning rules — mirrors GamePrologEngine.loadItemReasoningRules().
    // Consulted as real Prolog rules (previously appended to a text buffer and
    // re-parsed by the stub).
    const FString ItemRules = TEXT(
        "item_is_a(Item, Category) :- item_category(Item, Category).\n"
        "item_is_a(Item, BaseType) :- item_base_type(Item, BaseType).\n"
        "item_is_a(Item, Type) :- item_type(Item, Type).\n"
        "has_item_of_type(Player, Type) :- has(Player, Item), item_is_a(Item, Type).\n"
        "has_at_least(Player, Item, N) :- has_item(Player, Item, Qty), Qty >= N.\n"
    );

    if (UInsimulPrologSubsystem* Engine = ResolveEngine())
    {
        if (!Engine->ConsultWorldData(ItemRules))
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] PrologEngine::LoadItemReasoningRules — %s"), *Engine->GetLastError());
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine loaded item IS-A reasoning rules"));
}

void UPrologEngine::LoadHelperPredicates()
{
    if (!bInitialized) return;

    // Gameplay helper predicates — mirrors HELPER_PREDICATES_PROLOG from
    // shared/prolog/helper-predicates.ts (CEFR comparison, weapon/tool type
    // classification, skill tier names, skill level comparison).
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

    if (UInsimulPrologSubsystem* Engine = ResolveEngine())
    {
        if (!Engine->ConsultWorldData(HelperRules))
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] PrologEngine::LoadHelperPredicates — %s"), *Engine->GetLastError());
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] PrologEngine loaded gameplay helper predicates"));
}

void UPrologEngine::UpdateGameState(const FInsimulGameState& State)
{
    if (!bInitialized) return;

    FString PlayerId = Sanitize(State.PlayerCharacterId);

    // Retract old dynamic state (arity-aware; nearby_npc has many values).
    RetractAllMatching(FString::Printf(TEXT("energy(%s, _)"), *PlayerId));
    RetractAllMatching(FString::Printf(TEXT("at_location(%s, _)"), *PlayerId));
    RetractAllMatching(FString::Printf(TEXT("nearby_npc(%s, _)"), *PlayerId));

    AssertFact(FString::Printf(TEXT("energy(%s, %d)"), *PlayerId, FMath::RoundToInt(State.PlayerEnergy)));

    if (!State.CurrentSettlement.IsEmpty())
    {
        AssertFact(FString::Printf(TEXT("at_location(%s, %s)"), *PlayerId, *Sanitize(State.CurrentSettlement)));
    }

    for (const FString& NPCId : State.NearbyNPCs)
    {
        AssertFact(FString::Printf(TEXT("nearby_npc(%s, %s)"), *PlayerId, *Sanitize(NPCId)));
    }

    if (State.GameHour >= 0 || !State.Weather.IsEmpty())
    {
        UpdateEnvironment(State.GameHour, State.Weather, State.Season, State.QuestsCompleted, State.Reputation, State.bIsNewToTown);
    }

    CurrentGameState = State;
}

void UPrologEngine::UpdateEnvironment(int32 GameHour, const FString& Weather, const FString& Season, int32 QuestsCompleted, float Reputation, bool bIsNewToTown)
{
    if (!bInitialized) return;

    // Clear all clauses of each environment predicate (arity known per predicate).
    RetractAllMatching(TEXT("game_hour(_)"));
    RetractAllMatching(TEXT("time_period(_)"));
    RetractAllMatching(TEXT("time_of_day(_)"));
    RetractAllMatching(TEXT("weather(_)"));
    RetractAllMatching(TEXT("season(_)"));
    RetractAllMatching(TEXT("player_quests_completed(_)"));
    RetractAllMatching(TEXT("player_reputation(_)"));
    RetractAllMatching(TEXT("player_is_new"));

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
    return QueryHas(FString::Printf(TEXT("weather_complaint_likely(%s)"), *Sanitize(NPCId)));
}

FString UPrologEngine::GetPlayerAttitude(const FString& NPCId)
{
    if (!bInitialized) return TEXT("neutral");
    FString Id = Sanitize(NPCId);
    if (QueryHas(FString::Printf(TEXT("impressed_by_player(%s)"), *Id))) return TEXT("impressed");
    if (QueryHas(FString::Printf(TEXT("respects_player(%s)"), *Id))) return TEXT("respectful");
    if (QueryHas(FString::Printf(TEXT("wary_of_newcomer(%s)"), *Id))) return TEXT("wary");
    if (QueryHas(FString::Printf(TEXT("welcoming_to_newcomer(%s)"), *Id))) return TEXT("welcoming");
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

    // Explicit blocks first.
    FString BlockQuery = FString::Printf(TEXT("cannot_perform(%s, %s)"), *ActorAtom, *ActionAtom);
    if (QueryHas(BlockQuery))
    {
        Result.bAllowed = false;
        Result.Reason = FString::Printf(TEXT("Prerequisites not met for action: %s"), *ActionId);
        return Result;
    }

    // If the KB defines can_perform rules/facts (arity 2 or 3), require a match;
    // otherwise allow by default (graceful degradation, as in the TS source).
    bool bHasCanPerformRules = QueryHas(TEXT("can_perform(_A, _B)")) || QueryHas(TEXT("can_perform(_A, _B, _C)"));
    if (bHasCanPerformRules)
    {
        FString Query2 = FString::Printf(TEXT("can_perform(%s, %s)"), *ActorAtom, *ActionAtom);
        FString Query3 = TargetId.IsEmpty() ? TEXT("")
            : FString::Printf(TEXT("can_perform(%s, %s, %s)"), *ActorAtom, *ActionAtom, *Sanitize(TargetId));

        bool bFound = QueryHas(Query2) || (!Query3.IsEmpty() && QueryHas(Query3));
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

    FString Pattern = FString::Printf(TEXT("quest_available(%s, %s)"), *Sanitize(PlayerId), *Sanitize(QuestId));
    if (QueryHas(Pattern)) return true;

    // If no quest_available rules exist, default to available.
    bool bHasQuestAvailableRules = QueryHas(TEXT("quest_available(_A, _B)"));
    return !bHasQuestAvailableRules;
}

bool UPrologEngine::IsQuestComplete(const FString& QuestId, const FString& PlayerId)
{
    if (!bInitialized) return false;

    FString Pattern = FString::Printf(TEXT("quest_complete(%s, %s)"), *Sanitize(PlayerId), *Sanitize(QuestId));
    return QueryHas(Pattern);
}

bool UPrologEngine::IsStageComplete(const FString& QuestId, const FString& StageId, const FString& PlayerId)
{
    if (!bInitialized) return false;

    FString Pattern = FString::Printf(TEXT("stage_complete(%s, %s, %s)"),
        *Sanitize(PlayerId), *Sanitize(QuestId), *Sanitize(StageId));
    return QueryHas(Pattern);
}

TArray<FString> UPrologEngine::GetApplicableRules(const FString& ActorId)
{
    if (!bInitialized) return {};

    // rule_applies(RuleName, ActorId, _) — collect the rule names bound to R.
    FString Goal = FString::Printf(TEXT("rule_applies(R, %s, _)"), *Sanitize(ActorId));
    return QueryColumn(Goal, TEXT("R"));
}

bool UPrologEngine::EvaluateCondition(const FString& PrologGoal)
{
    if (!bInitialized) return true;

    // Real goal evaluation (unification + rule derivation), not a fact lookup.
    FString CleanGoal = PrologGoal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));
    return QueryHas(CleanGoal);
}

// ── Fact Management ─────────────────────────────────────────────────────────

void UPrologEngine::AssertFact(const FString& Fact, const FString& Source)
{
    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return;

    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));
    if (CleanFact.IsEmpty()) return;

    // Skip clauses already provable so repeated asserts stay idempotent (mirrors
    // the retired stub's de-dup; avoids duplicate clauses the single-clause
    // retract could not fully clear).
    if (!QueryHas(CleanFact))
    {
        Engine->AssertFact(CleanFact);
    }

    if (bDebugLoggingEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[PrologDebug] assert: %s %s"), *CleanFact,
            Source.IsEmpty() ? TEXT("") : *FString::Printf(TEXT("(source: %s)"), *Source));
    }
}

void UPrologEngine::RetractFact(const FString& Fact, const FString& Reason)
{
    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return;

    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));

    Engine->RetractFact(CleanFact);

    if (bDebugLoggingEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[PrologDebug] retract: %s %s"), *CleanFact,
            Reason.IsEmpty() ? TEXT("") : *FString::Printf(TEXT("(reason: %s)"), *Reason));
    }
}

TArray<FString> UPrologEngine::Query(const FString& Goal)
{
    TArray<FString> Results;

    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return Results;

    FString CleanGoal = Goal.TrimStartAndEnd();
    CleanGoal.RemoveFromEnd(TEXT("."));

    TArray<FInsimulPrologBinding> Solutions;
    if (!Engine->QueryAll(CleanGoal, Solutions)) return Results;

    for (const FInsimulPrologBinding& Solution : Solutions)
    {
        if (Solution.Vars.Num() == 0)
        {
            // Ground success — surface the goal itself.
            Results.Add(CleanGoal);
            continue;
        }
        TArray<FString> Parts;
        for (const FInsimulPrologVar& Var : Solution.Vars)
        {
            Parts.Add(FString::Printf(TEXT("%s=%s"), *Var.Name, *Var.Value.DisplayString));
        }
        Results.Add(FString::Join(Parts, TEXT(", ")));
    }

    if (bDebugLoggingEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[PrologDebug] query: %s -> %d solution(s)"), *CleanGoal, Results.Num());
    }

    return Results;
}

FString UPrologEngine::ExportKnowledgeBase() const
{
    // Deprecated: returns the tracked gameplay-fact log (not the whole world KB).
    // Prefer GetPlayerFacts() or SnapshotToString().
    TArray<FString> FactArray = PlayerFacts.Array();
    return FString::Join(FactArray, TEXT("\n"));
}

// ── NPC Intelligence Queries ────────────────────────────────────────────────

TArray<FString> UPrologEngine::WhoShouldTalkTo(const FString& NPCId)
{
    if (!bInitialized) return {};
    FString Goal = FString::Printf(TEXT("should_talk_to(%s, Y)"), *Sanitize(NPCId));
    return QueryColumn(Goal, TEXT("Y"));
}

TArray<FString> UPrologEngine::GetPreferredTopics(const FString& NPCId)
{
    if (!bInitialized) return {};
    FString Goal = FString::Printf(TEXT("prefers_topic(%s, Y)"), *Sanitize(NPCId));
    return QueryColumn(Goal, TEXT("Y"));
}

bool UPrologEngine::WantsToSocialize(const FString& NPCId)
{
    if (!bInitialized) return false;
    return QueryHas(FString::Printf(TEXT("wants_to_socialize(%s)"), *Sanitize(NPCId)));
}

bool UPrologEngine::IsFirstMeeting(const FString& NPCId, const FString& PlayerId)
{
    if (!bInitialized) return true;

    // First meeting if no mental model exists (negation-as-absence).
    FString Pattern = FString::Printf(TEXT("has_mental_model(%s, %s)"), *Sanitize(NPCId), *Sanitize(PlayerId));
    return !QueryHas(Pattern);
}

TArray<FString> UPrologEngine::WhoToAvoid(const FString& NPCId)
{
    if (!bInitialized) return {};
    FString Goal = FString::Printf(TEXT("should_avoid(%s, Y)"), *Sanitize(NPCId));
    return QueryColumn(Goal, TEXT("Y"));
}

bool UPrologEngine::IsWillingToShare(const FString& NPCId, const FString& TargetId)
{
    if (!bInitialized) return true;

    // If no willing_to_share rules exist, default to true (graceful degradation).
    bool bHasWillingRules = QueryHas(TEXT("willing_to_share(_A, _B)"));
    if (!bHasWillingRules) return true;

    FString Pattern = FString::Printf(TEXT("willing_to_share(%s, %s)"), *Sanitize(NPCId), *Sanitize(TargetId));
    return QueryHas(Pattern);
}

FString UPrologEngine::GetConflictStyle(const FString& NPCId)
{
    if (!bInitialized) return FString();

    FString Goal = FString::Printf(TEXT("conflict_style(%s, S)"), *Sanitize(NPCId));
    TArray<FString> Styles = QueryColumn(Goal, TEXT("S"));
    return Styles.Num() > 0 ? Styles[0] : FString();
}

bool UPrologEngine::IsGrieving(const FString& NPCId)
{
    if (!bInitialized) return false;
    return QueryHas(FString::Printf(TEXT("is_grieving(%s)"), *Sanitize(NPCId)));
}

// ── NPC State Updates ───────────────────────────────────────────────────────

void UPrologEngine::UpdateNPCPersonality(const FString& NPCId, const FInsimulNPCPersonality& Personality)
{
    if (!bInitialized) return;

    FString Id = Sanitize(NPCId);
    RetractAllMatching(FString::Printf(TEXT("personality(%s, _, _)"), *Id));

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
    RetractAllMatching(FString::Printf(TEXT("mood(%s, _)"), *Id));
    RetractAllMatching(FString::Printf(TEXT("stress_level(%s, _)"), *Id));
    RetractAllMatching(FString::Printf(TEXT("social_desire(%s, _)"), *Id));

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

    RetractAllMatching(FString::Printf(TEXT("relationship_charge(%s, %s, _)"), *Id1, *Id2));
    RetractAllMatching(FString::Printf(TEXT("relationship_trust(%s, %s, _)"), *Id1, *Id2));
    RetractAllMatching(FString::Printf(TEXT("conversation_count(%s, %s, _)"), *Id1, *Id2));
    RetractAllMatching(FString::Printf(TEXT("friends(%s, %s)"), *Id1, *Id2));
    RetractAllMatching(FString::Printf(TEXT("enemies(%s, %s)"), *Id1, *Id2));

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

    if (SubscribedEventBus.IsValid() && EventBusSubscriptionHandle >= 0)
    {
        SubscribedEventBus->Unsubscribe(EventBusSubscriptionHandle);
    }

    SubscribedEventBus = EventBus;
    EventBusRef = EventBus;

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
            RetractPlayerFactByPattern(TEXT("has_state"), Sanitize(Event.CharacterId), Sanitize(Event.StateType), 0);
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
            RetractPlayerFactByPattern(TEXT("quest_active"), TEXT("player"), Sanitize(Event.QuestId), 0);
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

        CheckObjectiveCompletion(QuestId);

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

    RetractAllMatching(FString::Printf(TEXT("has_item(player, %s, _)"), *ItemName));

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
    FactCount = PlayerFacts.Num();
}

void UPrologEngine::RetractPlayerFact(const FString& Fact)
{
    RetractFact(Fact);

    FString CleanFact = Fact.TrimStartAndEnd();
    CleanFact.RemoveFromEnd(TEXT("."));
    PlayerFacts.Remove(CleanFact + TEXT("."));
    FactCount = PlayerFacts.Num();
}

void UPrologEngine::RetractPlayerFactByPattern(const FString& Predicate, const FString& FirstArg, const FString& SecondArg, int32 ExtraArity)
{
    // Build the ground goal with `_` wildcards for the trailing columns, then
    // retract every matching clause from the real engine.
    FString GroundPrefix;
    FString ArgList;
    if (SecondArg.IsEmpty())
    {
        GroundPrefix = FString::Printf(TEXT("%s(%s"), *Predicate, *FirstArg);
        ArgList = FirstArg;
    }
    else
    {
        GroundPrefix = FString::Printf(TEXT("%s(%s, %s"), *Predicate, *FirstArg, *SecondArg);
        ArgList = FString::Printf(TEXT("%s, %s"), *FirstArg, *SecondArg);
    }

    for (int32 i = 0; i < ExtraArity; ++i)
    {
        ArgList += TEXT(", _");
    }

    FString Goal = FString::Printf(TEXT("%s(%s)"), *Predicate, *ArgList);
    RetractAllMatching(Goal);

    // Clean up the tracked player-fact log using the same ground prefix.
    PurgeTrackedByPrefix(GroundPrefix);
}

void UPrologEngine::UpdateItemQuantityTracked(const FString& ItemName, int32 Delta)
{
    int32& CurrentQty = ItemQuantities.FindOrAdd(ItemName);
    CurrentQty = FMath::Max(0, CurrentQty + Delta);

    RetractPlayerFactByPattern(TEXT("has_item"), TEXT("player"), ItemName);

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

    FactCount = PlayerFacts.Num();
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

FString UPrologEngine::SnapshotToString()
{
    if (UInsimulPrologSubsystem* Engine = ResolveEngine())
    {
        return Engine->SnapshotToString();
    }
    return FString();
}

bool UPrologEngine::RestoreFromString(const FString& Image)
{
    if (UInsimulPrologSubsystem* Engine = ResolveEngine())
    {
        return Engine->RestoreFromString(Image);
    }
    return false;
}

// ── Volition & Romance Queries ──────────────────────────────────────────────

TArray<FString> UPrologEngine::EvaluateVolitionRules(const FString& NPCId)
{
    if (!bInitialized) return {};

    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return {};

    // volition_score(NPCId, Action, Target, Score) — reconstruct the ground facts
    // and sort by score descending (the score column drives NPC decision-making).
    FString Goal = FString::Printf(TEXT("volition_score(%s, Action, Target, Score)"), *Sanitize(NPCId));
    TArray<FInsimulPrologBinding> Solutions;
    if (!Engine->QueryAll(Goal, Solutions)) return {};

    FString NpcAtom = Sanitize(NPCId);

    struct FScoredAction
    {
        FString Fact;
        double Score = 0.0;
    };
    TArray<FScoredAction> Scored;

    for (const FInsimulPrologBinding& Solution : Solutions)
    {
        FInsimulPrologValue ActionVal, TargetVal, ScoreVal;
        UInsimulPrologSubsystem::GetBoundValue(Solution, TEXT("Action"), ActionVal);
        UInsimulPrologSubsystem::GetBoundValue(Solution, TEXT("Target"), TargetVal);
        UInsimulPrologSubsystem::GetBoundValue(Solution, TEXT("Score"), ScoreVal);

        double Score = (ScoreVal.Type == EInsimulPrologValueType::Int)
            ? static_cast<double>(ScoreVal.IntValue)
            : ScoreVal.FloatValue;

        FScoredAction Entry;
        Entry.Fact = FString::Printf(TEXT("volition_score(%s, %s, %s, %s)"),
            *NpcAtom, *ActionVal.DisplayString, *TargetVal.DisplayString, *ScoreVal.DisplayString);
        Entry.Score = Score;
        Scored.Add(Entry);
    }

    Scored.Sort([](const FScoredAction& A, const FScoredAction& B) { return A.Score > B.Score; });

    TArray<FString> Results;
    for (const FScoredAction& Entry : Scored)
    {
        Results.Add(Entry.Fact);
    }
    return Results;
}

FString UPrologEngine::GetRomanceStage(const FString& NPCId)
{
    if (!bInitialized) return FString();

    FString Goal = FString::Printf(TEXT("romance_stage(player, %s, Stage)"), *Sanitize(NPCId));
    TArray<FString> Stages = QueryColumn(Goal, TEXT("Stage"));
    return Stages.Num() > 0 ? Stages[0] : FString();
}

bool UPrologEngine::CanPerformRomanceAction(const FString& NPCId, const FString& ActionType)
{
    if (!bInitialized) return true;

    // If no romance rules loaded, allow by default (graceful degradation).
    bool bHasRomanceRules = QueryHas(TEXT("can_romance_action(_A, _B, _C)"));
    if (!bHasRomanceRules) return true;

    FString Pattern = FString::Printf(TEXT("can_romance_action(player, %s, %s)"),
        *Sanitize(NPCId), *Sanitize(ActionType));
    return QueryHas(Pattern);
}

void UPrologEngine::CheckObjectiveCompletion(const FString& QuestId)
{
    FString SanitizedId = Sanitize(QuestId);

    // Objective indices: quest_objective(QuestId, Idx, ...) — try arity 3 then 2.
    TArray<FString> Indices = QueryColumn(FString::Printf(TEXT("quest_objective(%s, I, _)"), *SanitizedId), TEXT("I"));
    if (Indices.Num() == 0)
    {
        Indices = QueryColumn(FString::Printf(TEXT("quest_objective(%s, I)"), *SanitizedId), TEXT("I"));
    }

    for (const FString& IdxStr : Indices)
    {
        int32 Idx = FCString::Atoi(*IdxStr);

        FString Key = FString::Printf(TEXT("%s:%d"), *QuestId, Idx);
        if (CompletedObjectives.Contains(Key)) continue;

        FString CompletePattern = FString::Printf(TEXT("objective_complete(player, %s, %d)"), *SanitizedId, Idx);
        if (QueryHas(CompletePattern))
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

        TArray<FString> Indices = QueryColumn(FString::Printf(TEXT("quest_objective(%s, I, _)"), *SanitizedId), TEXT("I"));
        if (Indices.Num() == 0)
        {
            Indices = QueryColumn(FString::Printf(TEXT("quest_objective(%s, I)"), *SanitizedId), TEXT("I"));
        }

        for (const FString& IdxStr : Indices)
        {
            int32 Idx = FCString::Atoi(*IdxStr);
            FString CompletePattern = FString::Printf(TEXT("objective_complete(player, %s, %d)"), *SanitizedId, Idx);
            if (QueryHas(CompletePattern))
            {
                OutCompletedObjectiveKeys.Add(FString::Printf(TEXT("%s:%d"), *QuestId, Idx));
            }
        }

        if (IsQuestComplete(QuestId, TEXT("player")))
        {
            OutCompletedQuests.Add(QuestId);
        }
    }
}

TArray<FString> UPrologEngine::GetBonusRewards(const FString& QuestId)
{
    if (!bInitialized) return {};

    UInsimulPrologSubsystem* Engine = ResolveEngine();
    if (!Engine) return {};

    // quest_bonus_reward(player, QuestId, Type, Value) — reconstruct ground facts.
    FString Goal = FString::Printf(TEXT("quest_bonus_reward(player, %s, Type, Value)"), *Sanitize(QuestId));
    TArray<FInsimulPrologBinding> Solutions;
    if (!Engine->QueryAll(Goal, Solutions)) return {};

    FString QuestAtom = Sanitize(QuestId);
    TArray<FString> Results;
    for (const FInsimulPrologBinding& Solution : Solutions)
    {
        FInsimulPrologValue TypeVal, ValueVal;
        UInsimulPrologSubsystem::GetBoundValue(Solution, TEXT("Type"), TypeVal);
        UInsimulPrologSubsystem::GetBoundValue(Solution, TEXT("Value"), ValueVal);
        Results.Add(FString::Printf(TEXT("quest_bonus_reward(player, %s, %s, %s)"),
            *QuestAtom, *TypeVal.DisplayString, *ValueVal.DisplayString));
    }
    return Results;
}

// ── Private Helpers ─────────────────────────────────────────────────────────

FString UPrologEngine::Sanitize(const FString& Str)
{
    FString Result = Str.ToLower();

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

    if (Sanitized.Len() > 0 && FChar::IsDigit(Sanitized[0]))
    {
        Sanitized = TEXT("_") + Sanitized;
    }

    while (Sanitized.Contains(TEXT("__")))
    {
        Sanitized = Sanitized.Replace(TEXT("__"), TEXT("_"));
    }

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
