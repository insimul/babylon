#include "CombatSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UCombatSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] CombatSystem initialized"));
}

void UCombatSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UCombatSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* CombatObj;
    if (Root->TryGetObjectField(TEXT("combat"), CombatObj))
    {
        CombatStyle = (*CombatObj)->GetStringField(TEXT("style"));
        const TSharedPtr<FJsonObject>* Settings;
        if ((*CombatObj)->TryGetObjectField(TEXT("settings"), Settings))
        {
            BaseDamage = (*Settings)->GetNumberField(TEXT("baseDamage"));
            CriticalChance = (*Settings)->GetNumberField(TEXT("criticalChance"));
            CriticalMultiplier = (*Settings)->GetNumberField(TEXT("criticalMultiplier"));
            BlockReduction = (*Settings)->GetNumberField(TEXT("blockReduction"));
            DodgeChance = (*Settings)->GetNumberField(TEXT("dodgeChance"));
        }
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Combat style: %s, BaseDamage: %.1f"), *CombatStyle, BaseDamage);
    }
}

float UCombatSystem::CalculateDamage(float BaseDmg, bool bIsCritical)
{
    float Dmg = BaseDmg > 0.f ? BaseDmg : BaseDamage;
    if (bIsCritical && FMath::FRand() < CriticalChance)
    {
        Dmg *= CriticalMultiplier;
    }
    return FMath::Max(0.f, Dmg);
}
