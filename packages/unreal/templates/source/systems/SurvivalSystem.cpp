#include "SurvivalSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void USurvivalSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SurvivalSystem initialized"));
}

void USurvivalSystem::Deinitialize()
{
    Super::Deinitialize();
}

EInsimulNeedType USurvivalSystem::StringToNeedType(const FString& Id)
{
    if (Id == TEXT("hunger"))      return EInsimulNeedType::Hunger;
    if (Id == TEXT("thirst"))      return EInsimulNeedType::Thirst;
    if (Id == TEXT("temperature")) return EInsimulNeedType::Temperature;
    if (Id == TEXT("stamina"))     return EInsimulNeedType::Stamina;
    if (Id == TEXT("sleep"))       return EInsimulNeedType::Sleep;
    return EInsimulNeedType::Hunger;
}

void USurvivalSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* SurvObj;
    if (!Root->TryGetObjectField(TEXT("survival"), SurvObj)) return;

    // Parse needs array
    const TArray<TSharedPtr<FJsonValue>>* NeedsArr;
    if ((*SurvObj)->TryGetArrayField(TEXT("needs"), NeedsArr))
    {
        for (const auto& NeedVal : *NeedsArr)
        {
            const TSharedPtr<FJsonObject>* NeedObj;
            if (!NeedVal->TryGetObject(NeedObj)) continue;

            FString Id = (*NeedObj)->GetStringField(TEXT("id"));
            FInsimulNeedConfig Config;
            Config.Type = StringToNeedType(Id);
            Config.Name = (*NeedObj)->GetStringField(TEXT("name"));
            Config.Icon = (*NeedObj)->GetStringField(TEXT("icon"));
            Config.MaxValue = (*NeedObj)->GetNumberField(TEXT("maxValue"));
            Config.StartValue = (*NeedObj)->GetNumberField(TEXT("startValue"));
            Config.DecayRate = (*NeedObj)->GetNumberField(TEXT("decayRate"));
            Config.CriticalThreshold = (*NeedObj)->GetNumberField(TEXT("criticalThreshold"));
            Config.WarningThreshold = (*NeedObj)->GetNumberField(TEXT("warningThreshold"));
            Config.DamageRate = (*NeedObj)->GetNumberField(TEXT("damageRate"));

            FNeedRuntime Runtime;
            Runtime.Config = Config;
            Runtime.Current = Config.StartValue;
            Needs.Add(Id, Runtime);
        }
    }

    NeedCount = Needs.Num();

    // Parse damage config
    const TSharedPtr<FJsonObject>* DmgObj;
    if ((*SurvObj)->TryGetObjectField(TEXT("damageConfig"), DmgObj))
    {
        DamageConfig.bEnabled = (*DmgObj)->GetBoolField(TEXT("enabled"));
        DamageConfig.TickMode = (*DmgObj)->GetStringField(TEXT("tickMode"));
        DamageConfig.GlobalDamageMultiplier = (*DmgObj)->GetNumberField(TEXT("globalDamageMultiplier"));
    }

    // Parse temperature config
    const TSharedPtr<FJsonObject>* TempObj;
    if ((*SurvObj)->TryGetObjectField(TEXT("temperatureConfig"), TempObj))
    {
        TemperatureConfig.bEnvironmentDriven = (*TempObj)->GetBoolField(TEXT("environmentDriven"));
        TemperatureConfig.bCriticalAtBothExtremes = (*TempObj)->GetBoolField(TEXT("criticalAtBothExtremes"));
        const TSharedPtr<FJsonObject>* ComfortObj;
        if ((*TempObj)->TryGetObjectField(TEXT("comfortZone"), ComfortObj))
        {
            TemperatureConfig.ComfortZoneMin = (*ComfortObj)->GetNumberField(TEXT("min"));
            TemperatureConfig.ComfortZoneMax = (*ComfortObj)->GetNumberField(TEXT("max"));
        }
    }

    // Parse stamina config
    const TSharedPtr<FJsonObject>* StamObj;
    if ((*SurvObj)->TryGetObjectField(TEXT("staminaConfig"), StamObj))
    {
        StaminaConfig.bActionDriven = (*StamObj)->GetBoolField(TEXT("actionDriven"));
        StaminaConfig.RecoveryRate = (*StamObj)->GetNumberField(TEXT("recoveryRate"));
    }

    // Parse modifier presets
    const TArray<TSharedPtr<FJsonValue>>* ModArr;
    if ((*SurvObj)->TryGetArrayField(TEXT("modifierPresets"), ModArr))
    {
        for (const auto& ModVal : *ModArr)
        {
            const TSharedPtr<FJsonObject>* ModObj;
            if (!ModVal->TryGetObject(ModObj)) continue;

            FInsimulSurvivalModifierPreset Preset;
            Preset.Id = (*ModObj)->GetStringField(TEXT("id"));
            Preset.Name = (*ModObj)->GetStringField(TEXT("name"));
            Preset.NeedType = StringToNeedType((*ModObj)->GetStringField(TEXT("needType")));
            Preset.RateMultiplier = (*ModObj)->GetNumberField(TEXT("rateMultiplier"));
            Preset.Duration = (*ModObj)->GetNumberField(TEXT("duration"));
            Preset.Source = (*ModObj)->GetStringField(TEXT("source"));
            ModifierPresets.Add(Preset);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] SurvivalSystem loaded %d needs, %d modifier presets"), NeedCount, ModifierPresets.Num());
}

