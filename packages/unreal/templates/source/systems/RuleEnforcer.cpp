#include "RuleEnforcer.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void URuleEnforcer::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] RuleEnforcer initialized"));
}

void URuleEnforcer::Deinitialize()
{
    Rules.Empty();
    SettlementZones.Empty();
    Violations.Empty();
    Super::Deinitialize();
}

void URuleEnforcer::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* SystemsObj;
    if (Root->TryGetObjectField(TEXT("systems"), SystemsObj))
    {
        const TArray<TSharedPtr<FJsonValue>>* RulesArr;
        if ((*SystemsObj)->TryGetArrayField(TEXT("rules"), RulesArr))
        {
            RuleCount = RulesArr->Num();
        }
        const TArray<TSharedPtr<FJsonValue>>* BaseArr;
        if ((*SystemsObj)->TryGetArrayField(TEXT("baseRules"), BaseArr))
        {
            RuleCount += BaseArr->Num();
        }
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d rules"), RuleCount);
    }
}

TArray<FString> URuleEnforcer::EvaluateRules(const FInsimulGameContext& Context)
{
    TArray<FString> FoundViolations;

    for (const FInsimulRule& Rule : Rules)
    {
        if (!Rule.bIsActive) continue;
        if (Rule.RuleType != TEXT("trigger") && Rule.RuleType != TEXT("volition")) continue;

        if (CheckRuleConditions(Rule, Context))
        {
            const FInsimulRuleEffect* Restriction = FindRestriction(Rule, Context.ActionType);
            if (Restriction)
            {
                FString Msg = Restriction->Message.IsEmpty()
                    ? FString::Printf(TEXT("Action violates rule: %s"), *Rule.Name)
                    : Restriction->Message;
                FoundViolations.Add(Msg);
            }
        }
    }

    return FoundViolations;
}

bool URuleEnforcer::CanPerformAction(const FString& ActionId, const FString& ActionType, const FInsimulGameContext& Context)
{
    if (bHasPrologKB)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Consulting Prolog KB for action %s"), *ActionId);
    }

    FInsimulGameContext Ctx = Context;
    Ctx.ActionId = ActionId;
    Ctx.ActionType = ActionType;

    TArray<FString> EvalViolations = EvaluateRules(Ctx);
    return EvalViolations.Num() == 0;
}

/**
 * Attach a Prolog knowledge base string for logic-based rule evaluation.
 * The KB content is stored and used for quest condition checks (quest_complete,
 * quest_available, quest_cefr_level) via lightweight string search rather than
 * requiring a full Prolog interpreter in the export.
 */
void URuleEnforcer::SetPrologKnowledgeBase(const FString& PrologContent)
{
    PrologKBContent = PrologContent;
    bHasPrologKB = !PrologContent.IsEmpty();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Prolog KB %s (%d chars)"),
        bHasPrologKB ? TEXT("attached") : TEXT("cleared"), PrologContent.Len());
}

// --- Settlement zone registration ---

void URuleEnforcer::RegisterSettlementZone(const FString& SettlementId, FVector Position, float Radius)
{
    FInsimulSettlementZone Zone;
    Zone.SettlementId = SettlementId;
    Zone.Position = Position;
    Zone.Radius = Radius;
    SettlementZones.Add(Zone);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Registered settlement zone '%s' at (%.1f, %.1f, %.1f) radius %.1f"),
        *SettlementId, Position.X, Position.Y, Position.Z, Radius);
}

bool URuleEnforcer::IsInSettlement(FVector Position, FString& OutSettlementId) const
{
    for (const FInsimulSettlementZone& Zone : SettlementZones)
    {
        float Distance = FVector::Dist(Position, Zone.Position);
        if (Distance <= Zone.Radius)
        {
            OutSettlementId = Zone.SettlementId;
            return true;
        }
    }
    OutSettlementId = FString();
    return false;
}

// --- Violation tracking ---

void URuleEnforcer::RecordViolation(const FString& RuleId, const FString& RuleName, const FString& Severity, const FString& Message)
{
    FInsimulRuleViolation V;
    V.RuleId = RuleId;
    V.RuleName = RuleName;
    V.Timestamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
    V.Severity = Severity;
    V.Message = Message;
    Violations.Add(V);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Violation recorded: %s — %s"), *RuleName, *Message);

    OnViolation.Broadcast(V);
}

TArray<FInsimulRuleViolation> URuleEnforcer::GetViolations(int32 Limit) const
{
    if (Limit <= 0 || Limit >= Violations.Num())
    {
        return Violations;
    }

    TArray<FInsimulRuleViolation> Recent;
    int32 Start = Violations.Num() - Limit;
    for (int32 i = Start; i < Violations.Num(); ++i)
    {
        Recent.Add(Violations[i]);
    }
    return Recent;
}

void URuleEnforcer::ClearViolations()
{
    Violations.Empty();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Violations cleared"));
}

// --- Condition evaluation ---

