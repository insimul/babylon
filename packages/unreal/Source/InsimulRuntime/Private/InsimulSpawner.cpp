// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulSpawner.h"
#include "InsimulAICharacter.h"
#include "InsimulSettings.h"
#include "Components/BillboardComponent.h"
#include "Engine/Texture2D.h"
#include "UObject/ConstructorHelpers.h"
#include "DrawDebugHelpers.h"
#include "Engine/World.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

AInsimulSpawner::AInsimulSpawner()
{
	PrimaryActorTick.bCanEverTick = true;
	bAutoSpawnAI = true;
	bShowDebugSpheres = true;
	DebugSphereRadius = 50.0f;
	DebugSphereColor = FColor::Blue;

	// Create a billboard component for easier visualization in editor
	UBillboardComponent* Billboard = CreateDefaultSubobject<UBillboardComponent>(TEXT("Billboard"));
	RootComponent = Billboard;

	// Try to load an icon for the billboard
	static ConstructorHelpers::FObjectFinder<UTexture2D> IconTexture(TEXT("/Engine/EditorResources/SpawnIcons/Spawn_Actor"));
	if (IconTexture.Succeeded())
	{
		Billboard->SetSprite(IconTexture.Object);
	}

	// Set default spawn data if none is set
	if (CharacterSpawnData.Num() == 0)
	{
		// Create some default spawn points
		FInsimulCharacterSpawnData Spawn1;
		Spawn1.Location = FVector(0.0f, 0.0f, 0.0f);
		Spawn1.Rotation = FRotator::ZeroRotator;
		Spawn1.CharacterID = TEXT("npc_1001");
		Spawn1.CharacterName = TEXT("Citizen One");
		CharacterSpawnData.Add(Spawn1);

		FInsimulCharacterSpawnData Spawn2;
		Spawn2.Location = FVector(300.0f, 0.0f, 0.0f);
		Spawn2.Rotation = FRotator::ZeroRotator;
		Spawn2.CharacterID = TEXT("npc_1002");
		Spawn2.CharacterName = TEXT("Citizen Two");
		CharacterSpawnData.Add(Spawn2);

		FInsimulCharacterSpawnData Spawn3;
		Spawn3.Location = FVector(600.0f, 0.0f, 0.0f);
		Spawn3.Rotation = FRotator::ZeroRotator;
		Spawn3.CharacterID = TEXT("npc_1003");
		Spawn3.CharacterName = TEXT("Citizen Three");
		CharacterSpawnData.Add(Spawn3);
	}
}

void AInsimulSpawner::BeginPlay()
{
	Super::BeginPlay();

	if (bAutoSpawnAI)
	{
		if (bFetchCharactersFromServer)
		{
			// Fetch characters from the server, then spawn
			FetchAndSpawnCharacters();
		}
		else
		{
			// Use manually configured spawn data
			GetWorldTimerManager().SetTimerForNextTick(this, &AInsimulSpawner::SpawnAICharacters);
		}
	}
}

FString AInsimulSpawner::GetEffectiveWorldID() const
{
	if (!WorldID.IsEmpty())
	{
		return WorldID;
	}
	if (const UInsimulSettings* Settings = UInsimulSettings::Get())
	{
		return Settings->DefaultWorldID;
	}
	return TEXT("default-world");
}

FString AInsimulSpawner::GetEffectiveServerURL() const
{
	if (const UInsimulSettings* Settings = UInsimulSettings::Get())
	{
		return Settings->ServerURL;
	}
	return TEXT("http://localhost:8080");
}

#if WITH_EDITOR
void AInsimulSpawner::PostEditMove(bool bFinished)
{
	Super::PostEditMove(bFinished);

	// Redraw debug spheres
	if (bShowDebugSpheres)
	{
		DrawDebugSpheres();
	}
}

void AInsimulSpawner::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
	Super::PostEditChangeProperty(PropertyChangedEvent);

	// Redraw debug spheres when properties change
	if (bShowDebugSpheres)
	{
		DrawDebugSpheres();
	}
}
#endif

void AInsimulSpawner::SpawnAICharacters()
{
	UE_LOG(LogTemp, Log, TEXT("Spawning Insimul AI characters..."));

	// Clear any previously spawned characters
	ClearSpawnedAI();

	// Use default class if none specified
	if (!AICharacterClass)
	{
		AICharacterClass = AInsimulAICharacter::StaticClass();
	}

	// Spawn characters at each location
	for (const FInsimulCharacterSpawnData& SpawnData : CharacterSpawnData)
	{
		FVector SpawnLocation = GetActorLocation() + SpawnData.Location;
		FRotator SpawnRotation = GetActorRotation() + SpawnData.Rotation;

		AInsimulAICharacter* AI = GetWorld()->SpawnActor<AInsimulAICharacter>(AICharacterClass, SpawnLocation, SpawnRotation);

		if (AI)
		{
			// Configure the AI character, then initialize so it uses the correct ID.
			if (AI->InsimulConversationComponent)
			{
				AI->InsimulConversationComponent->Config.CharacterID = SpawnData.CharacterID;
				AI->InsimulConversationComponent->Config.WorldID = GetEffectiveWorldID();
				AI->InsimulConversationComponent->InitializeInsimul();
			}

			SpawnedAICharacters.Add(AI);
			UE_LOG(LogTemp, Log, TEXT("Spawned AI character: %s (ID: %s) at location: %s"),
				*SpawnData.CharacterName, *SpawnData.CharacterID, *SpawnLocation.ToString());
		}
	}

	UE_LOG(LogTemp, Log, TEXT("Successfully spawned %d Insimul AI characters"), SpawnedAICharacters.Num());
}