void USurvivalSystem::Update(float DeltaTime)
{
    // Tick down modifier durations and remove expired ones
    for (int32 i = ActiveModifiers.Num() - 1; i >= 0; --i)
    {
        if (ActiveModifiers[i].RemainingTime > 0.f)
        {
            ActiveModifiers[i].RemainingTime -= DeltaTime;
            if (ActiveModifiers[i].RemainingTime <= 0.f)
            {
                ActiveModifiers.RemoveAt(i);
            }
        }
    }

    for (auto& Pair : Needs)
    {
        const FString& NeedId = Pair.Key;
        FNeedRuntime& Need = Pair.Value;
        const FInsimulNeedConfig& Cfg = Need.Config;

        // Apply decay (only for time-based needs with positive decay rate)
        if (Cfg.DecayRate > 0.f)
        {
            float Multiplier = GetDecayMultiplier(NeedId);
            Need.Current = FMath::Clamp(Need.Current - Cfg.DecayRate * Multiplier * DeltaTime, 0.f, Cfg.MaxValue);
        }

        // Stamina passive recovery
        if (NeedId == TEXT("stamina") && StaminaConfig.RecoveryRate > 0.f)
        {
            Need.Current = FMath::Clamp(Need.Current + StaminaConfig.RecoveryRate * DeltaTime, 0.f, Cfg.MaxValue);
        }

        // Check thresholds
        bool bIsCritical;
        if (NeedId == TEXT("temperature") && TemperatureConfig.bCriticalAtBothExtremes)
        {
            bIsCritical = Need.Current <= Cfg.CriticalThreshold || Need.Current >= (Cfg.MaxValue - Cfg.CriticalThreshold);
        }
        else
        {
            bIsCritical = Need.Current <= Cfg.CriticalThreshold;
        }
        bool bIsWarning = !bIsCritical && Need.Current <= Cfg.WarningThreshold;

        // Fire state transition events
        if (bIsCritical && !Need.bWasCritical)
        {
            FireEvent(EInsimulSurvivalEventType::NeedCritical, NeedId, Need.Current,
                FString::Printf(TEXT("%s is critically low!"), *Cfg.Name));
        }
        else if (bIsWarning && !Need.bWasWarning)
        {
            FireEvent(EInsimulSurvivalEventType::NeedWarning, NeedId, Need.Current,
                FString::Printf(TEXT("%s is getting low"), *Cfg.Name));
        }
        else if (!bIsCritical && !bIsWarning && (Need.bWasCritical || Need.bWasWarning))
        {
            FireEvent(EInsimulSurvivalEventType::NeedRestored, NeedId, Need.Current,
                FString::Printf(TEXT("%s restored"), *Cfg.Name));
        }

        Need.bWasCritical = bIsCritical;
        Need.bWasWarning = bIsWarning;

        // Apply damage when need is depleted
        if (DamageConfig.bEnabled && Need.Current <= 0.f && Cfg.DamageRate > 0.f)
        {
            float Damage = Cfg.DamageRate * DamageConfig.GlobalDamageMultiplier * DeltaTime;
            FireEvent(EInsimulSurvivalEventType::DamageFromNeed, NeedId, Damage,
                FString::Printf(TEXT("Taking damage from %s deprivation"), *Cfg.Name));
        }
    }
}

