// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulWorldExport.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// ── FInsimulExportedWorld ──────────────────────────────────────────────

const FInsimulDialogueContext* FInsimulExportedWorld::FindDialogueContext(const FString& CharacterId) const
{
	for (const FInsimulDialogueContext& Ctx : DialogueContexts)
	{
		if (Ctx.CharacterId == CharacterId)
		{
			return &Ctx;
		}
	}
	return nullptr;
}

const FInsimulExportedCharacter* FInsimulExportedWorld::FindCharacter(const FString& CharacterId) const
{
	for (const FInsimulExportedCharacter& Char : Characters)
	{
		if (Char.CharacterId == CharacterId)
		{
			return &Char;
		}
	}
	return nullptr;
}

// ── FInsimulWorldExportLoader ─────────────────────────────────────────

bool FInsimulWorldExportLoader::LoadFromFile(const FString& FilePath, FInsimulExportedWorld& OutWorld)
{
	// Resolve relative paths against Content directory
	FString ResolvedPath = FilePath;
	if (FPaths::IsRelative(ResolvedPath))
	{
		ResolvedPath = FPaths::Combine(FPaths::ProjectContentDir(), ResolvedPath);
	}

	FString JsonString;
	if (!FFileHelper::LoadFileToString(JsonString, *ResolvedPath))
	{
		UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to load world export from: %s"), *ResolvedPath);
		return false;
	}

	UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded world export: %s (%d chars)"), *ResolvedPath, JsonString.Len());
	return LoadFromString(JsonString, OutWorld);
}

bool FInsimulWorldExportLoader::LoadFromDataDirectory(const FString& DataDirectory, FInsimulExportedWorld& OutWorld)
{
	FString ResolvedDir = DataDirectory;
	if (FPaths::IsRelative(ResolvedDir))
	{
		ResolvedDir = FPaths::Combine(FPaths::ProjectContentDir(), ResolvedDir);
	}

	// Try loading the WorldIR for metadata
	FString WorldIRJson;
	if (FFileHelper::LoadFileToString(WorldIRJson, *FPaths::Combine(ResolvedDir, TEXT("world-ir.json"))))
	{
		TSharedPtr<FJsonObject> WorldIR;
		TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(WorldIRJson);
		if (FJsonSerializer::Deserialize(Reader, WorldIR) && WorldIR.IsValid())
		{
			if (WorldIR->HasField(TEXT("meta")))
			{
				const TSharedPtr<FJsonObject> Meta = WorldIR->GetObjectField(TEXT("meta"));
				OutWorld.WorldName = Meta->GetStringField(TEXT("worldName"));
				OutWorld.WorldId = Meta->GetStringField(TEXT("worldId"));
			}
		}
	}

	// Load characters
	FString CharactersJson;
	if (FFileHelper::LoadFileToString(CharactersJson, *FPaths::Combine(ResolvedDir, TEXT("characters.json"))))
	{
		ParseCharactersJson(CharactersJson, OutWorld.Characters);
		UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d characters from data directory"), OutWorld.Characters.Num());
	}

	// Load dialogue contexts
	FString ContextsJson;
	if (FFileHelper::LoadFileToString(ContextsJson, *FPaths::Combine(ResolvedDir, TEXT("dialogue-contexts.json"))))
	{
		ParseDialogueContextsJson(ContextsJson, OutWorld.DialogueContexts);
		UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d dialogue contexts from data directory"), OutWorld.DialogueContexts.Num());
	}

	return OutWorld.Characters.Num() > 0 || OutWorld.DialogueContexts.Num() > 0;
}

