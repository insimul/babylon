#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "PlayerCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UTextBlock;
class UBuildingInteriorSystem;
class ANPCCharacter;

UCLASS()
class INSIMULEXPORT_API APlayerCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    APlayerCharacter();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    // Camera
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
    USpringArmComponent* SpringArm;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
    UCameraComponent* Camera;

    // Stats
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    float Health = {{PLAYER_INITIAL_HEALTH}}.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    float MaxHealth = {{PLAYER_INITIAL_HEALTH}}.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    float Energy = {{PLAYER_INITIAL_ENERGY}}.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    int32 Gold = {{PLAYER_INITIAL_GOLD}};

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
    float MoveSpeed = {{PLAYER_SPEED}}.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
    float JumpStrength = {{PLAYER_JUMP_HEIGHT}}.0f;

    // Movement input
    void MoveForward(float Value);
    void MoveRight(float Value);
    void LookUp(float Value);
    void Turn(float Value);

    UFUNCTION(BlueprintCallable, Category = "Combat")
    void Attack();

    UFUNCTION(BlueprintCallable, Category = "Interaction")
    void Interact();

private:
    // Visible body parts (primitive meshes)
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

    void ApplyBodyMaterials();

    // Interaction system
    void CheckDoorProximity();
    void CheckNPCProximity();

    /** Currently targeted building (for door entry) */
    UPROPERTY() AActor* NearbyBuilding = nullptr;
    FString NearbyBuildingId;
    FString NearbyBuildingRole;
    float NearbyBuildingWidth = 0.f;
    float NearbyBuildingDepth = 0.f;
    int32 NearbyBuildingFloors = 1;

    /** Currently targeted NPC */
    UPROPERTY() ANPCCharacter* NearbyNPC = nullptr;

    /** Interaction prompt text (shown via HUD) */
    FString InteractionPrompt;

    /** Line-trace range for interactions */
    float InteractRange = 250.f;

    /** Door proximity range */
    float DoorProximityRange = 200.f;
};
