#include "InteriorDecorationGenerator.h"
#include "Components/StaticMeshComponent.h"

AInteriorDecorationGenerator::AInteriorDecorationGenerator()
{
    PrimaryActorTick.bCanEverTick = false;

    FurnitureRoot = CreateDefaultSubobject<USceneComponent>(TEXT("FurnitureRoot"));
    RootComponent = FurnitureRoot;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

UStaticMesh* AInteriorDecorationGenerator::LoadFurnitureModel(const FString& AssetPath)
{
    if (AssetPath.IsEmpty()) return nullptr;

    if (UStaticMesh** Found = MeshCache.Find(AssetPath))
    {
        return *Found;
    }

    UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
    if (Mesh)
    {
        MeshCache.Add(AssetPath, Mesh);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded furniture model: %s"), *AssetPath);
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Failed to load furniture model: %s"), *AssetPath);
    }

    return Mesh;
}

void AInteriorDecorationGenerator::PlaceFurnitureSet(ERoomFunction RoomType, FVector RoomOrigin, FVector RoomSize)
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Placing furniture set for room type %d at (%.0f, %.0f, %.0f)"),
        static_cast<int32>(RoomType), RoomOrigin.X, RoomOrigin.Y, RoomOrigin.Z);

    TArray<FFurnitureEntry> Entries = GetFurnitureForRoomType(RoomType);
    PlaceEntriesInRoom(Entries, RoomOrigin, RoomSize);
}

void AInteriorDecorationGenerator::PlaceFurnitureEntry(const FFurnitureEntry& Entry, FVector RoomOrigin)
{
    UStaticMesh* Mesh = LoadFurnitureModel(Entry.AssetPath);
    if (!Mesh)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Skipping furniture '%s' (no mesh at '%s')"),
            *Entry.Name, *Entry.AssetPath);
        return;
    }

    UStaticMeshComponent* SMC = NewObject<UStaticMeshComponent>(this);
    if (!SMC) return;

    SMC->SetupAttachment(FurnitureRoot);
    SMC->RegisterComponent();
    SMC->SetStaticMesh(Mesh);
    SMC->SetRelativeLocation(RoomOrigin + Entry.Offset);
    SMC->SetRelativeRotation(FRotator(0.f, Entry.YawRotation, 0.f));
    SMC->SetRelativeScale3D(FVector(Entry.Scale));

    SpawnedFurniture.Add(SMC);

    if (Entry.bInteractable && !Entry.InteractionTag.IsEmpty())
    {
        RegisterInteraction(Entry.Name, Entry.InteractionTag);
    }

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Placed furniture '%s' at offset (%.0f, %.0f, %.0f)"),
        *Entry.Name, Entry.Offset.X, Entry.Offset.Y, Entry.Offset.Z);
}

void AInteriorDecorationGenerator::ClearFurniture()
{
    for (UStaticMeshComponent* SMC : SpawnedFurniture)
    {
        if (SMC)
        {
            SMC->DestroyComponent();
        }
    }
    SpawnedFurniture.Empty();

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] All furniture cleared"));
}

void AInteriorDecorationGenerator::RegisterInteraction(const FString& FurnitureName, const FString& InteractionTag)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Registered interaction '%s' for furniture '%s'"),
        *InteractionTag, *FurnitureName);

    // TODO: Notify the FurnitureInteractionManager about this interactable piece.
    // The interaction manager handles player proximity checks and input binding
    // for sit, sleep, use, craft, etc.
}

// ---------------------------------------------------------------------------
// Role-based furniture sets
// ---------------------------------------------------------------------------

