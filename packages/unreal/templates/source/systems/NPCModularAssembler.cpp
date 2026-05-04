#include "NPCModularAssembler.h"
#include "Engine/StaticMesh.h"

void UNPCModularAssembler::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LoadBodyParts();
    LoadHairStyles();
    LoadOutfits();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCModularAssembler initialized — %d cached body parts"), CachedBodyParts.Num());
}

void UNPCModularAssembler::LoadBodyParts()
{
    // Load body meshes from Content/Assets/Characters/Bodies/
    // Organized by body type subdirectories
    BodyPartPaths.Add(ENPCBodyType::Average,  { TEXT("/Game/Assets/Characters/Bodies/Average/body_average") });
    BodyPartPaths.Add(ENPCBodyType::Athletic, { TEXT("/Game/Assets/Characters/Bodies/Athletic/body_athletic") });
    BodyPartPaths.Add(ENPCBodyType::Heavy,    { TEXT("/Game/Assets/Characters/Bodies/Heavy/body_heavy") });
    BodyPartPaths.Add(ENPCBodyType::Slim,     { TEXT("/Game/Assets/Characters/Bodies/Slim/body_slim") });

    GenericBodyPaths.Add(TEXT("/Game/Assets/Characters/Bodies/Generic/body_default"));

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded body part paths for %d body types"), BodyPartPaths.Num());
}

void UNPCModularAssembler::LoadHairStyles()
{
    // Load hair meshes from Content/Assets/Characters/Hair/
    HairStylePaths.Add(ENPCGender::Male, {
        TEXT("/Game/Assets/Characters/Hair/Male/hair_short_01"),
        TEXT("/Game/Assets/Characters/Hair/Male/hair_short_02"),
        TEXT("/Game/Assets/Characters/Hair/Male/hair_medium_01")
    });
    HairStylePaths.Add(ENPCGender::Female, {
        TEXT("/Game/Assets/Characters/Hair/Female/hair_long_01"),
        TEXT("/Game/Assets/Characters/Hair/Female/hair_long_02"),
        TEXT("/Game/Assets/Characters/Hair/Female/hair_medium_01")
    });
    HairStylePaths.Add(ENPCGender::NonBinary, {
        TEXT("/Game/Assets/Characters/Hair/NonBinary/hair_short_01"),
        TEXT("/Game/Assets/Characters/Hair/NonBinary/hair_medium_01")
    });

    GenericHairPaths.Add(TEXT("/Game/Assets/Characters/Hair/Generic/hair_default"));

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded hair style paths for %d gender categories"), HairStylePaths.Num());
}

void UNPCModularAssembler::LoadOutfits()
{
    // Load outfit meshes from Content/Assets/Characters/Outfits/
    // Organized by role
    OutfitPaths.Add(TEXT("guard"), {
        TEXT("/Game/Assets/Characters/Outfits/Guard/outfit_guard_01"),
        TEXT("/Game/Assets/Characters/Outfits/Guard/outfit_guard_02")
    });
    OutfitPaths.Add(TEXT("merchant"), {
        TEXT("/Game/Assets/Characters/Outfits/Merchant/outfit_merchant_01"),
        TEXT("/Game/Assets/Characters/Outfits/Merchant/outfit_merchant_02")
    });
    OutfitPaths.Add(TEXT("blacksmith"), {
        TEXT("/Game/Assets/Characters/Outfits/Blacksmith/outfit_blacksmith_01")
    });
    OutfitPaths.Add(TEXT("farmer"), {
        TEXT("/Game/Assets/Characters/Outfits/Farmer/outfit_farmer_01")
    });
    OutfitPaths.Add(TEXT("noble"), {
        TEXT("/Game/Assets/Characters/Outfits/Noble/outfit_noble_01"),
        TEXT("/Game/Assets/Characters/Outfits/Noble/outfit_noble_02")
    });

    GenericOutfitPaths.Add(TEXT("/Game/Assets/Characters/Outfits/Generic/outfit_default"));

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded outfit paths for %d roles"), OutfitPaths.Num());
}

int32 UNPCModularAssembler::SeededHash(const FString& Input, int32 Seed) const
{
    uint32 Hash = GetTypeHash(Input);
    Hash ^= static_cast<uint32>(Seed) * 2654435761u; // Knuth multiplicative hash
    return static_cast<int32>(Hash & 0x7FFFFFFF);
}