bool URuleEnforcer::CheckRuleConditions(const FInsimulRule& Rule, const FInsimulGameContext& Context) const
{
    if (Rule.Conditions.Num() == 0) return true;

    for (const FInsimulRuleCondition& Cond : Rule.Conditions)
    {
        if (!EvaluateCondition(Cond, Context)) return false;
    }
    return true;
}

bool URuleEnforcer::EvaluateCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    switch (Condition.Type)
    {
        case EInsimulConditionType::Location: return CheckLocationCondition(Condition, Context);
        case EInsimulConditionType::Zone:     return CheckZoneCondition(Condition, Context);
        case EInsimulConditionType::Action:   return CheckActionCondition(Condition, Context);
        case EInsimulConditionType::Energy:   return CheckEnergyCondition(Condition, Context);
        case EInsimulConditionType::Proximity: return Context.bNearNPC;
        case EInsimulConditionType::Tag:      return true;
        case EInsimulConditionType::HasItem:        return CheckHasItemCondition(Condition, Context);
        case EInsimulConditionType::ItemCount:      return CheckItemCountCondition(Condition, Context);
        case EInsimulConditionType::ItemType:       return CheckItemTypeCondition(Condition, Context);
        case EInsimulConditionType::QuestComplete:  return CheckQuestCompleteCondition(Condition, Context);
        case EInsimulConditionType::QuestAvailable: return CheckQuestAvailableCondition(Condition, Context);
        case EInsimulConditionType::CefrLevel:      return CheckCefrLevelCondition(Condition, Context);
        default: return true;
    }
}

bool URuleEnforcer::CheckLocationCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (Condition.Location == TEXT("settlement")) return Context.bInSettlement;
    if (Condition.Location == TEXT("wilderness")) return !Context.bInSettlement;
    return true;
}

bool URuleEnforcer::CheckZoneCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (Condition.Zone == TEXT("safe") || Condition.Zone == TEXT("settlement")) return Context.bInSettlement;
    if (Condition.Zone == TEXT("combat") || Condition.Zone == TEXT("wilderness")) return !Context.bInSettlement;
    return true;
}

bool URuleEnforcer::CheckActionCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (!Condition.Action.IsEmpty())
    {
        return Context.ActionType == Condition.Action || Context.ActionId == Condition.Action;
    }
    return true;
}

bool URuleEnforcer::CheckEnergyCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (Context.PlayerEnergy < 0.f) return true;
    return CompareValue(Context.PlayerEnergy, Condition.Value, Condition.Operator.IsEmpty() ? TEXT(">=") : Condition.Operator);
}

bool URuleEnforcer::CheckHasItemCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (Context.PlayerInventory.Num() == 0) return false;

    for (const FInsimulInventoryItem& Item : Context.PlayerInventory)
    {
        if (!Condition.ItemId.IsEmpty() && Item.ItemId == Condition.ItemId) return true;
        if (!Condition.ItemName.IsEmpty() && Item.Name.ToLower() == Condition.ItemName.ToLower()) return true;
    }
    return false;
}

bool URuleEnforcer::CheckItemCountCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (Context.PlayerInventory.Num() == 0) return false;

    int32 Qty = 0;
    for (const FInsimulInventoryItem& Item : Context.PlayerInventory)
    {
        if ((!Condition.ItemId.IsEmpty() && Item.ItemId == Condition.ItemId) ||
            (!Condition.ItemName.IsEmpty() && Item.Name.ToLower() == Condition.ItemName.ToLower()))
        {
            Qty = Item.Quantity;
            break;
        }
    }

    float Required = (float)Condition.Quantity;
    return CompareValue((float)Qty, Required, Condition.Operator.IsEmpty() ? TEXT(">=") : Condition.Operator);
}

bool URuleEnforcer::CheckItemTypeCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (Context.PlayerInventory.Num() == 0 || Condition.ItemType.IsEmpty()) return false;

    // Map string type name to enum
    static const TMap<FString, EInsimulItemType> TypeMap = {
        {TEXT("quest"), EInsimulItemType::Quest},
        {TEXT("collectible"), EInsimulItemType::Collectible},
        {TEXT("key"), EInsimulItemType::Key},
        {TEXT("consumable"), EInsimulItemType::Consumable},
        {TEXT("weapon"), EInsimulItemType::Weapon},
        {TEXT("armor"), EInsimulItemType::Armor},
        {TEXT("food"), EInsimulItemType::Food},
        {TEXT("drink"), EInsimulItemType::Drink},
        {TEXT("material"), EInsimulItemType::Material},
        {TEXT("tool"), EInsimulItemType::Tool},
    };

    const EInsimulItemType* TargetType = TypeMap.Find(Condition.ItemType.ToLower());
    if (!TargetType) return false;

    for (const FInsimulInventoryItem& Item : Context.PlayerInventory)
    {
        if (Item.Type == *TargetType) return true;
    }
    return false;
}

bool URuleEnforcer::CheckQuestCompleteCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (!bHasPrologKB || Condition.QuestId.IsEmpty()) return false;
    // Search the KB for quest_complete(player, "<questId>")
    FString Pattern = FString::Printf(TEXT("quest_complete(player, \"%s\")"), *Condition.QuestId);
    return PrologKBContent.Contains(Pattern);
}

