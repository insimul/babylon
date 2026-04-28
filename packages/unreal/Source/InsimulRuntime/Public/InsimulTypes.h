// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "InsimulTypes.generated.h"

/** Audio encoding format for streaming audio data. */
UENUM(BlueprintType)
enum class EInsimulAudioEncoding : uint8
{
	Unspecified = 0,
	PCM = 1,
	OPUS = 2,
	MP3 = 3
};

/** Conversation state. */
UENUM(BlueprintType)
enum class EInsimulConversationState : uint8
{
	Unspecified = 0,
	Started = 1,
	Active = 2,
	Paused = 3,
	Ended = 4
};

/** A single viseme for lip sync. */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulViseme
{
	GENERATED_BODY()

	/** Phoneme name (e.g., "aa", "oh", "sil") */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString Phoneme;

	/** Blend weight 0..1 */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	float Weight = 0.0f;

	/** Duration in milliseconds */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	int32 DurationMs = 0;
};

/** Facial/viseme data for a single response chunk. */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulFacialData
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	TArray<FInsimulViseme> Visemes;
};

/** A server-triggered game action (animation, spawn, state change, etc.). */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulActionTrigger
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString ActionType;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	FString TargetId;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	TMap<FString, FString> Parameters;
};

/** An audio chunk from the TTS stream (with encoding metadata). */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulAudioChunk
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	TArray<uint8> Data;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	EInsimulAudioEncoding Encoding = EInsimulAudioEncoding::Unspecified;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	int32 SampleRate = 24000;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul")
	int32 DurationMs = 0;
};

// ── Delegate declarations ────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInsimulFacialData, const FInsimulFacialData&, Data);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInsimulActionTrigger, const FInsimulActionTrigger&, Action);