void AInsimulSpawner::ClearSpawnedAI()
{
	for (AInsimulAICharacter* AI : SpawnedAICharacters)
	{
		if (AI && AI->IsValidLowLevel())
		{
			AI->Destroy();
		}
	}
	SpawnedAICharacters.Empty();
}

void AInsimulSpawner::FetchAndSpawnCharacters()
{
	const FString ServerURL = GetEffectiveServerURL();
	const FString EffectiveWorldID = GetEffectiveWorldID();
	const FString URL = FString::Printf(TEXT("%s/api/worlds/%s/characters"), *ServerURL, *EffectiveWorldID);

	UE_LOG(LogTemp, Log, TEXT("Fetching characters from %s for world %s"), *URL, *EffectiveWorldID);

	FHttpModule* HttpModule = &FHttpModule::Get();
	TSharedRef<IHttpRequest> Request = HttpModule->CreateRequest();
	Request->SetURL(URL);
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->OnProcessRequestComplete().BindUObject(this, &AInsimulSpawner::OnCharactersFetched);
	Request->ProcessRequest();
}

void AInsimulSpawner::OnCharactersFetched(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
	{
		UE_LOG(LogTemp, Error, TEXT("Failed to fetch characters from Insimul server (code: %d)"),
			Response.IsValid() ? Response->GetResponseCode() : 0);

		// Fall back to manually configured spawn data if any
		if (CharacterSpawnData.Num() > 0)
		{
			UE_LOG(LogTemp, Warning, TEXT("Using manually configured spawn data as fallback"));
			SpawnAICharacters();
		}
		return;
	}

	const FString ResponseString = Response->GetContentAsString();
	TArray<TSharedPtr<FJsonValue>> CharactersArray;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseString);

	if (!FJsonSerializer::Deserialize(Reader, CharactersArray))
	{
		UE_LOG(LogTemp, Error, TEXT("Failed to parse characters JSON"));
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("Received %d characters from Insimul server"), CharactersArray.Num());

	// Clear existing spawn data and rebuild from server data
	CharacterSpawnData.Empty();

	const FVector SpawnerLocation = GetActorLocation();
	const float SpawnSpacing = 300.0f;

	for (int32 i = 0; i < CharactersArray.Num(); i++)
	{
		const TSharedPtr<FJsonObject> CharObj = CharactersArray[i]->AsObject();
		if (!CharObj.IsValid())
		{
			continue;
		}

		FInsimulCharacterSpawnData SpawnData;
		SpawnData.CharacterID = CharObj->GetStringField(TEXT("id"));

		// Build display name from firstName + lastName
		FString FirstName = CharObj->HasField(TEXT("firstName")) ? CharObj->GetStringField(TEXT("firstName")) : TEXT("");
		FString LastName = CharObj->HasField(TEXT("lastName")) ? CharObj->GetStringField(TEXT("lastName")) : TEXT("");
		SpawnData.CharacterName = FString::Printf(TEXT("%s %s"), *FirstName, *LastName).TrimStartAndEnd();
		if (SpawnData.CharacterName.IsEmpty())
		{
			SpawnData.CharacterName = SpawnData.CharacterID;
		}

		// Distribute spawn points in a circle around the spawner
		const float Angle = (2.0f * PI * i) / FMath::Max(CharactersArray.Num(), 1);
		const float Radius = SpawnSpacing * FMath::Max(1, (i / 8) + 1);
		SpawnData.Location = FVector(FMath::Cos(Angle) * Radius, FMath::Sin(Angle) * Radius, 0.0f);
		SpawnData.Rotation = FRotator(0.0f, FMath::RadiansToDegrees(Angle) + 180.0f, 0.0f);

		CharacterSpawnData.Add(SpawnData);

		UE_LOG(LogTemp, Log, TEXT("  Character: %s (%s)"), *SpawnData.CharacterName, *SpawnData.CharacterID);
	}

	// Now spawn with the fetched data
	if (CharacterSpawnData.Num() > 0)
	{
		SpawnAICharacters();
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("No characters found in world %s"), *GetEffectiveWorldID());
	}
}

void AInsimulSpawner::DrawDebugSpheres()
{
#if WITH_EDITOR
	if (!bShowDebugSpheres)
		return;

	for (const FInsimulCharacterSpawnData& SpawnData : CharacterSpawnData)
	{
		FVector WorldLocation = GetActorLocation() + SpawnData.Location;
		DrawDebugSphere(
			GetWorld(),
			WorldLocation,
			DebugSphereRadius,
			16,
			DebugSphereColor,
			false,
			0.0f,
			0,
			2.0f
		);
	}
#endif
}
