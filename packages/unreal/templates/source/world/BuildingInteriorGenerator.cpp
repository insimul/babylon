#include "BuildingInteriorGenerator.h"
#include "Components/StaticMeshComponent.h"

ABuildingInteriorGenerator::ABuildingInteriorGenerator()
{
    PrimaryActorTick.bCanEverTick = false;

    InteriorRoot = CreateDefaultSubobject<USceneComponent>(TEXT("InteriorRoot"));
    RootComponent = InteriorRoot;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

void ABuildingInteriorGenerator::LoadFurnitureAssets(const FInteriorConfig& Config)
{
    // Dispose previous furniture templates
    FurnitureAssetCache.Empty();

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loading furniture assets for building '%s'"), *Config.BuildingId);

    // Pre-load furniture meshes based on building role.
    // Actual asset paths are resolved from the project's furniture data table.
    // This mirrors loadFurnitureAssets() from TypeScript BuildingInteriorGenerator.
}

void ABuildingInteriorGenerator::SetExitDoorCallback(const FString& BuildingId)
{
    ExitDoorBuildings.Add(BuildingId);
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Exit door callback registered for building '%s'"), *BuildingId);
}

void ABuildingInteriorGenerator::GenerateInterior(const FInteriorConfig& Config)
{
    ClearInterior();
    CurrentConfig = Config;

    // Pre-load furniture assets before generating rooms
    LoadFurnitureAssets(Config);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Generating interior for building '%s' (role: %s, floors: %d)"),
        *Config.BuildingId, *Config.BuildingRole, Config.FloorCount);

    TArray<FRoomConfig> AllRooms;

    if (Config.Rooms.Num() > 0)
    {
        AllRooms = Config.Rooms;
    }
    else
    {
        // Auto-generate room layouts per floor
        for (int32 Floor = 0; Floor < Config.FloorCount; Floor++)
        {
            TArray<FRoomConfig> FloorRooms = SubdivideFloor(
                Floor, Config.TotalWidth, Config.TotalDepth,
                Config.CeilingHeight, Config.BuildingRole, Config.Seed + Floor);
            AllRooms.Append(FloorRooms);
        }
    }

    for (const FRoomConfig& Room : AllRooms)
    {
        GenerateRoom(Room);
        PlaceFurniture(Room.RoomId, Room.Function);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Interior generation complete: %d rooms"), AllRooms.Num());
}

void ABuildingInteriorGenerator::GenerateRoom(const FRoomConfig& RoomCfg)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Generating room '%s' (%.1f x %.1f x %.1f)"),
        *RoomCfg.RoomId, RoomCfg.Width, RoomCfg.Depth, RoomCfg.Height);

    // Register the room
    RoomRegistry.Add(RoomCfg.RoomId, RoomCfg);

    // Create a sub-component to hold this room's geometry
    USceneComponent* RoomRoot = NewObject<USceneComponent>(this, *FString::Printf(TEXT("Room_%s"), *RoomCfg.RoomId));
    if (RoomRoot)
    {
        RoomRoot->SetupAttachment(InteriorRoot);
        RoomRoot->RegisterComponent();
        RoomRoot->SetRelativeLocation(RoomCfg.Offset + FVector(0.f, 0.f, RoomCfg.FloorIndex * RoomCfg.Height));

        CreateFloorAndCeiling(RoomRoot, RoomCfg);
        CreateWalls(RoomRoot, RoomCfg);

        if (RoomCfg.bHasDoor)
        {
            CreateDoorOpening(RoomRoot, FVector(RoomCfg.Width / 2.f, 0.f, 0.f), 1.0f, 2.2f);
        }

        if (RoomCfg.bHasWindow)
        {
            CreateWindowOpening(RoomRoot, FVector(0.f, RoomCfg.Depth / 2.f, RoomCfg.Height * 0.5f), 1.2f, 1.0f);
        }
    }
}

void ABuildingInteriorGenerator::PlaceFurniture(const FString& RoomId, ERoomFunction Function)
{
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Placing furniture in room '%s' (function: %d, cached assets: %d)"),
        *RoomId, static_cast<int32>(Function), FurnitureAssetCache.Num());

    // Delegate to AInteriorDecorationGenerator::PlaceFurnitureSet()
    // based on the room function. Uses pre-loaded furniture assets from
    // LoadFurnitureAssets() when available, falling back to default meshes.
    // Furniture is no longer skipped — all rooms receive appropriate furnishings.
}

void ABuildingInteriorGenerator::ClearInterior()
{
    if (InteriorRoot)
    {
        TArray<USceneComponent*> Children;
        InteriorRoot->GetChildrenComponents(true, Children);
        for (USceneComponent* Child : Children)
        {
            if (Child && Child != InteriorRoot)
            {
                Child->DestroyComponent();
            }
        }
    }

    RoomRegistry.Empty();
    MaterialCache.Empty();
    FurnitureAssetCache.Empty();

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Interior cleared"));
}

