#include "CombatModeManager.h"

void UCombatModeManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    PlayerHealth.CurrentHP = 100.0f;
    PlayerHealth.MaxHP = 100.0f;
    PlayerHealth.bIsEnemy = false;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] CombatModeManager initialized"));
}

void UCombatModeManager::Deinitialize()
{
    Super::Deinitialize();
}

void UCombatModeManager::SetCombatMode(ECombatMode NewMode)
{
    CurrentCombatMode = NewMode;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Combat mode set to %d"), static_cast<int32>(NewMode));
}

ECombatMode UCombatModeManager::GetCombatMode() const
{
    return CurrentCombatMode;
}

void UCombatModeManager::StartCombat(AActor* EnemyActor)
{
    if (bInCombat || !EnemyActor) return;

    CurrentEnemy = EnemyActor;
    bInCombat = true;
    bIsBlocking = false;
    bIsDodging = false;
    TurnActionQueue.Empty();

    // Set up enemy health
    EnemyHealth.CurrentHP = 100.0f;
    EnemyHealth.MaxHP = 100.0f;
    EnemyHealth.bIsEnemy = true;

    OnCombatStarted.Broadcast(EnemyActor);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Combat started with %s (mode: %d)"),
           *EnemyActor->GetName(), static_cast<int32>(CurrentCombatMode));
}

void UCombatModeManager::EndCombat()
{
    if (!bInCombat) return;

    AwardCombatXP();

    bInCombat = false;
    bIsBlocking = false;
    bIsDodging = false;
    CurrentEnemy = nullptr;
    TurnActionQueue.Empty();

    OnCombatEnded.Broadcast();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Combat ended"));
}

void UCombatModeManager::PlayerAttack()
{
    if (!bInCombat || !CurrentEnemy) return;

    if (CurrentCombatMode == ECombatMode::TurnBased)
    {
        TurnActionQueue.Add(TEXT("Attack"));
        ProcessTurnQueue();
        return;
    }

    // Real-time / ranged: immediate damage
    float Damage = CalculateDamage(10.0f, 0.15f, 2.0f);
    EnemyHealth.CurrentHP = FMath::Max(0.0f, EnemyHealth.CurrentHP - Damage);

    OnDamageDealt.Broadcast(CurrentEnemy, Damage);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Player attacked for %.1f damage (enemy HP: %.1f/%.1f)"),
           Damage, EnemyHealth.CurrentHP, EnemyHealth.MaxHP);

    if (EnemyHealth.CurrentHP <= 0.0f)
    {
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Enemy defeated!"));
        EndCombat();
    }
}

void UCombatModeManager::PlayerBlock()
{
    if (!bInCombat) return;

    if (CurrentCombatMode == ECombatMode::TurnBased)
    {
        TurnActionQueue.Add(TEXT("Block"));
        ProcessTurnQueue();
        return;
    }

    bIsBlocking = true;
    bIsDodging = false;
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Player blocking"));
}

void UCombatModeManager::PlayerDodge()
{
    if (!bInCombat) return;

    if (CurrentCombatMode == ECombatMode::TurnBased)
    {
        TurnActionQueue.Add(TEXT("Dodge"));
        ProcessTurnQueue();
        return;
    }

    bIsDodging = true;
    bIsBlocking = false;
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Player dodging"));
}

float UCombatModeManager::CalculateDamage(float BaseDamage, float CritChance, float CritMultiplier)
{
    float Roll = FMath::FRand(); // 0.0 to 1.0
    bool bIsCrit = Roll < CritChance;

    float FinalDamage = BaseDamage;
    if (bIsCrit)
    {
        FinalDamage *= CritMultiplier;
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Critical hit! %.1f -> %.1f"), BaseDamage, FinalDamage);
    }

    // Apply variance (+/- 10%)
    float Variance = FMath::FRandRange(0.9f, 1.1f);
    FinalDamage *= Variance;

    return FMath::Max(1.0f, FinalDamage);
}

void UCombatModeManager::ProcessTurnQueue()
{
    if (TurnActionQueue.Num() == 0) return;

    FString Action = TurnActionQueue[0];
    TurnActionQueue.RemoveAt(0);

    if (Action == TEXT("Attack"))
    {
        float Damage = CalculateDamage(10.0f, 0.15f, 2.0f);
        EnemyHealth.CurrentHP = FMath::Max(0.0f, EnemyHealth.CurrentHP - Damage);
        OnDamageDealt.Broadcast(CurrentEnemy, Damage);

        if (EnemyHealth.CurrentHP <= 0.0f)
        {
            EndCombat();
            return;
        }
    }
    else if (Action == TEXT("Block"))
    {
        bIsBlocking = true;
        bIsDodging = false;
    }
    else if (Action == TEXT("Dodge"))
    {
        bIsDodging = true;
        bIsBlocking = false;
    }

    // Enemy turn (simplified AI)
    if (bInCombat && CurrentEnemy)
    {
        float EnemyDamage = CalculateDamage(8.0f, 0.1f, 1.5f);

        if (bIsBlocking)
        {
            EnemyDamage *= 0.3f; // Block reduces damage by 70%
            bIsBlocking = false;
        }
        else if (bIsDodging)
        {
            float DodgeRoll = FMath::FRand();
            if (DodgeRoll < 0.5f)
            {
                EnemyDamage = 0.0f; // 50% dodge chance
            }
            bIsDodging = false;
        }

        PlayerHealth.CurrentHP = FMath::Max(0.0f, PlayerHealth.CurrentHP - EnemyDamage);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Turn-based: enemy dealt %.1f damage (player HP: %.1f/%.1f)"),
               EnemyDamage, PlayerHealth.CurrentHP, PlayerHealth.MaxHP);
    }
}

void UCombatModeManager::AwardCombatXP()
{
    // TODO: Dispatch XP reward through EventBus
    int32 XPReward = 25;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Combat XP awarded: %d"), XPReward);
}
