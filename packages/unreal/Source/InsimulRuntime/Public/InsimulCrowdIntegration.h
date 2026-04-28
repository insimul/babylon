// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "InsimulCrowdIntegration.generated.h"

/**
 * Game Instance Subsystem that automatically integrates Insimul with CitySample's crowd system
 * Listens for crowd character spawns and automatically adds mapping components
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulCrowdIntegration : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/**
	 * Enable automatic mapping of crowd characters to Insimul
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void EnableAutomaticMapping(bool bEnable = true);

	/**
	 * Set the Insimul server URL and world ID for character loading
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void ConfigureInsimul(const FString& ServerURL, const FString& WorldId);

	/**
	 * Manually add Insimul mapping to an actor
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	static void AddInsimulMappingToActor(AActor* Actor);

	/**
	 * Check if automatic mapping is enabled
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	bool IsAutomaticMappingEnabled() const { return bAutomaticMappingEnabled; }

protected:
	void OnActorSpawned(AActor* SpawnedActor);

private:
	UPROPERTY()
	bool bAutomaticMappingEnabled = false;

	FDelegateHandle ActorSpawnedDelegateHandle;
};

/**
 * Blueprint function library for Insimul integration
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulCrowdBlueprintLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Get the Insimul character ID for a crowd character
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul", meta = (WorldContext = "WorldContextObject"))
	static FString GetInsimulCharacterId(UObject* WorldContextObject, AActor* CrowdCharacter);

	/**
	 * Check if a crowd character is mapped to Insimul
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	static bool IsMappedToInsimul(AActor* CrowdCharacter);

	/**
	 * Manually set Insimul character ID for an actor
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	static void SetInsimulCharacterId(AActor* CrowdCharacter, const FString& CharacterId, const FString& WorldId);

	/**
	 * Load Insimul characters for a world
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul", meta = (WorldContext = "WorldContextObject"))
	static void LoadInsimulCharactersForWorld(UObject* WorldContextObject, const FString& WorldId, const FString& ServerURL = TEXT("http://localhost:8080"));

	/**
	 * Get count of available Insimul characters
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul", meta = (WorldContext = "WorldContextObject"))
	static int32 GetAvailableInsimulCharacterCount(UObject* WorldContextObject);

	/**
	 * Enable automatic Insimul mapping for all crowd characters
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul", meta = (WorldContext = "WorldContextObject"))
	static void EnableInsimulIntegration(UObject* WorldContextObject, const FString& ServerURL, const FString& WorldId);
};