float USurvivalSystem::GetNeedValue(const FString& NeedId) const
{
    const FNeedRuntime* Need = Needs.Find(NeedId);
    return Need ? Need->Current : 0.f;
}

float USurvivalSystem::GetNeedPercent(const FString& NeedId) const
{
    const FNeedRuntime* Need = Needs.Find(NeedId);
    if (!Need || Need->Config.MaxValue <= 0.f) return 0.f;
    return Need->Current / Need->Config.MaxValue;
}

void USurvivalSystem::RestoreNeed(const FString& NeedId, float Amount)
{
    FNeedRuntime* Need = Needs.Find(NeedId);
    if (!Need) return;

    float OldValue = Need->Current;
    Need->Current = FMath::Clamp(Need->Current + Amount, 0.f, Need->Config.MaxValue);

    if (Need->Current > OldValue && Need->Current >= Need->Config.WarningThreshold && OldValue < Need->Config.WarningThreshold)
    {
        FireEvent(EInsimulSurvivalEventType::NeedSatisfied, NeedId, Need->Current,
            FString::Printf(TEXT("%s satisfied"), *Need->Config.Name));
    }
}

bool USurvivalSystem::ConsumeStamina(float Amount)
{
    FNeedRuntime* Need = Needs.Find(TEXT("stamina"));
    if (!Need) return false;
    if (Need->Current < Amount) return false;

    Need->Current = FMath::Clamp(Need->Current - Amount, 0.f, Need->Config.MaxValue);
    return true;
}

void USurvivalSystem::RecoverStamina(float Amount)
{
    FNeedRuntime* Need = Needs.Find(TEXT("stamina"));
    if (!Need) return;
    Need->Current = FMath::Clamp(Need->Current + Amount, 0.f, Need->Config.MaxValue);
}

void USurvivalSystem::SetTemperature(float Value)
{
    FNeedRuntime* Need = Needs.Find(TEXT("temperature"));
    if (!Need) return;
    Need->Current = FMath::Clamp(Value, 0.f, Need->Config.MaxValue);
}

void USurvivalSystem::AddModifier(const FString& ModifierId, const FString& NeedId, float RateMultiplier, float Duration)
{
    // Remove existing modifier with same ID
    RemoveModifier(ModifierId);

    FActiveModifier Mod;
    Mod.Id = ModifierId;
    Mod.NeedId = NeedId;
    Mod.RateMultiplier = RateMultiplier;
    Mod.RemainingTime = Duration; // <= 0 means permanent
    ActiveModifiers.Add(Mod);
}

void USurvivalSystem::RemoveModifier(const FString& ModifierId)
{
    ActiveModifiers.RemoveAll([&](const FActiveModifier& M) { return M.Id == ModifierId; });
}

bool USurvivalSystem::IsAnyCritical() const
{
    for (const auto& Pair : Needs)
    {
        if (Pair.Value.bWasCritical) return true;
    }
    return false;
}

bool USurvivalSystem::IsAnyWarning() const
{
    for (const auto& Pair : Needs)
    {
        if (Pair.Value.bWasWarning) return true;
    }
    return false;
}

float USurvivalSystem::GetDecayMultiplier(const FString& NeedId) const
{
    float Multiplier = 1.f;
    for (const auto& Mod : ActiveModifiers)
    {
        if (Mod.NeedId == NeedId)
        {
            Multiplier *= Mod.RateMultiplier;
        }
    }
    return Multiplier;
}

void USurvivalSystem::FireEvent(EInsimulSurvivalEventType EventType, const FString& NeedId, float Value, const FString& Message)
{
    FInsimulSurvivalEvent Event;
    Event.EventType = EventType;
    Event.NeedType = StringToNeedType(NeedId);
    Event.Value = Value;
    Event.Message = Message;
    OnSurvivalEvent.Broadcast(Event);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SurvivalEvent: %s (need=%s, value=%.1f)"), *Message, *NeedId, Value);
}