FString UNPCModularAssembler::SelectHairForCharacter(const FString& CharacterId, ENPCGender Gender, int32 Seed)
{
    const TArray<FString>* Styles = HairStylePaths.Find(Gender);
    if (Styles && Styles->Num() > 0)
    {
        int32 Index = SeededHash(CharacterId, Seed) % Styles->Num();
        return (*Styles)[Index];
    }

    // Fallback to generic
    if (GenericHairPaths.Num() > 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] No hair styles found for gender, using generic fallback for: %s"), *CharacterId);
        return GenericHairPaths[0];
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] No hair assets available for character: %s"), *CharacterId);
    return FString();
}

FString UNPCModularAssembler::SelectOutfitForCharacter(const FString& CharacterId, const FString& Role, ENPCGender Gender, int32 Seed)
{
    // Fallback chain: role-specific -> genre+gender -> generic
    const TArray<FString>* RoleOutfits = OutfitPaths.Find(Role.ToLower());
    if (RoleOutfits && RoleOutfits->Num() > 0)
    {
        int32 Index = SeededHash(CharacterId, Seed) % RoleOutfits->Num();
        return (*RoleOutfits)[Index];
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] No role-specific outfit for '%s', trying generic fallback for: %s"), *Role, *CharacterId);

    if (GenericOutfitPaths.Num() > 0)
    {
        return GenericOutfitPaths[0];
    }

    UE_LOG(LogTemp, Warning, TEXT("[Insimul] No outfit assets available for character: %s"), *CharacterId);
    return FString();
}

FNPCAssemblyResult UNPCModularAssembler::AssembleNPC(const FString& CharacterId, ENPCGender Gender,
                                                      ENPCBodyType BodyType, const FString& Genre, const FString& Role)
{
    FNPCAssemblyRequest Request;
    Request.Gender = Gender;
    Request.BodyType = BodyType;
    Request.Genre = Genre;
    Request.Role = Role;
    Request.Seed = SeededHash(CharacterId, 0);
    return AssembleNPCFromRequest(CharacterId, Request);
}

FNPCAssemblyResult UNPCModularAssembler::AssembleNPCFromRequest(const FString& CharacterId, const FNPCAssemblyRequest& Request)
{
    FNPCAssemblyResult Result;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Assembling NPC: %s (Role: %s)"), *CharacterId, *Request.Role);

    // Select body mesh — fallback chain: body type -> generic
    FString BodyPath;
    const TArray<FString>* BodyPaths = BodyPartPaths.Find(Request.BodyType);
    if (BodyPaths && BodyPaths->Num() > 0)
    {
        int32 Index = SeededHash(CharacterId, Request.Seed) % BodyPaths->Num();
        BodyPath = (*BodyPaths)[Index];
    }
    else if (GenericBodyPaths.Num() > 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] No body parts for body type, using generic fallback for: %s"), *CharacterId);
        BodyPath = GenericBodyPaths[0];
    }

    if (!BodyPath.IsEmpty())
    {
        // Check cache first
        UStaticMesh** CachedMesh = CachedBodyParts.Find(BodyPath);
        if (CachedMesh)
        {
            Result.BodyMesh = *CachedMesh;
        }
        else
        {
            UStaticMesh* LoadedMesh = LoadObject<UStaticMesh>(nullptr, *BodyPath);
            if (LoadedMesh)
            {
                CachedBodyParts.Add(BodyPath, LoadedMesh);
                Result.BodyMesh = LoadedMesh;
            }
            else
            {
                UE_LOG(LogTemp, Warning, TEXT("[Insimul] Body mesh not found: %s (this is normal if character assets weren't imported)"), *BodyPath);
            }
        }
    }

    // Select hair
    FString HairPath = SelectHairForCharacter(CharacterId, Request.Gender, Request.Seed);
    if (!HairPath.IsEmpty())
    {
        Result.HairMesh = LoadObject<UStaticMesh>(nullptr, *HairPath);
        if (!Result.HairMesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] Hair mesh not found: %s"), *HairPath);
        }
    }

    // Select outfit — fallback: role-specific -> body type -> genre+gender -> generic
    FString OutfitPath = SelectOutfitForCharacter(CharacterId, Request.Role, Request.Gender, Request.Seed);
    if (!OutfitPath.IsEmpty())
    {
        Result.OutfitMesh = LoadObject<UStaticMesh>(nullptr, *OutfitPath);
        if (!Result.OutfitMesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("[Insimul] Outfit mesh not found: %s"), *OutfitPath);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC assembly complete for: %s (Body: %s, Hair: %s, Outfit: %s)"),
           *CharacterId,
           Result.BodyMesh ? TEXT("OK") : TEXT("MISSING"),
           Result.HairMesh ? TEXT("OK") : TEXT("MISSING"),
           Result.OutfitMesh ? TEXT("OK") : TEXT("MISSING"));

    return Result;
}
