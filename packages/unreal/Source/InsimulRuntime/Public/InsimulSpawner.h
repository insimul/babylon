// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "InsimulSpawner.generated.h"

USTRUCT(BlueprintType)
struct FInsimulCharacterSpawnData
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spawn")
	FVector Location;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spawn")
	FRotator Rotation;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spawn")
	FString CharacterID;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spawn")
	FString CharacterName;
};

UCLASS(BlueprintType, Blueprintable)
class INSIMULRUNTIME_API AInsimulSpawner : public AActor
{
	GENERATED_BODY()

public:
	AInsimulSpawner();

protected:
	virtual void BeginPlay() override;

#if WITH_EDITOR
	virtual void PostEditMove(bool bFinished) override;
	virtual void PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent) override;
#endif

	/** Spawn locations and data for AI characters */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Setup", meta = (MakeEditWidget = true))
	TArray<FInsimulCharacterSpawnData> CharacterSpawnData;

	/** Insimul World ID to load characters from. Leave empty to use default from plugin settings. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Setup")
	FString WorldID;

	/** Whether to automatically spawn AI characters on level start */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Setup")
	bool bAutoSpawnAI = true;

	/** Fetch characters from the Insimul server and auto-fill CharacterSpawnData.
	 *  Uses WorldID (or the default from plugin settings).
	 *  Spawn locations are distributed around the spawner's position. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Setup")
	bool bFetchCharactersFromServer = false;

	/** Class to use for spawned AI characters */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Setup")
	TSubclassOf<class AInsimulAICharacter> AICharacterClass;

	/** Show debug spheres at spawn locations */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug")
	bool bShowDebugSpheres = true;

	/** Debug sphere radius */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug", meta = (EditCondition = "bShowDebugSpheres"))
	float DebugSphereRadius = 50.0f;

	/** Debug sphere color */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Debug", meta = (EditCondition = "bShowDebugSpheres"))
	FColor DebugSphereColor = FColor::Blue;

public:
	/** Spawn all AI characters at configured locations */
	UFUNCTION(BlueprintCallable, Category = "AI Setup")
	void SpawnAICharacters();

	/** Fetch characters from the Insimul server for the configured WorldID, then spawn them */
	UFUNCTION(BlueprintCallable, Category = "AI Setup")
	void FetchAndSpawnCharacters();

	/** Clear all spawned AI characters */
	UFUNCTION(BlueprintCallable, Category = "AI Setup")
	void ClearSpawnedAI();

	/** Get spawned AI characters */
	UFUNCTION(BlueprintPure, Category = "AI Setup")
	TArray<class AInsimulAICharacter*> GetSpawnedAI() const { return SpawnedAICharacters; }

private:
	UPROPERTY()
	TArray<class AInsimulAICharacter*> SpawnedAICharacters;

	/** Resolve the effective World ID (from property or plugin settings) */
	FString GetEffectiveWorldID() const;

	/** Resolve the effective server URL (from plugin settings) */
	FString GetEffectiveServerURL() const;

	void OnCharactersFetched(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void DrawDebugSpheres();
};
