#include "SettlementSceneManager.h"

void USettlementSceneManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] SettlementSceneManager initialized (max 3D: %d)"), MAX_SETTLEMENTS_3D);
}

void USettlementSceneManager::RegisterSettlement(FString Id, FVector Center, float Radius, int32 Population)
{
    // Check for duplicate
    for (FSettlementSceneData& Existing : Settlements)
    {
        if (Existing.Id == Id)
        {
            Existing.Center = Center;
            Existing.Radius = Radius;
            Existing.Population = Population;
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Updated settlement '%s'"), *Id);
            return;
        }
    }

    FSettlementSceneData Data;
    Data.Id = Id;
    Data.Center = Center;
    Data.Radius = Radius;
    Data.Population = Population;
    Data.CurrentLOD = ESettlementLOD::Hidden;
    Data.bIsVisible = false;

    Settlements.Add(Data);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Registered settlement '%s' at (%.1f, %.1f, %.1f) radius %.1f pop %d"),
        *Id, Center.X, Center.Y, Center.Z, Radius, Population);
}

void USettlementSceneManager::UpdateVisibility(FVector PlayerPos)
{
    // Sort settlements by distance to player
    Settlements.Sort([&PlayerPos](const FSettlementSceneData& A, const FSettlementSceneData& B)
    {
        return FVector::Dist(A.Center, PlayerPos) < FVector::Dist(B.Center, PlayerPos);
    });

    int32 FullDetailCount = 0;

    for (FSettlementSceneData& Settlement : Settlements)
    {
        const float Distance = FVector::Dist(Settlement.Center, PlayerPos);
        const ESettlementLOD DesiredLOD = GetLODForDistance(Distance);

        // Enforce MAX_SETTLEMENTS_3D limit for full-detail rendering
        if (DesiredLOD == ESettlementLOD::Full && FullDetailCount >= MAX_SETTLEMENTS_3D)
        {
            Settlement.CurrentLOD = ESettlementLOD::Medium;
        }
        else
        {
            Settlement.CurrentLOD = DesiredLOD;
        }

        if (Settlement.CurrentLOD == ESettlementLOD::Full)
        {
            FullDetailCount++;
        }

        Settlement.bIsVisible = (Settlement.CurrentLOD != ESettlementLOD::Hidden);
    }
}

TArray<FSettlementSceneData> USettlementSceneManager::GetActiveSettlements() const
{
    TArray<FSettlementSceneData> Active;
    for (const FSettlementSceneData& Settlement : Settlements)
    {
        if (Settlement.bIsVisible)
        {
            Active.Add(Settlement);
        }
    }
    return Active;
}

bool USettlementSceneManager::GetSettlement(const FString& Id, FSettlementSceneData& OutData) const
{
    for (const FSettlementSceneData& Settlement : Settlements)
    {
        if (Settlement.Id == Id)
        {
            OutData = Settlement;
            return true;
        }
    }
    return false;
}

ESettlementLOD USettlementSceneManager::GetLODForDistance(float Distance)
{
    if (Distance <= LOD_FULL_DISTANCE)      return ESettlementLOD::Full;
    if (Distance <= LOD_MEDIUM_DISTANCE)    return ESettlementLOD::Medium;
    if (Distance <= LOD_LOW_DISTANCE)       return ESettlementLOD::Low;
    if (Distance <= LOD_BILLBOARD_DISTANCE) return ESettlementLOD::Billboard;
    return ESettlementLOD::Hidden;
}
