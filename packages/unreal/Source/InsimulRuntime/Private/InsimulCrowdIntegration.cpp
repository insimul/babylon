// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulCrowdIntegration.h"
#include "InsimulCharacterMappingComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"

// ============================================================================
// UInsimulCrowdIntegration Implementation
// ============================================================================

void UInsimulCrowdIntegration::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	UE_LOG(LogTemp, Log, TEXT("InsimulCrowdIntegration initialized"));
}

void UInsimulCrowdIntegration::Deinitialize()
{
	// Unregister from world actor spawned event
	if (UWorld* World = GetWorld())
	{
		if (ActorSpawnedDelegateHandle.IsValid())
		{
			World->RemoveOnActorSpawnedHandler(ActorSpawnedDelegateHandle);
			ActorSpawnedDelegateHandle.Reset();
		}
	}

	Super::Deinitialize();
}

void UInsimulCrowdIntegration::EnableAutomaticMapping(bool bEnable)
{
	if (bEnable == bAutomaticMappingEnabled)
	{
		return;
	}

	bAutomaticMappingEnabled = bEnable;

	if (UWorld* World = GetWorld())
	{
		if (bEnable)
		{
			// Register for actor spawned events
			if (!ActorSpawnedDelegateHandle.IsValid())
			{
				ActorSpawnedDelegateHandle = World->AddOnActorSpawnedHandler(
					FOnActorSpawned::FDelegate::CreateUObject(this, &UInsimulCrowdIntegration::OnActorSpawned)
				);

				UE_LOG(LogTemp, Log, TEXT("Insimul automatic mapping ENABLED"));
			}
		}
		else
		{
			// Unregister from actor spawned events
			if (ActorSpawnedDelegateHandle.IsValid())
			{
				World->RemoveOnActorSpawnedHandler(ActorSpawnedDelegateHandle);
				ActorSpawnedDelegateHandle.Reset();

				UE_LOG(LogTemp, Log, TEXT("Insimul automatic mapping DISABLED"));
			}
		}
	}
}

void UInsimulCrowdIntegration::ConfigureInsimul(const FString& ServerURL, const FString& WorldId)
{
	if (UWorld* World = GetWorld())
	{
		if (UInsimulCharacterMappingSubsystem* Subsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>())
		{
			Subsystem->SetInsimulWorldId(WorldId);
			Subsystem->LoadInsimulCharacters(ServerURL);

			UE_LOG(LogTemp, Log, TEXT("Configured Insimul: Server=%s, WorldId=%s"), *ServerURL, *WorldId);
		}
	}
}

void UInsimulCrowdIntegration::AddInsimulMappingToActor(AActor* Actor)
{
	if (!Actor)
	{
		return;
	}

	// Check if actor already has mapping component
	if (Actor->FindComponentByClass<UInsimulCharacterMappingComponent>())
	{
		return;
	}

	// Add mapping component
	UInsimulCharacterMappingComponent* MappingComponent = NewObject<UInsimulCharacterMappingComponent>(
		Actor,
		UInsimulCharacterMappingComponent::StaticClass(),
		TEXT("InsimulMapping")
	);

	if (MappingComponent)
	{
		MappingComponent->RegisterComponent();

		// Register with subsystem
		if (UWorld* World = Actor->GetWorld())
		{
			if (UInsimulCharacterMappingSubsystem* Subsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>())
			{
				Subsystem->RegisterCrowdCharacter(Actor);
			}
		}

		UE_LOG(LogTemp, Log, TEXT("Added Insimul mapping to actor: %s"), *Actor->GetName());
	}
}

void UInsimulCrowdIntegration::OnActorSpawned(AActor* SpawnedActor)
{
	if (!SpawnedActor || !bAutomaticMappingEnabled)
	{
		return;
	}

	// Check if this is a crowd character actor
	// CitySample uses class name "CitySampleCrowdCharacter"
	FString ClassName = SpawnedActor->GetClass()->GetName();

	if (ClassName.Contains(TEXT("Crowd")) || ClassName.Contains(TEXT("NPC")) || ClassName.Contains(TEXT("Character")))
	{
		// Add mapping component to this character
		AddInsimulMappingToActor(SpawnedActor);
	}
}