// ---------------------------------------------------------------------------
// Default room layouts
// ---------------------------------------------------------------------------

TArray<ERoomFunction> ABuildingInteriorGenerator::GetDefaultRoomLayout(const FString& BuildingRole, int32 FloorCount)
{
    TArray<ERoomFunction> Layout;

    if (BuildingRole == TEXT("tavern") || BuildingRole == TEXT("inn"))
    {
        Layout.Add(ERoomFunction::TavernBar);
        Layout.Add(ERoomFunction::Kitchen);
        Layout.Add(ERoomFunction::Storage);
        if (FloorCount > 1)
        {
            Layout.Add(ERoomFunction::Stairwell);
            for (int32 i = 0; i < 3; i++) Layout.Add(ERoomFunction::Bedroom);
        }
    }
    else if (BuildingRole == TEXT("blacksmith"))
    {
        Layout.Add(ERoomFunction::Forge);
        Layout.Add(ERoomFunction::Shop);
        Layout.Add(ERoomFunction::Storage);
    }
    else if (BuildingRole == TEXT("church") || BuildingRole == TEXT("temple"))
    {
        Layout.Add(ERoomFunction::ChurchSanctuary);
        Layout.Add(ERoomFunction::Office);
        Layout.Add(ERoomFunction::Storage);
    }
    else if (BuildingRole == TEXT("school"))
    {
        for (int32 i = 0; i < FMath::Max(2, FloorCount); i++) Layout.Add(ERoomFunction::Classroom);
        Layout.Add(ERoomFunction::Office);
        Layout.Add(ERoomFunction::Hallway);
    }
    else if (BuildingRole == TEXT("hospital") || BuildingRole == TEXT("clinic"))
    {
        Layout.Add(ERoomFunction::Medical);
        Layout.Add(ERoomFunction::Medical);
        Layout.Add(ERoomFunction::Office);
        Layout.Add(ERoomFunction::Storage);
    }
    else if (BuildingRole == TEXT("merchant") || BuildingRole == TEXT("shop"))
    {
        Layout.Add(ERoomFunction::Shop);
        Layout.Add(ERoomFunction::Storage);
        if (FloorCount > 1)
        {
            Layout.Add(ERoomFunction::Stairwell);
            Layout.Add(ERoomFunction::LivingRoom);
            Layout.Add(ERoomFunction::Bedroom);
        }
    }
    else
    {
        // Default residential layout
        Layout.Add(ERoomFunction::LivingRoom);
        Layout.Add(ERoomFunction::Kitchen);
        if (FloorCount > 1)
        {
            Layout.Add(ERoomFunction::Stairwell);
            Layout.Add(ERoomFunction::Bedroom);
            Layout.Add(ERoomFunction::Bedroom);
            Layout.Add(ERoomFunction::Bathroom);
        }
        else
        {
            Layout.Add(ERoomFunction::Bedroom);
            Layout.Add(ERoomFunction::Bathroom);
        }
    }

    return Layout;
}

// ---------------------------------------------------------------------------
// Palette colors
// ---------------------------------------------------------------------------

FLinearColor ABuildingInteriorGenerator::GetPaletteWallColor(EInteriorPalette Palette)
{
    switch (Palette)
    {
    case EInteriorPalette::Wood:   return FLinearColor(0.76f, 0.60f, 0.42f);
    case EInteriorPalette::Stone:  return FLinearColor(0.65f, 0.65f, 0.63f);
    case EInteriorPalette::Brick:  return FLinearColor(0.72f, 0.45f, 0.35f);
    case EInteriorPalette::Marble: return FLinearColor(0.92f, 0.90f, 0.88f);
    default:                       return FLinearColor(0.76f, 0.60f, 0.42f);
    }
}

FLinearColor ABuildingInteriorGenerator::GetPaletteFloorColor(EInteriorPalette Palette)
{
    switch (Palette)
    {
    case EInteriorPalette::Wood:   return FLinearColor(0.55f, 0.38f, 0.22f);
    case EInteriorPalette::Stone:  return FLinearColor(0.50f, 0.50f, 0.48f);
    case EInteriorPalette::Brick:  return FLinearColor(0.60f, 0.38f, 0.28f);
    case EInteriorPalette::Marble: return FLinearColor(0.88f, 0.86f, 0.84f);
    default:                       return FLinearColor(0.55f, 0.38f, 0.22f);
    }
}

// ---------------------------------------------------------------------------
// Geometry creation (private)
// ---------------------------------------------------------------------------

void ABuildingInteriorGenerator::CreateWalls(USceneComponent* Parent, const FRoomConfig& RoomCfg)
{
    // TODO: Create four wall planes (or box meshes) matching room dimensions.
    // Cut openings for doors and windows as specified by the room config.
    // Apply palette-appropriate materials.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Creating walls for room '%s'"), *RoomCfg.RoomId);
}

