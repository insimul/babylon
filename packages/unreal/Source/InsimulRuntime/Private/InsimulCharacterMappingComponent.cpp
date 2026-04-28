// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulCharacterMappingComponent.h"
#include "InsimulSettings.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Engine/World.h"
#include "EngineUtils.h"

// ============================================================================
// UInsimulCharacterMappingComponent Implementation
// ============================================================================

UInsimulCharacterMappingComponent::UInsimulCharacterMappingComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UInsimulCharacterMappingComponent::BeginPlay()
{
	Super::BeginPlay();

	// Auto-register with subsystem
	if (UWorld* World = GetWorld())
	{
		if (UInsimulCharacterMappingSubsystem* Subsystem = World->GetSubsystem<UInsimulCharacterMappingSubsystem>())
		{
			Subsystem->RegisterCrowdCharacter(GetOwner());
		}
	}
}

void UInsimulCharacterMappingComponent::SetInsimulCharacterId(const FString& CharacterId, const FString& WorldId)
{
	InsimulCharacterId = CharacterId;
	InsimulWorldId = WorldId;

	UE_LOG(LogTemp, Log, TEXT("Mapped character %s to Insimul ID: %s"), *GetOwner()->GetName(), *CharacterId);
}

void UInsimulCharacterMappingComponent::ClearInsimulMapping()
{
	InsimulCharacterId.Empty();
	InsimulWorldId.Empty();
}

void UInsimulCharacterMappingComponent::GetInsimulCharacterName(FString& OutFirstName, FString& OutLastName)
{
	// This would require querying Insimul for character details
	// For now, just return empty - can be implemented when needed
	OutFirstName.Empty();
	OutLastName.Empty();
}

// ============================================================================
// UInsimulCharacterMappingSubsystem Implementation
// ============================================================================

void UInsimulCharacterMappingSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Pull config from plugin settings
	const UInsimulSettings* Settings = UInsimulSettings::Get();
	InsimulServerURL = Settings ? Settings->ServerURL : TEXT("http://localhost:8080");
	CurrentInsimulWorldId = Settings ? Settings->DefaultWorldID : TEXT("default-world");

	// Auto-load characters based on chat provider
	if (Settings && Settings->IsOfflineMode())
	{
		// Local LLM: load from exported JSON file
		LoadInsimulCharactersFromFile(Settings->WorldDataPath);
	}
	else if (Settings)
	{
		// Server: fetch from server
		LoadInsimulCharacters(Settings->ServerURL);
	}

	UE_LOG(LogTemp, Log, TEXT("InsimulCharacterMappingSubsystem initialized (world: %s, chat: %s)"),
		*CurrentInsimulWorldId, (Settings && Settings->IsOfflineMode()) ? TEXT("local") : TEXT("server"));
}

void UInsimulCharacterMappingSubsystem::Deinitialize()
{
	Super::Deinitialize();

	CharacterMappings.Empty();
	AvailableInsimulCharacters.Empty();
}

void UInsimulCharacterMappingSubsystem::RegisterCrowdCharacter(AActor* CrowdCharacter)
{
	if (!CrowdCharacter)
	{
		return;
	}

	// Check if already mapped
	if (CharacterMappings.Contains(CrowdCharacter))
	{
		return;
	}

	// Try to find or create mapping component
	UInsimulCharacterMappingComponent* MappingComponent = CrowdCharacter->FindComponentByClass<UInsimulCharacterMappingComponent>();

	if (!MappingComponent)
	{
		// Create component if it doesn't exist
		MappingComponent = NewObject<UInsimulCharacterMappingComponent>(CrowdCharacter, TEXT("InsimulMapping"));
		MappingComponent->RegisterComponent();
	}

	// Assign next available Insimul character if available
	if (AvailableInsimulCharacters.Num() > 0)
	{
		FString InsimulCharId = PopNextAvailableCharacter();
		MappingComponent->SetInsimulCharacterId(InsimulCharId, CurrentInsimulWorldId);
		CharacterMappings.Add(CrowdCharacter, InsimulCharId);

		UE_LOG(LogTemp, Log, TEXT("Auto-assigned Insimul character %s to %s"), *InsimulCharId, *CrowdCharacter->GetName());
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("No available Insimul characters to assign to %s"), *CrowdCharacter->GetName());
	}
}