// ============================================================================
// UInsimulCrowdBlueprintLibrary Implementation
// ============================================================================

FString UInsimulCrowdBlueprintLibrary::GetInsimulCharacterId(UObject* WorldContextObject, AActor* CrowdCharacter)
{
	if (!WorldContextObject || !CrowdCharacter)
	{
		return FString();
	}

	UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::LogAndReturnNull);
	if (!World)
	{
		return FString();
	}

	UInsimulCharacterMappingSubsystem* Subsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>();
	if (!Subsystem)
	{
		return FString();
	}

	return Subsystem->GetInsimulCharacterId(CrowdCharacter);
}

bool UInsimulCrowdBlueprintLibrary::IsMappedToInsimul(AActor* CrowdCharacter)
{
	if (!CrowdCharacter)
	{
		return false;
	}

	UInsimulCharacterMappingComponent* MappingComponent = CrowdCharacter->FindComponentByClass<UInsimulCharacterMappingComponent>();
	if (!MappingComponent)
	{
		return false;
	}

	return MappingComponent->IsMappedToInsimul();
}

void UInsimulCrowdBlueprintLibrary::SetInsimulCharacterId(AActor* CrowdCharacter, const FString& CharacterId, const FString& WorldId)
{
	if (!CrowdCharacter)
	{
		return;
	}

	UInsimulCharacterMappingComponent* MappingComponent = CrowdCharacter->FindComponentByClass<UInsimulCharacterMappingComponent>();
	if (!MappingComponent)
	{
		// Create component if it doesn't exist
		MappingComponent = NewObject<UInsimulCharacterMappingComponent>(
			CrowdCharacter,
			UInsimulCharacterMappingComponent::StaticClass(),
			TEXT("InsimulMapping")
		);

		if (MappingComponent)
		{
			MappingComponent->RegisterComponent();
		}
	}

	if (MappingComponent)
	{
		MappingComponent->SetInsimulCharacterId(CharacterId, WorldId);
	}
}

void UInsimulCrowdBlueprintLibrary::LoadInsimulCharactersForWorld(UObject* WorldContextObject, const FString& WorldId, const FString& ServerURL)
{
	if (!WorldContextObject)
	{
		return;
	}

	UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::LogAndReturnNull);
	if (!World)
	{
		return;
	}

	UInsimulCharacterMappingSubsystem* Subsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>();
	if (!Subsystem)
	{
		return;
	}

	Subsystem->SetInsimulWorldId(WorldId);
	Subsystem->LoadInsimulCharacters(ServerURL);
}

int32 UInsimulCrowdBlueprintLibrary::GetAvailableInsimulCharacterCount(UObject* WorldContextObject)
{
	if (!WorldContextObject)
	{
		return 0;
	}

	UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::LogAndReturnNull);
	if (!World)
	{
		return 0;
	}

	UInsimulCharacterMappingSubsystem* Subsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>();
	if (!Subsystem)
	{
		return 0;
	}

	return Subsystem->GetAvailableInsimulCharacterCount();
}

void UInsimulCrowdBlueprintLibrary::EnableInsimulIntegration(UObject* WorldContextObject, const FString& ServerURL, const FString& WorldId)
{
	if (!WorldContextObject)
	{
		return;
	}

	UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::LogAndReturnNull);
	if (!World)
	{
		return;
	}

	// Configure mapping subsystem
	UInsimulCharacterMappingSubsystem* MappingSubsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>();
	if (MappingSubsystem)
	{
		MappingSubsystem->SetInsimulWorldId(WorldId);
		MappingSubsystem->LoadInsimulCharacters(ServerURL);
	}

	// Enable automatic mapping in game instance
	if (UGameInstance* GameInstance = World->GetGameInstance())
	{
		UInsimulCrowdIntegration* Integration = GameInstance->GetSubsystem<UInsimulCrowdIntegration>();
		if (Integration)
		{
			Integration->ConfigureInsimul(ServerURL, WorldId);
			Integration->EnableAutomaticMapping(true);
		}
	}

	UE_LOG(LogTemp, Log, TEXT("Enabled Insimul integration for all crowd characters"));
}