bool URuleEnforcer::CheckQuestAvailableCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (!bHasPrologKB || Condition.QuestId.IsEmpty()) return false;
    // Search the KB for quest_available(player, "<questId>")
    FString Pattern = FString::Printf(TEXT("quest_available(player, \"%s\")"), *Condition.QuestId);
    return PrologKBContent.Contains(Pattern);
}

bool URuleEnforcer::CheckCefrLevelCondition(const FInsimulRuleCondition& Condition, const FInsimulGameContext& Context) const
{
    if (!bHasPrologKB || Condition.QuestId.IsEmpty() || Condition.CefrLevel.IsEmpty()) return false;
    // Search the KB for quest_cefr_level("<questId>", "<level>")
    FString Pattern = FString::Printf(TEXT("quest_cefr_level(\"%s\", \"%s\")"), *Condition.QuestId, *Condition.CefrLevel);
    return PrologKBContent.Contains(Pattern);
}

bool URuleEnforcer::CompareValue(float Actual, float Expected, const FString& Operator) const
{
    if (Operator == TEXT(">"))  return Actual > Expected;
    if (Operator == TEXT(">=")) return Actual >= Expected;
    if (Operator == TEXT("<"))  return Actual < Expected;
    if (Operator == TEXT("<=")) return Actual <= Expected;
    if (Operator == TEXT("==")) return FMath::IsNearlyEqual(Actual, Expected);
    return Actual >= Expected;
}

const FInsimulRuleEffect* URuleEnforcer::FindRestriction(const FInsimulRule& Rule, const FString& ActionType) const
{
    for (const FInsimulRuleEffect& Effect : Rule.Effects)
    {
        if (Effect.Type == TEXT("restrict") || Effect.Type == TEXT("prevent") || Effect.Type == TEXT("block"))
        {
            if (Effect.Action.IsEmpty() || Effect.Action == ActionType || Effect.Action == TEXT("all"))
            {
                return &Effect;
            }
        }
    }
    return nullptr;
}

// --- Atom helpers (match ir-generator.ts sanitizeAtom / nameAtom) ---

FString URuleEnforcer::SanitizeToAtom(const FString& Name)
{
    if (Name.IsEmpty()) return TEXT("unknown");

    FString Result = Name.ToLower();
    // Replace non-alphanumeric (except underscore) with underscore
    FString Cleaned;
    for (TCHAR Ch : Result)
    {
        if ((Ch >= 'a' && Ch <= 'z') || (Ch >= '0' && Ch <= '9') || Ch == '_')
            Cleaned.AppendChar(Ch);
        else
            Cleaned.AppendChar('_');
    }
    // Prefix leading digit with underscore
    if (Cleaned.Len() > 0 && Cleaned[0] >= '0' && Cleaned[0] <= '9')
    {
        Cleaned = TEXT("_") + Cleaned;
    }
    // Collapse multiple underscores
    while (Cleaned.Contains(TEXT("__")))
    {
        Cleaned = Cleaned.Replace(TEXT("__"), TEXT("_"));
    }
    // Strip leading/trailing underscores
    while (Cleaned.Len() > 0 && Cleaned[0] == '_') Cleaned.RemoveAt(0);
    while (Cleaned.Len() > 0 && Cleaned[Cleaned.Len() - 1] == '_') Cleaned.RemoveAt(Cleaned.Len() - 1);

    return Cleaned.IsEmpty() ? TEXT("unknown") : Cleaned;
}

FString URuleEnforcer::NameToAtom(const FString& Name, const FString& FallbackId)
{
    if (!Name.TrimStartAndEnd().IsEmpty())
    {
        // Strip combining diacritical marks (Unicode NFD accents)
        FString Normalized = Name;
        // Simple ASCII transliteration for common accented characters
        Normalized = Normalized.Replace(TEXT("\u00e9"), TEXT("e"));
        Normalized = Normalized.Replace(TEXT("\u00e8"), TEXT("e"));
        Normalized = Normalized.Replace(TEXT("\u00ea"), TEXT("e"));
        Normalized = Normalized.Replace(TEXT("\u00e0"), TEXT("a"));
        Normalized = Normalized.Replace(TEXT("\u00e1"), TEXT("a"));
        Normalized = Normalized.Replace(TEXT("\u00e2"), TEXT("a"));
        Normalized = Normalized.Replace(TEXT("\u00f6"), TEXT("o"));
        Normalized = Normalized.Replace(TEXT("\u00f3"), TEXT("o"));
        Normalized = Normalized.Replace(TEXT("\u00fc"), TEXT("u"));
        Normalized = Normalized.Replace(TEXT("\u00fa"), TEXT("u"));
        Normalized = Normalized.Replace(TEXT("\u00ed"), TEXT("i"));
        Normalized = Normalized.Replace(TEXT("\u00f1"), TEXT("n"));
        return SanitizeToAtom(Normalized);
    }
    return SanitizeToAtom(FallbackId.IsEmpty() ? TEXT("unknown") : FallbackId);
}
