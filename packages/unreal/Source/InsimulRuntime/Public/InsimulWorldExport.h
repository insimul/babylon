// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "InsimulWorldExport.generated.h"

/**
 * Dialogue truth — a piece of world knowledge a character has.
 * Matches the export system's FInsimulDialogueTruth.
 */
USTRUCT(BlueprintType)
struct FInsimulDialogueTruth
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Title;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Content;
};

/**
 * Dialogue context for a single character.
 * Matches the export system's FInsimulDialogueContext.
 * Contains the pre-built system prompt, greeting, voice, and knowledge base.
 */
USTRUCT(BlueprintType)
struct FInsimulDialogueContext
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString CharacterId;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString CharacterName;

	/** Pre-built system prompt with personality, relationships, and truths */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString SystemPrompt;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Greeting;

	/** Voice name for TTS (e.g., "Kore", "Charon", or a Piper model speaker) */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Voice;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	TArray<FInsimulDialogueTruth> Truths;
};

/**
 * Exported character data. Matches the export system's FInsimulCharacterData.
 */
USTRUCT(BlueprintType)
struct FInsimulExportedCharacter
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString CharacterId;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString FirstName;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString LastName;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Gender;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Occupation;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	int32 BirthYear = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	bool bIsAlive = true;

	// Big Five personality traits (0.0 to 1.0)
	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	float Openness = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	float Conscientiousness = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	float Extroversion = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	float Agreeableness = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	float Neuroticism = 0.0f;
};

/**
 * Complete exported world data — loaded from the Insimul export JSON.
 * Contains character data and pre-built dialogue contexts for offline mode.
 */
USTRUCT(BlueprintType)
struct FInsimulExportedWorld
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString WorldName;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString WorldId;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	TArray<FInsimulExportedCharacter> Characters;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	TArray<FInsimulDialogueContext> DialogueContexts;

	/** Find a dialogue context by character ID. Returns nullptr if not found. */
	const FInsimulDialogueContext* FindDialogueContext(const FString& CharacterId) const;

	/** Find a character by ID. Returns nullptr if not found. */
	const FInsimulExportedCharacter* FindCharacter(const FString& CharacterId) const;
};

/**
 * Loads exported Insimul world data from JSON files.
 *
 * Supports two loading modes:
 * 1. Single-file: Load a world_export.json that contains everything
 * 2. Split-file: Load characters.json + dialogue-contexts.json separately
 *    (matches the Insimul export system's Content/Data/ layout)
 */
class INSIMULRUNTIME_API FInsimulWorldExportLoader
{
public:
	/** Load from a single combined export JSON file */
	static bool LoadFromFile(const FString& FilePath, FInsimulExportedWorld& OutWorld);

	/** Load from the export system's split-file layout (Content/Data/ directory) */
	static bool LoadFromDataDirectory(const FString& DataDirectory, FInsimulExportedWorld& OutWorld);

	/** Load from a JSON string */
	static bool LoadFromString(const FString& JsonString, FInsimulExportedWorld& OutWorld);

private:
	static bool ParseCharactersJson(const FString& Json, TArray<FInsimulExportedCharacter>& OutCharacters);
	static bool ParseDialogueContextsJson(const FString& Json, TArray<FInsimulDialogueContext>& OutContexts);
};
