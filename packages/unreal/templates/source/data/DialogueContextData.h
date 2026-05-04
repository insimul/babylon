#pragma once

#include "CoreMinimal.h"
#include "DialogueContextData.generated.h"

USTRUCT(BlueprintType)
struct FInsimulDialogueTruth
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString Title;

    UPROPERTY(BlueprintReadOnly)
    FString Content;
};

USTRUCT(BlueprintType)
struct FInsimulDialogueContext
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString CharacterId;

    UPROPERTY(BlueprintReadOnly)
    FString CharacterName;

    UPROPERTY(BlueprintReadOnly)
    FString SystemPrompt;

    UPROPERTY(BlueprintReadOnly)
    FString Greeting;

    UPROPERTY(BlueprintReadOnly)
    FString Voice;

    UPROPERTY(BlueprintReadOnly)
    TArray<FInsimulDialogueTruth> Truths;
};

USTRUCT(BlueprintType)
struct FInsimulAIConfig
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite)
    FString ApiMode = TEXT("insimul");

    UPROPERTY(BlueprintReadWrite)
    FString InsimulEndpoint = TEXT("/api/gemini/chat");

    UPROPERTY(BlueprintReadWrite)
    FString GeminiModel = TEXT("gemini-3.1-flash");

    UPROPERTY(BlueprintReadWrite)
    FString GeminiApiKey = TEXT("YOUR_GEMINI_API_KEY");

    UPROPERTY(BlueprintReadWrite)
    bool bVoiceEnabled = true;

    UPROPERTY(BlueprintReadWrite)
    FString DefaultVoice = TEXT("Kore");
};

USTRUCT(BlueprintType)
struct FChatMessage
{
    GENERATED_BODY()

    UPROPERTY()
    FString Role;

    UPROPERTY()
    FString Text;
};
