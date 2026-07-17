// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulWorldBoundary.h"

#if WITH_ENGINE

#include "../Portable/InsimulWorldSource.h"

namespace {
	/** UTF-8 std::string -> FString at the engine seam. */
	FORCEINLINE FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}
}

namespace InsimulWorldBoundary
{
	FInsimulWorldMeta ToWorldMeta(const insimul::FInsimulWorldSource& Source)
	{
		const insimul::FWorldMetaDTO& W = Source.World().World;
		FInsimulWorldMeta Out;
		Out.Id = ToFString(W.Id);
		Out.Name = ToFString(W.Name);
		Out.WorldType = ToFString(W.WorldType);
		Out.GameType = ToFString(W.GameType);
		Out.TargetLanguage = ToFString(W.TargetLanguage);
		Out.Description = ToFString(W.Description);
		return Out;
	}

	TArray<FInsimulWorldCharacter> ToCharacters(const insimul::FInsimulWorldSource& Source)
	{
		TArray<FInsimulWorldCharacter> Out;
		for (const insimul::FCharacterDTO& C : Source.World().Characters)
		{
			FInsimulWorldCharacter Item;
			Item.Id = ToFString(C.Id);
			Item.FirstName = ToFString(C.FirstName);
			Item.LastName = ToFString(C.LastName);
			Item.Gender = ToFString(C.Gender);
			Item.Occupation = ToFString(C.Occupation);
			Item.CurrentLocation = ToFString(C.CurrentLocation);
			Item.bIsAlive = C.bIsAlive;
			Out.Add(MoveTemp(Item));
		}
		return Out;
	}

	TArray<FInsimulWorldQuest> ToQuests(const insimul::FInsimulWorldSource& Source)
	{
		TArray<FInsimulWorldQuest> Out;
		for (const insimul::FQuestDTO& Q : Source.World().Quests)
		{
			FInsimulWorldQuest Item;
			Item.Id = ToFString(Q.Id);
			Item.Name = ToFString(Q.Name);
			Item.Description = ToFString(Q.Description);
			Item.GiverNpcId = ToFString(Q.GiverNpcId);
			Item.Status = ToFString(Q.Status);
			Item.Content = ToFString(Q.Content);
			Out.Add(MoveTemp(Item));
		}
		return Out;
	}
}

#endif // WITH_ENGINE
