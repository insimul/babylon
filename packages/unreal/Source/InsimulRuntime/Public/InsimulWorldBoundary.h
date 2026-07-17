// Copyright 2024 Insimul. All Rights Reserved.
//
// UStruct boundary layer for the Insimul world source.
//
// This is the ENGINE SEAM: it converts the portable, std-based
// FInsimulWorldSource DTOs (Portable/InsimulWorldSource.h, host-testable)
// into Blueprint/UMG-consumable USTRUCTs. It is Unreal-coupled and therefore
// *syntax-gated*: everything below is compiled only under Unreal Build Tool
// (WITH_ENGINE), and is verified by human build, not by the host CMake
// harness (tools/verify-unreal), which excludes this file.
//
// Keep this file a THIN conversion layer over the portable core — no world
// parsing or version logic here; that lives in the host-tested loader.

#pragma once

#if WITH_ENGINE

#include "CoreMinimal.h"
#include "InsimulWorldBoundary.generated.h"

namespace insimul { class FInsimulWorldSource; }

/** Blueprint-facing mirror of insimul::FWorldMetaDTO. */
USTRUCT(BlueprintType)
struct FInsimulWorldMeta
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Name;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString WorldType;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString GameType;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString TargetLanguage;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Description;
};

/** Blueprint-facing mirror of insimul::FCharacterDTO. */
USTRUCT(BlueprintType)
struct FInsimulWorldCharacter
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString FirstName;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString LastName;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Gender;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Occupation;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString CurrentLocation;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	bool bIsAlive = true;
};

/** Blueprint-facing mirror of insimul::FQuestDTO. */
USTRUCT(BlueprintType)
struct FInsimulWorldQuest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Id;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Name;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Description;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString GiverNpcId;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Status;

	/** Prolog source — the canonical quest representation. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|World")
	FString Content;
};

/**
 * Boundary conversion helpers. Defined in InsimulWorldBoundary.cpp (also
 * syntax-gated). Each takes the host-tested world source and projects a
 * slice into UStructs for Blueprint/UMG consumption.
 */
namespace InsimulWorldBoundary
{
	FInsimulWorldMeta ToWorldMeta(const insimul::FInsimulWorldSource& Source);
	TArray<FInsimulWorldCharacter> ToCharacters(const insimul::FInsimulWorldSource& Source);
	TArray<FInsimulWorldQuest> ToQuests(const insimul::FInsimulWorldSource& Source);
}

#endif // WITH_ENGINE