void UInsimulCharacterMappingSubsystem::UnregisterCrowdCharacter(AActor* CrowdCharacter)
{
	if (!CrowdCharacter)
	{
		return;
	}

	// Return the character ID to available pool if it was mapped
	if (FString* CharId = CharacterMappings.Find(CrowdCharacter))
	{
		AvailableInsimulCharacters.Add(*CharId);
		CharacterMappings.Remove(CrowdCharacter);

		UE_LOG(LogTemp, Log, TEXT("Unregistered character %s, returned ID to pool"), *CrowdCharacter->GetName());
	}
}

FString UInsimulCharacterMappingSubsystem::GetInsimulCharacterId(AActor* CrowdCharacter) const
{
	if (!CrowdCharacter)
	{
		return FString();
	}

	if (const FString* CharId = CharacterMappings.Find(CrowdCharacter))
	{
		return *CharId;
	}

	// Try to get from component
	if (UInsimulCharacterMappingComponent* MappingComponent = CrowdCharacter->FindComponentByClass<UInsimulCharacterMappingComponent>())
	{
		return MappingComponent->InsimulCharacterId;
	}

	return FString();
}

void UInsimulCharacterMappingSubsystem::SetInsimulWorldId(const FString& WorldId)
{
	CurrentInsimulWorldId = WorldId;
	UE_LOG(LogTemp, Log, TEXT("Set Insimul world ID to: %s"), *WorldId);
}

void UInsimulCharacterMappingSubsystem::LoadInsimulCharacters(const FString& ServerURL)
{
	if (!ServerURL.IsEmpty())
	{
		InsimulServerURL = ServerURL;
	}

	if (CurrentInsimulWorldId.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("Cannot load Insimul characters: World ID not set"));
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("Loading Insimul characters from %s for world %s"), *InsimulServerURL, *CurrentInsimulWorldId);

	// Create HTTP request
	FHttpModule* Http = &FHttpModule::Get();
	TSharedRef<IHttpRequest> Request = Http->CreateRequest();

	FString URL = FString::Printf(TEXT("%s/api/worlds/%s/characters"), *InsimulServerURL, *CurrentInsimulWorldId);
	Request->SetURL(URL);
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	// Bind response callback
	Request->OnProcessRequestComplete().BindUObject(this, &UInsimulCharacterMappingSubsystem::OnCharactersLoaded);

	// Send request
	Request->ProcessRequest();
}

void UInsimulCharacterMappingSubsystem::LoadInsimulCharactersFromFile(const FString& FilePath)
{
	FString ResolvedPath = FilePath;
	if (FPaths::IsRelative(ResolvedPath))
	{
		ResolvedPath = FPaths::Combine(FPaths::ProjectContentDir(), ResolvedPath);
	}

	FString JsonString;
	if (!FFileHelper::LoadFileToString(JsonString, *ResolvedPath))
	{
		UE_LOG(LogTemp, Warning, TEXT("Could not load Insimul characters from file: %s"), *ResolvedPath);
		return;
	}

	// Parse the JSON — support both formats:
	// 1. World export: { "characters": [ { "characterId": "...", ... }, ... ] }
	// 2. Plain array: [ { "id": "...", ... }, ... ]
	TSharedPtr<FJsonValue> RootValue;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
	if (!FJsonSerializer::Deserialize(Reader, RootValue) || !RootValue.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("Failed to parse Insimul characters JSON from %s"), *ResolvedPath);
		return;
	}

	AvailableInsimulCharacters.Empty();

	const TArray<TSharedPtr<FJsonValue>>* CharactersArray = nullptr;

	// Try world export format (object with "characters" array)
	if (RootValue->Type == EJson::Object)
	{
		const TSharedPtr<FJsonObject> RootObj = RootValue->AsObject();
		if (RootObj->HasField(TEXT("characters")))
		{
			CharactersArray = &RootObj->GetArrayField(TEXT("characters"));
		}
		// Also try "dialogueContexts" if no "characters" field
		else if (RootObj->HasField(TEXT("dialogueContexts")))
		{
			CharactersArray = &RootObj->GetArrayField(TEXT("dialogueContexts"));
		}

		// Extract world ID if present
		if (RootObj->HasField(TEXT("worldId")) && CurrentInsimulWorldId.IsEmpty())
		{
			CurrentInsimulWorldId = RootObj->GetStringField(TEXT("worldId"));
		}
	}
	// Try plain array format
	else if (RootValue->Type == EJson::Array)
	{
		CharactersArray = &RootValue->AsArray();
	}

	if (!CharactersArray)
	{
		UE_LOG(LogTemp, Error, TEXT("No characters found in JSON file %s"), *ResolvedPath);
		return;
	}

	for (const TSharedPtr<FJsonValue>& CharValue : *CharactersArray)
	{
		if (CharValue->Type != EJson::Object) continue;

		const TSharedPtr<FJsonObject> CharObj = CharValue->AsObject();

		// Accept "id", "characterId", or "CharacterId" field
		FString CharId;
		if (CharObj->HasField(TEXT("id")))
		{
			CharId = CharObj->GetStringField(TEXT("id"));
		}
		else if (CharObj->HasField(TEXT("characterId")))
		{
			CharId = CharObj->GetStringField(TEXT("characterId"));
		}
		else if (CharObj->HasField(TEXT("CharacterId")))
		{
			CharId = CharObj->GetStringField(TEXT("CharacterId"));
		}

		if (!CharId.IsEmpty())
		{
			// Only add if not already mapped
			bool bAlreadyMapped = false;
			for (const auto& Pair : CharacterMappings)
			{
				if (Pair.Value == CharId)
				{
					bAlreadyMapped = true;
					break;
				}
			}

			if (!bAlreadyMapped)
			{
				AvailableInsimulCharacters.Add(CharId);
			}
		}
	}

	UE_LOG(LogTemp, Log, TEXT("Loaded %d Insimul characters from file %s (%d available for mapping)"),
		CharactersArray->Num(), *ResolvedPath, AvailableInsimulCharacters.Num());
}