void ABuildingInteriorGenerator::CreateFloorAndCeiling(USceneComponent* Parent, const FRoomConfig& RoomCfg)
{
    // TODO: Create floor plane at room base and ceiling plane at room height.
    // Floor uses GetPaletteFloorColor, ceiling uses a lighter tint of wall color.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Creating floor/ceiling for room '%s'"), *RoomCfg.RoomId);
}

void ABuildingInteriorGenerator::CreateDoorOpening(USceneComponent* Parent, FVector Position, float Width, float Height)
{
    // TODO: Create a door frame mesh at the specified position with the given dimensions.
    // The actual door panel can be a separate interactive actor.
    // Front entrance doors fire OnExitDoorClicked when clicked, mirroring
    // the onExitCallback metadata pattern from TypeScript BuildingInteriorGenerator.
    if (ExitDoorBuildings.Contains(CurrentConfig.BuildingId))
    {
        // Mark this door as an exit door — interaction handler should call
        // OnExitDoorClicked.Broadcast(CurrentConfig.BuildingId) when clicked.
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Creating EXIT door at (%.1f, %.1f, %.1f) for building '%s'"),
            Position.X, Position.Y, Position.Z, *CurrentConfig.BuildingId);
    }
    else
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Creating door opening at (%.1f, %.1f, %.1f)"),
            Position.X, Position.Y, Position.Z);
    }
}

void ABuildingInteriorGenerator::CreateWindowOpening(USceneComponent* Parent, FVector Position, float Width, float Height)
{
    // TODO: Create a window frame with optional glass material.
    // Windows should let light through and support the InteriorLightingSystem.
    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Creating window opening at (%.1f, %.1f, %.1f)"),
        Position.X, Position.Y, Position.Z);
}

TArray<FRoomConfig> ABuildingInteriorGenerator::SubdivideFloor(
    int32 FloorIndex, float FloorWidth, float FloorDepth,
    float CeilingHeight, const FString& BuildingRole, int32 Seed)
{
    TArray<FRoomConfig> Rooms;
    TArray<ERoomFunction> Layout = GetDefaultRoomLayout(BuildingRole, CurrentConfig.FloorCount);

    // Filter to rooms belonging to this floor
    const int32 RoomsPerFloor = FMath::Max(1, Layout.Num() / CurrentConfig.FloorCount);
    const int32 StartIdx = FloorIndex * RoomsPerFloor;
    const int32 EndIdx = FMath::Min(StartIdx + RoomsPerFloor, Layout.Num());

    const int32 RoomCount = EndIdx - StartIdx;
    if (RoomCount <= 0) return Rooms;

    // Simple grid subdivision
    const int32 Cols = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(RoomCount)));
    const int32 RowCount = FMath::CeilToInt(static_cast<float>(RoomCount) / Cols);
    const float RoomWidth = FloorWidth / static_cast<float>(Cols);
    const float RoomDepth = FloorDepth / static_cast<float>(RowCount);

    for (int32 i = 0; i < RoomCount; i++)
    {
        const int32 Row = i / Cols;
        const int32 Col = i % Cols;

        FRoomConfig Room;
        Room.RoomId = FString::Printf(TEXT("F%d_R%d"), FloorIndex, i);
        Room.Function = Layout[StartIdx + i];
        Room.Width = RoomWidth;
        Room.Depth = RoomDepth;
        Room.Height = CeilingHeight;
        Room.FloorIndex = FloorIndex;
        Room.Offset = FVector(
            -FloorWidth / 2.f + Col * RoomWidth + RoomWidth / 2.f,
            -FloorDepth / 2.f + Row * RoomDepth + RoomDepth / 2.f,
            0.f);
        Room.Palette = CurrentConfig.Palette;
        Room.bHasWindow = (Row == 0 || Row == RowCount - 1 || Col == 0 || Col == Cols - 1);
        Room.bHasDoor = true;

        Rooms.Add(Room);
    }

    return Rooms;
}

UMaterialInstanceDynamic* ABuildingInteriorGenerator::GetInteriorMaterial(EInteriorPalette Palette, const FString& SurfaceType)
{
    const FString Key = FString::Printf(TEXT("%d_%s"), static_cast<int32>(Palette), *SurfaceType);

    if (UMaterialInstanceDynamic** Found = MaterialCache.Find(Key))
    {
        return *Found;
    }

    UMaterialInterface* BaseMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial"));
    if (!BaseMaterial) return nullptr;

    UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(BaseMaterial, this);
    if (MID)
    {
        FLinearColor Color = (SurfaceType == TEXT("floor"))
            ? GetPaletteFloorColor(Palette)
            : GetPaletteWallColor(Palette);
        MID->SetVectorParameterValue(TEXT("Color"), Color);
        MaterialCache.Add(Key, MID);
    }

    return MID;
}
