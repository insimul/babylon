#include "ActionSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UActionSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ActionSystem initialized"));
}

void UActionSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UActionSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* SystemsObj;
    if (!Root->TryGetObjectField(TEXT("systems"), SystemsObj)) return;

    const TArray<TSharedPtr<FJsonValue>>* ActionsArr;
    if ((*SystemsObj)->TryGetArrayField(TEXT("actions"), ActionsArr))
    {
        for (const auto& Val : *ActionsArr)
        {
            if (Val.IsValid() && Val->Type == EJson::Object)
                ParsedActions.Add(Val->AsObject());
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* BaseArr;
    if ((*SystemsObj)->TryGetArrayField(TEXT("baseActions"), BaseArr))
    {
        for (const auto& Val : *BaseArr)
        {
            if (Val.IsValid() && Val->Type == EJson::Object)
                ParsedActions.Add(Val->AsObject());
        }
    }

    ActionCount = ParsedActions.Num();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d actions"), ActionCount);
}

TArray<FString> UActionSystem::GetActionsByCategory(const FString& Category)
{
    TArray<FString> Result;
    for (const auto& ActionObj : ParsedActions)
    {
        FString ActionType;
        if (ActionObj->TryGetStringField(TEXT("actionType"), ActionType) && ActionType == Category)
        {
            FString Id;
            ActionObj->TryGetStringField(TEXT("id"), Id);
            Result.Add(Id);
        }
    }
    return Result;
}

TArray<FString> UActionSystem::GetContextualActions(float PlayerEnergy, bool bHasTarget)
{
    TArray<FString> Result;
    for (const auto& ActionObj : ParsedActions)
    {
        FString Id;
        ActionObj->TryGetStringField(TEXT("id"), Id);

        bool bIsActive = ActionObj->GetBoolField(TEXT("isActive"));
        if (!bIsActive && ActionObj->HasField(TEXT("isActive"))) continue;

        // Check cooldown
        if (const FInsimulActionState* State = ActionStates.Find(Id))
        {
            if (State->CooldownRemaining > 0.f) continue;
        }

        // Check energy
        double EnergyCost = ActionObj->GetNumberField(TEXT("energyCost"));
        if (EnergyCost > 0 && EnergyCost > PlayerEnergy) continue;

        // Check target requirement
        bool bRequiresTarget = ActionObj->GetBoolField(TEXT("requiresTarget"));
        if (bRequiresTarget && !bHasTarget) continue;

        Result.Add(Id);
    }
    return Result;
}

bool UActionSystem::CanPerformAction(const FString& ActionId, float PlayerEnergy, bool bHasTarget, FString& Reason)
{
    const TSharedPtr<FJsonObject>* FoundAction = nullptr;
    for (const auto& ActionObj : ParsedActions)
    {
        FString Id;
        ActionObj->TryGetStringField(TEXT("id"), Id);
        if (Id == ActionId)
        {
            FoundAction = &ActionObj;
            break;
        }
    }

    if (!FoundAction)
    {
        Reason = TEXT("Action not found");
        return false;
    }

    const auto& ActionObj = *FoundAction;

    if (ActionObj->HasField(TEXT("isActive")) && !ActionObj->GetBoolField(TEXT("isActive")))
    {
        Reason = TEXT("Action not available");
        return false;
    }

    if (const FInsimulActionState* State = ActionStates.Find(ActionId))
    {
        if (State->CooldownRemaining > 0.f)
        {
            Reason = FString::Printf(TEXT("On cooldown (%.1fs remaining)"), State->CooldownRemaining);
            return false;
        }
    }

    double EnergyCost = ActionObj->GetNumberField(TEXT("energyCost"));
    if (EnergyCost > 0 && EnergyCost > PlayerEnergy)
    {
        Reason = FString::Printf(TEXT("Not enough energy (need %d)"), static_cast<int32>(EnergyCost));
        return false;
    }

    bool bRequiresTarget = ActionObj->GetBoolField(TEXT("requiresTarget"));
    if (bRequiresTarget && !bHasTarget)
    {
        Reason = TEXT("Requires a target");
        return false;
    }

    Reason = TEXT("");
    return true;
}

void UActionSystem::UpdateCooldowns(float DeltaTime)
{
    for (auto& Pair : ActionStates)
    {
        if (Pair.Value.CooldownRemaining > 0.f)
        {
            Pair.Value.CooldownRemaining = FMath::Max(0.f, Pair.Value.CooldownRemaining - DeltaTime);
        }
    }
}

float UActionSystem::GetCooldown(const FString& ActionId)
{
    if (const FInsimulActionState* State = ActionStates.Find(ActionId))
    {
        return State->CooldownRemaining;
    }
    return 0.f;
}

FString UActionSystem::GenerateNarrativeText(const TSharedPtr<FJsonObject>& ActionObj, const FString& ActorName, const FString& TargetName)
{
    const TArray<TSharedPtr<FJsonValue>>* Templates;
    if (ActionObj->TryGetArrayField(TEXT("narrativeTemplates"), Templates) && Templates->Num() > 0)
    {
        int32 Idx = FMath::RandRange(0, Templates->Num() - 1);
        FString Text = (*Templates)[Idx]->AsString();
        Text = Text.Replace(TEXT("{actor}"), *ActorName);
        Text = Text.Replace(TEXT("{target}"), *TargetName);
        return Text;
    }

    // Fallback
    FString Name;
    ActionObj->TryGetStringField(TEXT("name"), Name);
    FString VerbPast;
    if (!ActionObj->TryGetStringField(TEXT("verbPast"), VerbPast))
        VerbPast = Name.ToLower();
    return FString::Printf(TEXT("You %s."), *VerbPast);
}

TMap<FString, TMap<FString, float>> UActionSystem::GetStandardActionAffinities()
{
    TMap<FString, TMap<FString, float>> Affinities;

    // Social actions
    Affinities.Add(TEXT("greet"), {{TEXT("Extroversion"), 0.4f}, {TEXT("Agreeableness"), 0.3f}});
    Affinities.Add(TEXT("compliment"), {{TEXT("Agreeableness"), 0.5f}, {TEXT("Extroversion"), 0.2f}});
    Affinities.Add(TEXT("gossip"), {{TEXT("Extroversion"), 0.3f}, {TEXT("Agreeableness"), -0.3f}, {TEXT("Openness"), 0.1f}});
    Affinities.Add(TEXT("argue"), {{TEXT("Extroversion"), 0.2f}, {TEXT("Agreeableness"), -0.5f}, {TEXT("Neuroticism"), 0.3f}});
    Affinities.Add(TEXT("comfort"), {{TEXT("Agreeableness"), 0.6f}, {TEXT("Extroversion"), 0.1f}});
    Affinities.Add(TEXT("apologize"), {{TEXT("Agreeableness"), 0.4f}, {TEXT("Conscientiousness"), 0.3f}});

    // Physical actions
    Affinities.Add(TEXT("fight"), {{TEXT("Agreeableness"), -0.5f}, {TEXT("Extroversion"), 0.3f}, {TEXT("Neuroticism"), 0.2f}});
    Affinities.Add(TEXT("flee"), {{TEXT("Neuroticism"), 0.5f}, {TEXT("Agreeableness"), 0.2f}});
    Affinities.Add(TEXT("explore"), {{TEXT("Openness"), 0.6f}, {TEXT("Extroversion"), 0.2f}});
    Affinities.Add(TEXT("rest"), {{TEXT("Conscientiousness"), -0.2f}, {TEXT("Neuroticism"), 0.1f}});

    // Economic actions
    Affinities.Add(TEXT("trade"), {{TEXT("Conscientiousness"), 0.4f}, {TEXT("Agreeableness"), 0.1f}});
    Affinities.Add(TEXT("steal"), {{TEXT("Agreeableness"), -0.6f}, {TEXT("Conscientiousness"), -0.4f}, {TEXT("Neuroticism"), 0.2f}});
    Affinities.Add(TEXT("craft"), {{TEXT("Conscientiousness"), 0.5f}, {TEXT("Openness"), 0.3f}});
    Affinities.Add(TEXT("work"), {{TEXT("Conscientiousness"), 0.6f}});

    // Romance actions
    Affinities.Add(TEXT("flirt"), {{TEXT("Extroversion"), 0.4f}, {TEXT("Openness"), 0.3f}, {TEXT("Agreeableness"), 0.1f}});
    Affinities.Add(TEXT("express_love"), {{TEXT("Agreeableness"), 0.4f}, {TEXT("Extroversion"), 0.2f}, {TEXT("Openness"), 0.3f}});

    // Mental actions
    Affinities.Add(TEXT("study"), {{TEXT("Openness"), 0.5f}, {TEXT("Conscientiousness"), 0.4f}});
    Affinities.Add(TEXT("meditate"), {{TEXT("Openness"), 0.4f}, {TEXT("Neuroticism"), -0.3f}});
    Affinities.Add(TEXT("plan"), {{TEXT("Conscientiousness"), 0.6f}, {TEXT("Openness"), 0.2f}});

    return Affinities;
}

TArray<FInsimulRankedAction> UActionSystem::GetContextualActionsRanked(float PlayerEnergy, bool bHasTarget, const FInsimulPersonalityProfile& Personality)
{
    TArray<FString> ContextualIds = GetContextualActions(PlayerEnergy, bHasTarget);
    TArray<FInsimulRankedAction> Result;

    if (ContextualIds.Num() == 0) return Result;

    // Check if personality is effectively zero (no personality provided)
    bool bHasPersonality = FMath::Abs(Personality.Openness) > KINDA_SMALL_NUMBER
        || FMath::Abs(Personality.Conscientiousness) > KINDA_SMALL_NUMBER
        || FMath::Abs(Personality.Extroversion) > KINDA_SMALL_NUMBER
        || FMath::Abs(Personality.Agreeableness) > KINDA_SMALL_NUMBER
        || FMath::Abs(Personality.Neuroticism) > KINDA_SMALL_NUMBER;

    if (!bHasPersonality)
    {
        float Uniform = 1.f / ContextualIds.Num();
        for (const FString& Id : ContextualIds)
        {
            FInsimulRankedAction Ranked;
            Ranked.ActionId = Id;
            Ranked.Probability = Uniform;
            Result.Add(Ranked);
        }
        return Result;
    }

    // Build personality trait map for dot product
    TMap<FString, float> TraitValues;
    TraitValues.Add(TEXT("Openness"), Personality.Openness);
    TraitValues.Add(TEXT("Conscientiousness"), Personality.Conscientiousness);
    TraitValues.Add(TEXT("Extroversion"), Personality.Extroversion);
    TraitValues.Add(TEXT("Agreeableness"), Personality.Agreeableness);
    TraitValues.Add(TEXT("Neuroticism"), Personality.Neuroticism);

    static const TMap<FString, TMap<FString, float>> Affinities = GetStandardActionAffinities();
    const float Temperature = 1.0f;

    // Compute raw scores
    TArray<float> Scores;
    for (const FString& Id : ContextualIds)
    {
        float Score = 0.5f; // base weight

        // Find action type
        FString ActionType;
        for (const auto& ActionObj : ParsedActions)
        {
            FString AId;
            ActionObj->TryGetStringField(TEXT("id"), AId);
            if (AId == Id)
            {
                ActionObj->TryGetStringField(TEXT("actionType"), ActionType);
                break;
            }
        }

        // Dot product of personality traits with action affinities
        if (const TMap<FString, float>* TypeAffinities = Affinities.Find(ActionType))
        {
            for (const auto& Pair : *TypeAffinities)
            {
                if (const float* TraitVal = TraitValues.Find(Pair.Key))
                {
                    Score += (*TraitVal) * Pair.Value;
                }
            }
        }

        Scores.Add(Score);
    }

    // Softmax with temperature
    float MaxScore = Scores[0];
    for (float S : Scores) MaxScore = FMath::Max(MaxScore, S);

    TArray<float> Exps;
    float SumExp = 0.f;
    for (float S : Scores)
    {
        float E = FMath::Exp((S - MaxScore) / FMath::Max(0.01f, Temperature));
        Exps.Add(E);
        SumExp += E;
    }

    // Build ranked results
    if (SumExp <= 0.f) SumExp = 1.f;
    for (int32 i = 0; i < ContextualIds.Num(); ++i)
    {
        FInsimulRankedAction Ranked;
        Ranked.ActionId = ContextualIds[i];
        Ranked.Probability = Exps[i] / SumExp;
        Result.Add(Ranked);
    }

    // Sort descending by probability
    Result.Sort([](const FInsimulRankedAction& A, const FInsimulRankedAction& B) {
        return A.Probability > B.Probability;
    });

    return Result;
}

FInsimulActionResult UActionSystem::ExecuteAction(const FString& ActionId, AActor* Source, AActor* Target)
{
    FInsimulActionResult Result;

    // Find action definition
    TSharedPtr<FJsonObject> ActionObj;
    for (const auto& A : ParsedActions)
    {
        FString Id;
        A->TryGetStringField(TEXT("id"), Id);
        if (Id == ActionId) { ActionObj = A; break; }
    }

    if (!ActionObj.IsValid())
    {
        Result.bSuccess = false;
        Result.Message = TEXT("Action not found");
        return Result;
    }

    // Validate via CanPerformAction
    FString Reason;
    float PlayerEnergy = 100.f; // Default; caller should set properly
    if (!CanPerformAction(ActionId, PlayerEnergy, Target != nullptr, Reason))
    {
        Result.bSuccess = false;
        Result.Message = Reason;
        return Result;
    }

    FString ActionName;
    ActionObj->TryGetStringField(TEXT("name"), ActionName);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] ExecuteAction: %s"), *ActionName);

    // Process effects from action definition
    const TArray<TSharedPtr<FJsonValue>>* EffectsArr;
    if (ActionObj->TryGetArrayField(TEXT("effects"), EffectsArr))
    {
        for (const auto& EffVal : *EffectsArr)
        {
            auto EffObj = EffVal->AsObject();
            if (!EffObj.IsValid()) continue;

            FString Category;
            EffObj->TryGetStringField(TEXT("category"), Category);

            FInsimulActionEffect Effect;
            Effect.Type = Category;
            Effect.Value = static_cast<float>(EffObj->GetNumberField(TEXT("value")));

            FString First;
            EffObj->TryGetStringField(TEXT("first"), First);
            Effect.Target = (First == TEXT("initiator")) ? TEXT("player") : (Target ? Target->GetName() : TEXT(""));

            FString EffType;
            EffObj->TryGetStringField(TEXT("type"), EffType);
            Effect.Description = FString::Printf(TEXT("%s %s %.0f"), *EffType, *EffObj->GetStringField(TEXT("operator")), Effect.Value);

            if (Category == TEXT("item"))
            {
                Effect.ItemId = EffType;
                Effect.Quantity = static_cast<int32>(Effect.Value);
                OnItemEffect.Broadcast(Effect.ItemId, Effect.Quantity);
            }
            else if (Category == TEXT("gold"))
            {
                OnGoldEffect.Broadcast(static_cast<int32>(Effect.Value));
            }

            Result.Effects.Add(Effect);
        }
    }

    // Generate narrative text
    FString TargetName = Target ? Target->GetName() : TEXT("someone");
    Result.NarrativeText = GenerateNarrativeText(ActionObj, TEXT("You"), TargetName);

    // Start cooldown
    double Cooldown = ActionObj->GetNumberField(TEXT("cooldown"));
    FInsimulActionState& State = ActionStates.FindOrAdd(ActionId);
    State.ActionId = ActionId;
    State.LastUsed = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
    State.TimesUsed += 1;
    if (Cooldown > 0)
    {
        State.CooldownRemaining = static_cast<float>(Cooldown);
    }

    // Extract animation data from action's customData if present
    const TSharedPtr<FJsonObject>* CustomDataObj;
    if (ActionObj->TryGetObjectField(TEXT("customData"), CustomDataObj))
    {
        const TSharedPtr<FJsonObject>* AnimObj;
        if ((*CustomDataObj)->TryGetObjectField(TEXT("animation"), AnimObj))
        {
            Result.bHasAnimation = true;
            (*AnimObj)->TryGetStringField(TEXT("clip"), Result.Animation.Clip);
            (*AnimObj)->TryGetStringField(TEXT("clipAlt"), Result.Animation.ClipAlt);
            (*AnimObj)->TryGetStringField(TEXT("library"), Result.Animation.Library);
            Result.Animation.bLoop = (*AnimObj)->GetBoolField(TEXT("loop"));

            double SpeedVal;
            if ((*AnimObj)->TryGetNumberField(TEXT("speed"), SpeedVal))
                Result.Animation.Speed = static_cast<float>(SpeedVal);

            double BlendVal;
            if ((*AnimObj)->TryGetNumberField(TEXT("blendIn"), BlendVal))
                Result.Animation.BlendIn = static_cast<float>(BlendVal);
        }
    }

    Result.bSuccess = true;
    Result.Message = FString::Printf(TEXT("%s performed successfully"), *ActionName);
    Result.EnergyUsed = static_cast<int32>(ActionObj->GetNumberField(TEXT("energyCost")));
    return Result;
}