void UInsimulCharacterMappingSubsystem::OnCharactersLoaded(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
	{
		UE_LOG(LogTemp, Error, TEXT("Failed to load Insimul characters: HTTP %d"),
			Response.IsValid() ? Response->GetResponseCode() : 0);
		return;
	}

	// Parse JSON response
	FString ResponseString = Response->GetContentAsString();
	TSharedPtr<FJsonValue> JsonValue;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseString);

	if (!FJsonSerializer::Deserialize(Reader, JsonValue) || !JsonValue.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("Failed to parse Insimul characters response"));
		return;
	}

	// Clear existing available characters
	AvailableInsimulCharacters.Empty();

	// Extract character IDs from response
	const TArray<TSharedPtr<FJsonValue>>* CharactersArray;
	if (JsonValue->TryGetArray(CharactersArray))
	{
		for (const TSharedPtr<FJsonValue>& CharValue : *CharactersArray)
		{
			if (CharValue->Type == EJson::Object)
			{
				TSharedPtr<FJsonObject> CharObj = CharValue->AsObject();
				FString CharId = CharObj->GetStringField(TEXT("id"));

				// Only add if not already mapped
				bool bAlreadyMapped = false;
				for (const auto& Pair : CharacterMappings)
				{
					if (Pair.Value == CharId)
					{
						bAlreadyMapped = true;
						break;
					}
				}

				if (!bAlreadyMapped)
				{
					AvailableInsimulCharacters.Add(CharId);
				}
			}
		}

		UE_LOG(LogTemp, Log, TEXT("Loaded %d Insimul characters (%d available for mapping)"),
			CharactersArray->Num(), AvailableInsimulCharacters.Num());
	}
}

FString UInsimulCharacterMappingSubsystem::PopNextAvailableCharacter()
{
	if (AvailableInsimulCharacters.Num() == 0)
	{
		return FString();
	}

	FString CharId = AvailableInsimulCharacters[0];
	AvailableInsimulCharacters.RemoveAt(0);
	return CharId;
}

void UInsimulCharacterMappingSubsystem::RefreshMappings()
{
	UE_LOG(LogTemp, Log, TEXT("Refreshing Insimul character mappings"));

	// Reload characters from server
	LoadInsimulCharacters();

	// Re-register all actors that don't have mappings
	if (UWorld* World = GetWorld())
	{
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			AActor* Actor = *It;
			if (Actor && Actor->FindComponentByClass<UInsimulCharacterMappingComponent>())
			{
				if (!CharacterMappings.Contains(Actor))
				{
					RegisterCrowdCharacter(Actor);
				}
			}
		}
	}
}
