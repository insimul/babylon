#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NPCModularAssembler.generated.h"

class UStaticMeshComponent;
class UStaticMesh;

/**
 * Modular NPC assembly subsystem.
 * Assembles NPC meshes from body parts, hair, and outfits using a deterministic
 * seed-based selection system. Supports fallback chains for missing assets.
 */
UENUM(BlueprintType)
enum class ENPCBodyType : uint8
{
    Average    UMETA(DisplayName = "Average"),
    Athletic   UMETA(DisplayName = "Athletic"),
    Heavy      UMETA(DisplayName = "Heavy"),
    Slim       UMETA(DisplayName = "Slim")
};

UENUM(BlueprintType)
enum class ENPCGender : uint8
{
    Male       UMETA(DisplayName = "Male"),
    Female     UMETA(DisplayName = "Female"),
    NonBinary  UMETA(DisplayName = "NonBinary")
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FNPCAssemblyRequest
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|NPC")
    ENPCGender Gender = ENPCGender::Male;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|NPC")
    ENPCBodyType BodyType = ENPCBodyType::Average;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|NPC")
    FString Genre;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|NPC")
    FString Role;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|NPC")
    int32 Seed = 0;
};

USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FNPCAssemblyResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|NPC")
    UStaticMesh* BodyMesh = nullptr;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|NPC")
    UStaticMesh* HairMesh = nullptr;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul|NPC")
    UStaticMesh* OutfitMesh = nullptr;
};

UCLASS()
class INSIMULEXPORT_API UNPCModularAssembler : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Assemble an NPC from modular parts based on character properties */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    FNPCAssemblyResult AssembleNPC(const FString& CharacterId, ENPCGender Gender,
                                    ENPCBodyType BodyType, const FString& Genre, const FString& Role);

    /** Assemble an NPC from a request struct */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    FNPCAssemblyResult AssembleNPCFromRequest(const FString& CharacterId, const FNPCAssemblyRequest& Request);

    /** Load body part meshes from content directory */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    void LoadBodyParts();

    /** Load hair style meshes from content directory */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    void LoadHairStyles();

    /** Load outfit meshes from content directory */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    void LoadOutfits();

    /** Select a hair style for a character using deterministic seed */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    FString SelectHairForCharacter(const FString& CharacterId, ENPCGender Gender, int32 Seed);

    /** Select an outfit for a character using deterministic seed */
    UFUNCTION(BlueprintCallable, Category = "Insimul|NPC")
    FString SelectOutfitForCharacter(const FString& CharacterId, const FString& Role, ENPCGender Gender, int32 Seed);

private:
    /** Cached body part meshes keyed by asset path */
    TMap<FString, UStaticMesh*> CachedBodyParts;

    /** Available body part paths keyed by body type */
    TMap<ENPCBodyType, TArray<FString>> BodyPartPaths;

    /** Available hair style paths keyed by gender */
    TMap<ENPCGender, TArray<FString>> HairStylePaths;

    /** Available outfit paths keyed by role */
    TMap<FString, TArray<FString>> OutfitPaths;

    /** Generic fallback paths */
    TArray<FString> GenericBodyPaths;
    TArray<FString> GenericHairPaths;
    TArray<FString> GenericOutfitPaths;

    /** Deterministic hash for seed-based selection */
    int32 SeededHash(const FString& Input, int32 Seed) const;
};