TArray<FString> UActionSystem::FindActionForObjective(const FString& ObjectiveType)
{
    // Maps quest objective types to action names that can satisfy them
    static TMap<FString, TArray<FString>> ObjectiveToAction;
    if (ObjectiveToAction.Num() == 0)
    {
        ObjectiveToAction.Add(TEXT("visit_location"), {TEXT("travel_to_location"), TEXT("enter_building")});
        ObjectiveToAction.Add(TEXT("discover_location"), {TEXT("travel_to_location")});
        ObjectiveToAction.Add(TEXT("talk_to_npc"), {TEXT("talk_to_npc")});
        ObjectiveToAction.Add(TEXT("complete_conversation"), {TEXT("talk_to_npc")});
        ObjectiveToAction.Add(TEXT("collect_item"), {TEXT("collect_item")});
        ObjectiveToAction.Add(TEXT("deliver_item"), {TEXT("give_gift")});
        ObjectiveToAction.Add(TEXT("craft_item"), {TEXT("craft_item"), TEXT("craft"), TEXT("cook")});
        ObjectiveToAction.Add(TEXT("defeat_enemies"), {TEXT("attack_enemy")});
        ObjectiveToAction.Add(TEXT("build_friendship"), {TEXT("talk_to_npc"), TEXT("compliment_npc"), TEXT("give_gift")});
        ObjectiveToAction.Add(TEXT("give_gift"), {TEXT("give_gift")});
        ObjectiveToAction.Add(TEXT("examine_object"), {TEXT("examine_object")});
        ObjectiveToAction.Add(TEXT("read_sign"), {TEXT("read_sign")});
        ObjectiveToAction.Add(TEXT("listen_and_repeat"), {TEXT("listen_and_repeat")});
        ObjectiveToAction.Add(TEXT("point_and_name"), {TEXT("point_and_name")});
        ObjectiveToAction.Add(TEXT("read_text"), {TEXT("read_book")});
        ObjectiveToAction.Add(TEXT("comprehension_quiz"), {TEXT("answer_question")});
        ObjectiveToAction.Add(TEXT("photograph_subject"), {TEXT("take_photo")});
        ObjectiveToAction.Add(TEXT("photograph_activity"), {TEXT("take_photo")});
    }

    TArray<FString> Result;
    const TArray<FString>* Names = ObjectiveToAction.Find(ObjectiveType);
    if (!Names) return Result;

    for (const auto& ActionObj : ParsedActions)
    {
        FString Name;
        if (ActionObj->TryGetStringField(TEXT("name"), Name) && Names->Contains(Name))
        {
            FString Id;
            ActionObj->TryGetStringField(TEXT("id"), Id);
            Result.Add(Id);
        }
    }
    return Result;
}

FString UActionSystem::GetActionByName(const FString& ActionName)
{
    for (const auto& ActionObj : ParsedActions)
    {
        FString Name;
        if (ActionObj->TryGetStringField(TEXT("name"), Name) && Name == ActionName)
        {
            FString Id;
            ActionObj->TryGetStringField(TEXT("id"), Id);
            return Id;
        }
    }
    return FString();
}
