#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Components/StaticMeshComponent.h"
#include "../Data/NPCData.h"
#include "NPCCharacter.generated.h"

UENUM(BlueprintType)
enum class ENPCState : uint8
{
    Idle        UMETA(DisplayName = "Idle"),
    Patrol      UMETA(DisplayName = "Patrol"),
    Talking     UMETA(DisplayName = "Talking"),
    Fleeing     UMETA(DisplayName = "Fleeing"),
    Pursuing    UMETA(DisplayName = "Pursuing"),
    Alert       UMETA(DisplayName = "Alert"),
    ScheduleMove UMETA(DisplayName = "Schedule Move"),
};

UCLASS()
class INSIMULEXPORT_API ANPCCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    ANPCCharacter();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

    /** Initialize from IR NPC data */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    void InitFromData(const FString& InCharacterId, const FString& InNPCRole,
                      FVector InHomePosition, float InPatrolRadius, float InDisposition);

    /** Set this NPC's daily schedule */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    void SetSchedule(const FNPCSchedule& InSchedule);

    /** Get the current schedule activity based on game hour */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|NPC")
    EScheduleActivity GetCurrentScheduleActivity() const;

    /** Get the destination building for the current schedule block */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Insimul|NPC")
    FString GetCurrentScheduleBuildingId() const;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    FString CharacterId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    FString NPCRole;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    FVector HomePosition = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    float PatrolRadius = 20.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    float Disposition = 50.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    ENPCState CurrentState = ENPCState::Idle;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    FString SettlementId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC")
    TArray<FString> QuestIds;

    /** NPC daily schedule */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Schedule")
    FNPCSchedule Schedule;

    /** Whether this NPC has a valid schedule assigned */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC|Schedule")
    bool bHasSchedule = false;

    /** The schedule block index currently being executed */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC|Schedule")
    int32 CurrentBlockIndex = -1;

    /** Target position for schedule-driven movement */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC|Schedule")
    FVector ScheduleTargetPosition = FVector::ZeroVector;

    UFUNCTION(BlueprintCallable, Category = "NPC")
    void StartDialogue(AActor* Initiator);

    /** Optional visual mesh — populated from imported GLB asset when CharacterMesh is set. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC|Appearance")
    UStaticMeshComponent* VisualMesh;

    /** Assign an imported Static Mesh here (or via Blueprint) to override the capsule visual. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Appearance")
    UStaticMesh* CharacterMesh;

    // Procedural body parts
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* HeadMesh;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* TorsoMesh;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* UpperArmL;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* UpperArmR;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* LowerArmL;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* LowerArmR;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* UpperLegL;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* UpperLegR;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* LowerLegL;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* LowerLegR;

private:
    void ApplyBodyColors();
    static uint32 HashString(const FString& Str);
    /** Evaluate schedule and update state based on current game hour */
    void EvaluateSchedule(float GameHour);

    /** Find the active schedule block for a given hour */
    int32 FindBlockForHour(float Hour) const;

    /** Map a schedule activity to an NPC state */
    ENPCState ActivityToState(EScheduleActivity Activity) const;

    /** Move toward ScheduleTargetPosition */
    void MoveTowardTarget(float DeltaTime);

    /** Cached last-evaluated hour to avoid redundant updates */
    float LastEvaluatedHour = -1.f;
};