bool FInsimulWorldExportLoader::LoadFromString(const FString& JsonString, FInsimulExportedWorld& OutWorld)
{
	TSharedPtr<FJsonObject> RootObj;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);

	if (!FJsonSerializer::Deserialize(Reader, RootObj) || !RootObj.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("[Insimul] Failed to parse world export JSON"));
		return false;
	}

	// Parse world metadata
	OutWorld.WorldName = RootObj->GetStringField(TEXT("worldName"));
	OutWorld.WorldId = RootObj->GetStringField(TEXT("worldId"));

	// Parse characters
	if (RootObj->HasField(TEXT("characters")))
	{
		const TArray<TSharedPtr<FJsonValue>> CharArray = RootObj->GetArrayField(TEXT("characters"));
		for (const TSharedPtr<FJsonValue>& Val : CharArray)
		{
			const TSharedPtr<FJsonObject> Obj = Val->AsObject();
			if (!Obj.IsValid()) continue;

			FInsimulExportedCharacter Char;
			Char.CharacterId = Obj->GetStringField(TEXT("characterId"));
			if (Char.CharacterId.IsEmpty()) Char.CharacterId = Obj->GetStringField(TEXT("id"));
			Char.FirstName = Obj->GetStringField(TEXT("firstName"));
			Char.LastName = Obj->GetStringField(TEXT("lastName"));
			Char.Gender = Obj->GetStringField(TEXT("gender"));
			Char.Occupation = Obj->GetStringField(TEXT("occupation"));
			Char.BirthYear = Obj->HasField(TEXT("birthYear")) ? Obj->GetIntegerField(TEXT("birthYear")) : 0;
			Char.bIsAlive = !Obj->HasField(TEXT("isAlive")) || Obj->GetBoolField(TEXT("isAlive"));

			// Personality — handle both nested object and flat fields
			if (Obj->HasField(TEXT("personality")))
			{
				const TSharedPtr<FJsonObject> P = Obj->GetObjectField(TEXT("personality"));
				Char.Openness = P->GetNumberField(TEXT("openness"));
				Char.Conscientiousness = P->GetNumberField(TEXT("conscientiousness"));
				Char.Extroversion = P->GetNumberField(TEXT("extroversion"));
				Char.Agreeableness = P->GetNumberField(TEXT("agreeableness"));
				Char.Neuroticism = P->GetNumberField(TEXT("neuroticism"));
			}
			else
			{
				Char.Openness = Obj->HasField(TEXT("openness")) ? Obj->GetNumberField(TEXT("openness")) : 0.0f;
				Char.Conscientiousness = Obj->HasField(TEXT("conscientiousness")) ? Obj->GetNumberField(TEXT("conscientiousness")) : 0.0f;
				Char.Extroversion = Obj->HasField(TEXT("extroversion")) ? Obj->GetNumberField(TEXT("extroversion")) : 0.0f;
				Char.Agreeableness = Obj->HasField(TEXT("agreeableness")) ? Obj->GetNumberField(TEXT("agreeableness")) : 0.0f;
				Char.Neuroticism = Obj->HasField(TEXT("neuroticism")) ? Obj->GetNumberField(TEXT("neuroticism")) : 0.0f;
			}

			OutWorld.Characters.Add(Char);
		}
	}

	// Parse dialogue contexts
	if (RootObj->HasField(TEXT("dialogueContexts")))
	{
		const TArray<TSharedPtr<FJsonValue>> CtxArray = RootObj->GetArrayField(TEXT("dialogueContexts"));
		for (const TSharedPtr<FJsonValue>& Val : CtxArray)
		{
			const TSharedPtr<FJsonObject> Obj = Val->AsObject();
			if (!Obj.IsValid()) continue;

			FInsimulDialogueContext Ctx;
			Ctx.CharacterId = Obj->GetStringField(TEXT("characterId"));
			Ctx.CharacterName = Obj->GetStringField(TEXT("characterName"));
			Ctx.SystemPrompt = Obj->GetStringField(TEXT("systemPrompt"));
			Ctx.Greeting = Obj->HasField(TEXT("greeting")) ? Obj->GetStringField(TEXT("greeting")) : TEXT("");
			Ctx.Voice = Obj->HasField(TEXT("voice")) ? Obj->GetStringField(TEXT("voice")) : TEXT("Kore");

			if (Obj->HasField(TEXT("truths")))
			{
				const TArray<TSharedPtr<FJsonValue>> TruthsArr = Obj->GetArrayField(TEXT("truths"));
				for (const TSharedPtr<FJsonValue>& TVal : TruthsArr)
				{
					const TSharedPtr<FJsonObject> TObj = TVal->AsObject();
					if (!TObj.IsValid()) continue;

					FInsimulDialogueTruth Truth;
					Truth.Title = TObj->GetStringField(TEXT("title"));
					Truth.Content = TObj->GetStringField(TEXT("content"));
					Ctx.Truths.Add(Truth);
				}
			}

			OutWorld.DialogueContexts.Add(Ctx);
		}
	}

	UE_LOG(LogTemp, Log, TEXT("[Insimul] Parsed world '%s': %d characters, %d dialogue contexts"),
		*OutWorld.WorldName, OutWorld.Characters.Num(), OutWorld.DialogueContexts.Num());

	return true;
}

bool FInsimulWorldExportLoader::ParseCharactersJson(const FString& Json, TArray<FInsimulExportedCharacter>& OutCharacters)
{
	// Wrap in a root object and delegate to LoadFromString's character parsing
	FString Wrapped = FString::Printf(TEXT("{\"worldName\":\"\",\"worldId\":\"\",\"characters\":%s}"), *Json);
	FInsimulExportedWorld TempWorld;
	if (LoadFromString(Wrapped, TempWorld))
	{
		OutCharacters = MoveTemp(TempWorld.Characters);
		return true;
	}
	return false;
}

bool FInsimulWorldExportLoader::ParseDialogueContextsJson(const FString& Json, TArray<FInsimulDialogueContext>& OutContexts)
{
	FString Wrapped = FString::Printf(TEXT("{\"worldName\":\"\",\"worldId\":\"\",\"dialogueContexts\":%s}"), *Json);
	FInsimulExportedWorld TempWorld;
	if (LoadFromString(Wrapped, TempWorld))
	{
		OutContexts = MoveTemp(TempWorld.DialogueContexts);
		return true;
	}
	return false;
}
