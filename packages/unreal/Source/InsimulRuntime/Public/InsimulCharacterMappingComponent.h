// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "InsimulCharacterMappingComponent.generated.h"

/**
 * Component that maps Unreal crowd characters to Insimul character IDs
 * Automatically assigns available Insimul characters to spawned crowd characters
 */
UCLASS(BlueprintType, ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class INSIMULRUNTIME_API UInsimulCharacterMappingComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UInsimulCharacterMappingComponent();

protected:
	virtual void BeginPlay() override;

public:
	/**
	 * Insimul character ID associated with this Unreal character
	 */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Insimul")
	FString InsimulCharacterId;

	/**
	 * Insimul world ID this character belongs to
	 */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Insimul")
	FString InsimulWorldId;

	/**
	 * Whether this character is currently mapped to an Insimul character
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	bool IsMappedToInsimul() const { return !InsimulCharacterId.IsEmpty(); }

	/**
	 * Set the Insimul character ID for this character
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void SetInsimulCharacterId(const FString& CharacterId, const FString& WorldId);

	/**
	 * Clear the Insimul character mapping
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void ClearInsimulMapping();

	/**
	 * Get character's first and last name (if available from Insimul)
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void GetInsimulCharacterName(FString& OutFirstName, FString& OutLastName);
};

/**
 * Subsystem that manages the mapping between Unreal crowd characters and Insimul characters
 * Handles automatic assignment of Insimul characters to newly spawned crowd characters
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulCharacterMappingSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/**
	 * Register a crowd character with the subsystem
	 * Automatically assigns an available Insimul character if one exists
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void RegisterCrowdCharacter(AActor* CrowdCharacter);

	/**
	 * Unregister a crowd character
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void UnregisterCrowdCharacter(AActor* CrowdCharacter);

	/**
	 * Get the Insimul character ID for a given Unreal actor
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	FString GetInsimulCharacterId(AActor* CrowdCharacter) const;

	/**
	 * Set the Insimul world ID for character assignment
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void SetInsimulWorldId(const FString& WorldId);

	/**
	 * Load available Insimul characters from the server (online mode)
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void LoadInsimulCharacters(const FString& ServerURL = TEXT("http://localhost:8080"));

	/**
	 * Load available Insimul characters from a local JSON file (offline mode).
	 * Supports the world export format (with "characters" array containing "id" or "characterId" fields)
	 * and the split-file format (plain array of character objects).
	 * Path can be absolute or relative to the project's Content directory.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void LoadInsimulCharactersFromFile(const FString& FilePath);

	/**
	 * Get count of available unmapped Insimul characters
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	int32 GetAvailableInsimulCharacterCount() const { return AvailableInsimulCharacters.Num(); }

	/**
	 * Force refresh of character mappings
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void RefreshMappings();

protected:
	void OnCharactersLoaded(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	FString PopNextAvailableCharacter();

private:
	// Map from Unreal Actor to Insimul Character ID
	UPROPERTY()
	TMap<TObjectPtr<AActor>, FString> CharacterMappings;

	// Pool of available Insimul character IDs that haven't been assigned yet
	UPROPERTY()
	TArray<FString> AvailableInsimulCharacters;

	// Current Insimul world ID
	UPROPERTY()
	FString CurrentInsimulWorldId;

	// Insimul server URL
	FString InsimulServerURL;
};