TArray<FFurnitureEntry> AInteriorDecorationGenerator::GetFurnitureForRole(const FString& Role)
{
    if (Role == TEXT("blacksmith"))   return CreateBlacksmithSet();
    if (Role == TEXT("merchant") || Role == TEXT("shop"))    return CreateMerchantSet();
    if (Role == TEXT("tavern") || Role == TEXT("inn"))       return CreateTavernSet();
    if (Role == TEXT("church") || Role == TEXT("temple"))    return CreateChurchSet();
    if (Role == TEXT("hospital") || Role == TEXT("clinic"))  return CreateMedicalSet();

    // Default: residential
    TArray<FFurnitureEntry> Combined;
    Combined.Append(CreateLivingRoomSet());
    Combined.Append(CreateKitchenSet());
    Combined.Append(CreateBedroomSet());
    return Combined;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::GetFurnitureForRoomType(ERoomFunction RoomType)
{
    switch (RoomType)
    {
    case ERoomFunction::LivingRoom:      return CreateLivingRoomSet();
    case ERoomFunction::Kitchen:         return CreateKitchenSet();
    case ERoomFunction::Bedroom:         return CreateBedroomSet();
    case ERoomFunction::TavernBar:       return CreateTavernSet();
    case ERoomFunction::ChurchSanctuary: return CreateChurchSet();
    case ERoomFunction::Office:          return CreateOfficeSet();
    case ERoomFunction::Medical:         return CreateMedicalSet();
    case ERoomFunction::Forge:           return CreateBlacksmithSet();
    case ERoomFunction::Shop:            return CreateMerchantSet();
    default:                             return TArray<FFurnitureEntry>();
    }
}

// ---------------------------------------------------------------------------
// Private: place entries in room
// ---------------------------------------------------------------------------

void AInteriorDecorationGenerator::PlaceEntriesInRoom(const TArray<FFurnitureEntry>& Entries, FVector RoomOrigin, FVector RoomSize)
{
    const float HalfW = RoomSize.X / 2.f;
    const float HalfD = RoomSize.Y / 2.f;

    for (const FFurnitureEntry& Entry : Entries)
    {
        // Clamp furniture offset within room bounds
        FFurnitureEntry Adjusted = Entry;
        Adjusted.Offset.X = FMath::Clamp(Entry.Offset.X, -HalfW + 30.f, HalfW - 30.f);
        Adjusted.Offset.Y = FMath::Clamp(Entry.Offset.Y, -HalfD + 30.f, HalfD - 30.f);

        PlaceFurnitureEntry(Adjusted, RoomOrigin);
    }
}

// ---------------------------------------------------------------------------
// Furniture set definitions
// ---------------------------------------------------------------------------

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateBlacksmithSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Forge;
    Forge.Name = TEXT("Forge");
    Forge.AssetPath = TEXT("/Game/Furniture/Blacksmith/SM_Forge");
    Forge.Offset = FVector(0.f, -150.f, 0.f);
    Forge.bInteractable = true;
    Forge.InteractionTag = TEXT("craft");
    Set.Add(Forge);

    FFurnitureEntry Anvil;
    Anvil.Name = TEXT("Anvil");
    Anvil.AssetPath = TEXT("/Game/Furniture/Blacksmith/SM_Anvil");
    Anvil.Offset = FVector(100.f, -100.f, 0.f);
    Anvil.bInteractable = true;
    Anvil.InteractionTag = TEXT("craft");
    Set.Add(Anvil);

    FFurnitureEntry ToolRack;
    ToolRack.Name = TEXT("Tool Rack");
    ToolRack.AssetPath = TEXT("/Game/Furniture/Blacksmith/SM_ToolRack");
    ToolRack.Offset = FVector(-150.f, 0.f, 0.f);
    ToolRack.YawRotation = 90.f;
    Set.Add(ToolRack);

    FFurnitureEntry WaterBarrel;
    WaterBarrel.Name = TEXT("Water Barrel");
    WaterBarrel.AssetPath = TEXT("/Game/Furniture/Blacksmith/SM_WaterBarrel");
    WaterBarrel.Offset = FVector(150.f, 50.f, 0.f);
    Set.Add(WaterBarrel);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateMerchantSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Counter;
    Counter.Name = TEXT("Counter");
    Counter.AssetPath = TEXT("/Game/Furniture/Shop/SM_Counter");
    Counter.Offset = FVector(0.f, -100.f, 0.f);
    Counter.bInteractable = true;
    Counter.InteractionTag = TEXT("use");
    Set.Add(Counter);

    FFurnitureEntry DisplayCaseL;
    DisplayCaseL.Name = TEXT("Display Case Left");
    DisplayCaseL.AssetPath = TEXT("/Game/Furniture/Shop/SM_DisplayCase");
    DisplayCaseL.Offset = FVector(-120.f, 50.f, 0.f);
    DisplayCaseL.YawRotation = 90.f;
    Set.Add(DisplayCaseL);

    FFurnitureEntry DisplayCaseR;
    DisplayCaseR.Name = TEXT("Display Case Right");
    DisplayCaseR.AssetPath = TEXT("/Game/Furniture/Shop/SM_DisplayCase");
    DisplayCaseR.Offset = FVector(120.f, 50.f, 0.f);
    DisplayCaseR.YawRotation = -90.f;
    Set.Add(DisplayCaseR);

    FFurnitureEntry Shelves;
    Shelves.Name = TEXT("Wall Shelves");
    Shelves.AssetPath = TEXT("/Game/Furniture/Shop/SM_Shelves");
    Shelves.Offset = FVector(0.f, 150.f, 100.f);
    Set.Add(Shelves);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateTavernSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Bar;
    Bar.Name = TEXT("Bar Counter");
    Bar.AssetPath = TEXT("/Game/Furniture/Tavern/SM_Bar");
    Bar.Offset = FVector(0.f, -150.f, 0.f);
    Bar.bInteractable = true;
    Bar.InteractionTag = TEXT("use");
    Set.Add(Bar);

    // Bar stools
    for (int32 i = 0; i < 4; i++)
    {
        FFurnitureEntry Stool;
        Stool.Name = FString::Printf(TEXT("Bar Stool %d"), i + 1);
        Stool.AssetPath = TEXT("/Game/Furniture/Tavern/SM_Stool");
        Stool.Offset = FVector(-120.f + i * 80.f, -80.f, 0.f);
        Stool.bInteractable = true;
        Stool.InteractionTag = TEXT("sit");
        Set.Add(Stool);
    }

    // Tables with chairs
    for (int32 i = 0; i < 3; i++)
    {
        FFurnitureEntry Table;
        Table.Name = FString::Printf(TEXT("Table %d"), i + 1);
        Table.AssetPath = TEXT("/Game/Furniture/Tavern/SM_Table");
        Table.Offset = FVector(-100.f + i * 100.f, 80.f, 0.f);
        Set.Add(Table);

        FFurnitureEntry ChairA;
        ChairA.Name = FString::Printf(TEXT("Chair %d-A"), i + 1);
        ChairA.AssetPath = TEXT("/Game/Furniture/Tavern/SM_Chair");
        ChairA.Offset = FVector(-100.f + i * 100.f - 40.f, 80.f, 0.f);
        ChairA.YawRotation = 90.f;
        ChairA.bInteractable = true;
        ChairA.InteractionTag = TEXT("sit");
        Set.Add(ChairA);

        FFurnitureEntry ChairB;
        ChairB.Name = FString::Printf(TEXT("Chair %d-B"), i + 1);
        ChairB.AssetPath = TEXT("/Game/Furniture/Tavern/SM_Chair");
        ChairB.Offset = FVector(-100.f + i * 100.f + 40.f, 80.f, 0.f);
        ChairB.YawRotation = -90.f;
        ChairB.bInteractable = true;
        ChairB.InteractionTag = TEXT("sit");
        Set.Add(ChairB);
    }

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateBedroomSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Bed;
    Bed.Name = TEXT("Bed");
    Bed.AssetPath = TEXT("/Game/Furniture/Bedroom/SM_Bed");
    Bed.Offset = FVector(0.f, -100.f, 0.f);
    Bed.bInteractable = true;
    Bed.InteractionTag = TEXT("sleep");
    Set.Add(Bed);

    FFurnitureEntry Wardrobe;
    Wardrobe.Name = TEXT("Wardrobe");
    Wardrobe.AssetPath = TEXT("/Game/Furniture/Bedroom/SM_Wardrobe");
    Wardrobe.Offset = FVector(-150.f, 0.f, 0.f);
    Wardrobe.YawRotation = 90.f;
    Wardrobe.bInteractable = true;
    Wardrobe.InteractionTag = TEXT("use");
    Set.Add(Wardrobe);

    FFurnitureEntry Nightstand;
    Nightstand.Name = TEXT("Nightstand");
    Nightstand.AssetPath = TEXT("/Game/Furniture/Bedroom/SM_Nightstand");
    Nightstand.Offset = FVector(80.f, -100.f, 0.f);
    Set.Add(Nightstand);

    FFurnitureEntry Rug;
    Rug.Name = TEXT("Rug");
    Rug.AssetPath = TEXT("/Game/Furniture/Bedroom/SM_Rug");
    Rug.Offset = FVector(0.f, 50.f, 1.f);
    Set.Add(Rug);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateKitchenSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Table;
    Table.Name = TEXT("Kitchen Table");
    Table.AssetPath = TEXT("/Game/Furniture/Kitchen/SM_Table");
    Table.Offset = FVector(0.f, 0.f, 0.f);
    Set.Add(Table);

    for (int32 i = 0; i < 4; i++)
    {
        FFurnitureEntry Chair;
        Chair.Name = FString::Printf(TEXT("Chair %d"), i + 1);
        Chair.AssetPath = TEXT("/Game/Furniture/Kitchen/SM_Chair");
        const float Angle = i * 90.f;
        Chair.Offset = FVector(FMath::Cos(FMath::DegreesToRadians(Angle)) * 60.f,
                                FMath::Sin(FMath::DegreesToRadians(Angle)) * 60.f, 0.f);
        Chair.YawRotation = Angle + 180.f;
        Chair.bInteractable = true;
        Chair.InteractionTag = TEXT("sit");
        Set.Add(Chair);
    }

    FFurnitureEntry Counter;
    Counter.Name = TEXT("Kitchen Counter");
    Counter.AssetPath = TEXT("/Game/Furniture/Kitchen/SM_Counter");
    Counter.Offset = FVector(-150.f, -50.f, 0.f);
    Counter.YawRotation = 90.f;
    Counter.bInteractable = true;
    Counter.InteractionTag = TEXT("use");
    Set.Add(Counter);

    FFurnitureEntry Shelves;
    Shelves.Name = TEXT("Kitchen Shelves");
    Shelves.AssetPath = TEXT("/Game/Furniture/Kitchen/SM_Shelves");
    Shelves.Offset = FVector(-150.f, 100.f, 100.f);
    Shelves.YawRotation = 90.f;
    Set.Add(Shelves);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateLivingRoomSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Sofa;
    Sofa.Name = TEXT("Sofa");
    Sofa.AssetPath = TEXT("/Game/Furniture/Living/SM_Sofa");
    Sofa.Offset = FVector(0.f, -100.f, 0.f);
    Sofa.bInteractable = true;
    Sofa.InteractionTag = TEXT("sit");
    Set.Add(Sofa);

    FFurnitureEntry CoffeeTable;
    CoffeeTable.Name = TEXT("Coffee Table");
    CoffeeTable.AssetPath = TEXT("/Game/Furniture/Living/SM_CoffeeTable");
    CoffeeTable.Offset = FVector(0.f, 0.f, 0.f);
    Set.Add(CoffeeTable);

    FFurnitureEntry Bookshelf;
    Bookshelf.Name = TEXT("Bookshelf");
    Bookshelf.AssetPath = TEXT("/Game/Furniture/Living/SM_Bookshelf");
    Bookshelf.Offset = FVector(150.f, 0.f, 0.f);
    Bookshelf.YawRotation = -90.f;
    Set.Add(Bookshelf);

    FFurnitureEntry Fireplace;
    Fireplace.Name = TEXT("Fireplace");
    Fireplace.AssetPath = TEXT("/Game/Furniture/Living/SM_Fireplace");
    Fireplace.Offset = FVector(0.f, 150.f, 0.f);
    Set.Add(Fireplace);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateChurchSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Altar;
    Altar.Name = TEXT("Altar");
    Altar.AssetPath = TEXT("/Game/Furniture/Church/SM_Altar");
    Altar.Offset = FVector(0.f, -200.f, 0.f);
    Set.Add(Altar);

    // Pews in rows
    for (int32 Row = 0; Row < 4; Row++)
    {
        for (int32 Side = -1; Side <= 1; Side += 2)
        {
            FFurnitureEntry Pew;
            Pew.Name = FString::Printf(TEXT("Pew %d-%s"), Row + 1, Side < 0 ? TEXT("L") : TEXT("R"));
            Pew.AssetPath = TEXT("/Game/Furniture/Church/SM_Pew");
            Pew.Offset = FVector(Side * 80.f, -50.f + Row * 80.f, 0.f);
            Pew.bInteractable = true;
            Pew.InteractionTag = TEXT("sit");
            Set.Add(Pew);
        }
    }

    FFurnitureEntry Lectern;
    Lectern.Name = TEXT("Lectern");
    Lectern.AssetPath = TEXT("/Game/Furniture/Church/SM_Lectern");
    Lectern.Offset = FVector(0.f, -150.f, 0.f);
    Set.Add(Lectern);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateOfficeSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry Desk;
    Desk.Name = TEXT("Desk");
    Desk.AssetPath = TEXT("/Game/Furniture/Office/SM_Desk");
    Desk.Offset = FVector(0.f, -80.f, 0.f);
    Desk.bInteractable = true;
    Desk.InteractionTag = TEXT("use");
    Set.Add(Desk);

    FFurnitureEntry Chair;
    Chair.Name = TEXT("Desk Chair");
    Chair.AssetPath = TEXT("/Game/Furniture/Office/SM_Chair");
    Chair.Offset = FVector(0.f, -30.f, 0.f);
    Chair.YawRotation = 180.f;
    Chair.bInteractable = true;
    Chair.InteractionTag = TEXT("sit");
    Set.Add(Chair);

    FFurnitureEntry Bookshelf;
    Bookshelf.Name = TEXT("Bookshelf");
    Bookshelf.AssetPath = TEXT("/Game/Furniture/Office/SM_Bookshelf");
    Bookshelf.Offset = FVector(-150.f, 0.f, 0.f);
    Bookshelf.YawRotation = 90.f;
    Set.Add(Bookshelf);

    FFurnitureEntry FilingCabinet;
    FilingCabinet.Name = TEXT("Filing Cabinet");
    FilingCabinet.AssetPath = TEXT("/Game/Furniture/Office/SM_FilingCabinet");
    FilingCabinet.Offset = FVector(150.f, 0.f, 0.f);
    FilingCabinet.YawRotation = -90.f;
    Set.Add(FilingCabinet);

    return Set;
}

