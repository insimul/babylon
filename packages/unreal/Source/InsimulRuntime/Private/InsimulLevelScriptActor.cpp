// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulLevelScriptActor.h"
#include "InsimulAICharacter.h"
#include "Engine/World.h"
#include "InsimulConversationComponent.h"

AInsimulLevelScriptActor::AInsimulLevelScriptActor()
{
	PrimaryActorTick.bCanEverTick = false;

	// Set default spawn locations if none are configured
	if (SpawnLocations.Num() == 0)
	{
		SpawnLocations.Add(FVector(1000.0f, 0.0f, 200.0f));   // Street location 1
		SpawnLocations.Add(FVector(1200.0f, 0.0f, 200.0f));   // Street location 2
		SpawnLocations.Add(FVector(1400.0f, 0.0f, 200.0f));   // Street location 3
		SpawnLocations.Add(FVector(1000.0f, 200.0f, 200.0f)); // Street location 4
		SpawnLocations.Add(FVector(1200.0f, 200.0f, 200.0f)); // Street location 5
	}

	// Set default character IDs if none are configured
	if (CharacterIDs.Num() == 0)
	{
		CharacterIDs.Add(TEXT("npc_1001"));
		CharacterIDs.Add(TEXT("npc_1002"));
		CharacterIDs.Add(TEXT("npc_1003"));
		CharacterIDs.Add(TEXT("npc_1004"));
		CharacterIDs.Add(TEXT("npc_1005"));
	}

	// Set default character names if none are configured
	if (CharacterNames.Num() == 0)
	{
		CharacterNames.Add(TEXT("Citizen Alpha"));
		CharacterNames.Add(TEXT("Tech Enthusiast"));
		CharacterNames.Add(TEXT("Urban Explorer"));
		CharacterNames.Add(TEXT("Local Merchant"));
		CharacterNames.Add(TEXT("City Guard"));
	}
}

void AInsimulLevelScriptActor::BeginPlay()
{
	Super::BeginPlay();

	if (bSpawnInsimulNPCs)
	{
		// Delay spawning to ensure everything is initialized
		FTimerHandle TimerHandle;
		GetWorldTimerManager().SetTimerForNextTick(this, &AInsimulLevelScriptActor::SpawnInsimulCharacters);
	}
}

void AInsimulLevelScriptActor::SpawnInsimulCharacters()
{
	UE_LOG(LogTemp, Log, TEXT("Spawning Insimul characters in Small_City_LVL..."));

	const int32 SpawnCount = FMath::Min3(SpawnLocations.Num(), CharacterIDs.Num(), CharacterNames.Num());

	for (int32 i = 0; i < SpawnCount; ++i)
	{
		const FVector& SpawnLocation = SpawnLocations[i];
		const FString& CharacterID = CharacterIDs[i];
		const FString& CharacterName = CharacterNames[i];

		// Spawn the AI character
		AInsimulAICharacter* AI = GetWorld()->SpawnActor<AInsimulAICharacter>(
			AInsimulAICharacter::StaticClass(),
			SpawnLocation,
			FRotator::ZeroRotator
		);

		if (AI)
		{
			// Configure the conversation component, then initialize so it uses the correct ID.
			if (AI->InsimulConversationComponent)
			{
				AI->InsimulConversationComponent->Config.CharacterID = CharacterID;
				AI->InsimulConversationComponent->Config.WorldID = WorldID;
				AI->InsimulConversationComponent->Config.APIBaseUrl = APIBaseUrl;
				AI->InsimulConversationComponent->InitializeInsimul();
			}

			UE_LOG(LogTemp, Log, TEXT("Spawned Insimul AI: %s (ID: %s) at %s"),
				*CharacterName, *CharacterID, *SpawnLocation.ToString());
		}
	}
}
