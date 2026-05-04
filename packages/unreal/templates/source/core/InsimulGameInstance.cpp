#include "InsimulGameInstance.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UInsimulGameInstance::Init()
{
    Super::Init();
    LoadWorldData();
}

bool UInsimulGameInstance::LoadWorldData()
{
    if (bDataLoaded) return true;

    FString FilePath = FPaths::ProjectContentDir() / TEXT("Data/WorldIR.json");
    FString JsonString;

    if (!FFileHelper::LoadFileToString(JsonString, *FilePath))
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load WorldIR.json from %s"), *FilePath);
        return false;
    }

    RawWorldIRJson = JsonString;

    TSharedPtr<FJsonObject> JsonObj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);

    if (!FJsonSerializer::Deserialize(Reader, JsonObj) || !JsonObj.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to parse WorldIR.json"));
        return false;
    }

    // Parse meta section
    const TSharedPtr<FJsonObject>* MetaObj;
    if (JsonObj->TryGetObjectField(TEXT("meta"), MetaObj))
    {
        WorldName = (*MetaObj)->GetStringField(TEXT("worldName"));
        WorldType = (*MetaObj)->GetStringField(TEXT("worldType"));
        Seed = (*MetaObj)->GetStringField(TEXT("seed"));
        TerrainSize = (*MetaObj)->GetIntegerField(TEXT("exportVersion"));

        const TSharedPtr<FJsonObject>* GenreObj;
        if ((*MetaObj)->TryGetObjectField(TEXT("genreConfig"), GenreObj))
        {
            GenreId = (*GenreObj)->GetStringField(TEXT("id"));
        }
    }

    // Parse terrain size from geography
    const TSharedPtr<FJsonObject>* GeoObj;
    if (JsonObj->TryGetObjectField(TEXT("geography"), GeoObj))
    {
        TerrainSize = (*GeoObj)->GetIntegerField(TEXT("terrainSize"));
    }

    bDataLoaded = true;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded world: %s (type: %s, genre: %s, terrain: %d)"),
        *WorldName, *WorldType, *GenreId, TerrainSize);

    return true;
}
