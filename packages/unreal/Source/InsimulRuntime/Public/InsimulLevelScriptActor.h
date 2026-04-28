// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "InsimulLevelScriptActor.generated.h"

UCLASS()
class INSIMULRUNTIME_API AInsimulLevelScriptActor : public AActor
{
	GENERATED_BODY()

public:
	AInsimulLevelScriptActor();

protected:
	virtual void BeginPlay() override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	bool bSpawnInsimulNPCs = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	TArray<FVector> SpawnLocations;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	TArray<FString> CharacterIDs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	TArray<FString> CharacterNames;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FString WorldID = TEXT("default-world");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FString APIBaseUrl = TEXT("http://localhost:3000");

private:
	void SpawnInsimulCharacters();
};