TArray<FFurnitureEntry> AInteriorDecorationGenerator::CreateMedicalSet()
{
    TArray<FFurnitureEntry> Set;

    FFurnitureEntry ExamTable;
    ExamTable.Name = TEXT("Examination Table");
    ExamTable.AssetPath = TEXT("/Game/Furniture/Medical/SM_ExamTable");
    ExamTable.Offset = FVector(0.f, 0.f, 0.f);
    ExamTable.bInteractable = true;
    ExamTable.InteractionTag = TEXT("use");
    Set.Add(ExamTable);

    FFurnitureEntry MedicineCabinet;
    MedicineCabinet.Name = TEXT("Medicine Cabinet");
    MedicineCabinet.AssetPath = TEXT("/Game/Furniture/Medical/SM_MedicineCabinet");
    MedicineCabinet.Offset = FVector(-150.f, 0.f, 80.f);
    MedicineCabinet.YawRotation = 90.f;
    Set.Add(MedicineCabinet);

    FFurnitureEntry Stool;
    Stool.Name = TEXT("Doctor Stool");
    Stool.AssetPath = TEXT("/Game/Furniture/Medical/SM_Stool");
    Stool.Offset = FVector(60.f, 60.f, 0.f);
    Stool.bInteractable = true;
    Stool.InteractionTag = TEXT("sit");
    Set.Add(Stool);

    FFurnitureEntry SupplyShelf;
    SupplyShelf.Name = TEXT("Supply Shelf");
    SupplyShelf.AssetPath = TEXT("/Game/Furniture/Medical/SM_SupplyShelf");
    SupplyShelf.Offset = FVector(150.f, 0.f, 0.f);
    SupplyShelf.YawRotation = -90.f;
    Set.Add(SupplyShelf);

    return Set;
}
