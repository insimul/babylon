// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "InsimulConversationComponent.generated.h"

class FInsimulWSClient;
class FInsimulRestClient;
class FInsimulOfflineProvider;

USTRUCT(BlueprintType)
struct FInsimulConversationConfig
{
	GENERATED_BODY()

	/** The URL of the Insimul API server */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FString APIBaseUrl = TEXT("http://localhost:8080");

	/** The world ID to use for conversations */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FString WorldID = TEXT("default-world");

	/** The character ID to use for this NPC */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FString CharacterID = TEXT("");

	/** How often to check for nearby conversations (in seconds) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	float ConversationCheckInterval = 5.0f;

	/** Maximum distance to start a conversation */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	float ConversationRadius = 300.0f;

	/** Character ID representing the player in the Insimul world */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FString PlayerCharacterID = TEXT("player");
};

USTRUCT(BlueprintType)
struct FInsimulUtterance
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString SpeakerID;

	UPROPERTY(BlueprintReadOnly)
	FString Text;

	UPROPERTY(BlueprintReadOnly)
	FString Tone;

	UPROPERTY(BlueprintReadOnly)
	int32 Timestamp = 0;
};

USTRUCT(BlueprintType)
struct FInsimulConversation
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString ConversationID;

	UPROPERTY(BlueprintReadOnly)
	TArray<FString> Participants;

	UPROPERTY(BlueprintReadOnly)
	TArray<FInsimulUtterance> Utterances;

	UPROPERTY(BlueprintReadOnly)
	bool bIsComplete = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInsimulConversationStarted, const FInsimulConversation&, Conversation);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInsimulUtteranceReceived, const FInsimulUtterance&, Utterance);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInsimulConversationEnded, const FInsimulConversation&, Conversation);
/** Fired for each streaming audio chunk (TTS). AudioData is raw PCM/MP3, DurationMs is the chunk duration. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnInsimulAudioChunkReceived, const TArray<uint8>&, AudioData, int32, DurationMs);

UCLASS(ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class INSIMULRUNTIME_API UInsimulConversationComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UInsimulConversationComponent();

	/** Configuration for the Insimul conversation system */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul")
	FInsimulConversationConfig Config;

	/** Called when a conversation starts */
	UPROPERTY(BlueprintAssignable, Category = "Insimul")
	FOnInsimulConversationStarted OnConversationStarted;

	/** Called when an utterance is received */
	UPROPERTY(BlueprintAssignable, Category = "Insimul")
	FOnInsimulUtteranceReceived OnUtteranceReceived;

	/** Called when a conversation ends */
	UPROPERTY(BlueprintAssignable, Category = "Insimul")
	FOnInsimulConversationEnded OnConversationEnded;

	/** Called when a streaming audio chunk arrives from TTS */
	UPROPERTY(BlueprintAssignable, Category = "Insimul")
	FOnInsimulAudioChunkReceived OnAudioChunkReceived;

	/** Start a conversation with another character */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void StartConversationWithCharacter(const FString& TargetCharacterID);

	/** Send a message in the current conversation (uses WebSocket streaming when available) */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void SendMessage(const FString& Message);

	/** End the current conversation */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void EndConversation();

	/** Check if currently in a conversation */
	UFUNCTION(BlueprintPure, Category = "Insimul")
	bool IsInConversation() const { return !CurrentConversationID.IsEmpty() || bWSConversationActive; }

	/** Initialize the component with the current Config. Call this after setting CharacterID and WorldID. */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void InitializeInsimul();

	/** Start a conversation where the player is the initiator and this NPC is the target. */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void StartPlayerInitiatedConversation();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	// ── Shared streaming clients ──────────────────────────────────────
	FInsimulWSClient* WSClient = nullptr;
	FInsimulRestClient* RestClient = nullptr;
	FInsimulOfflineProvider* OfflineProvider = nullptr;
	bool bWSConversationActive = false;
	bool bOfflineMode = false;

	/** Session ID for WebSocket conversations */
	FString WSSessionId;

	// ── REST fallback state ──────────────────────────────────────────
	FString CurrentConversationID;
	FTimerHandle ConversationTimer;
	TArray<AActor*> NearbyCharacters;

	// ── NPC-NPC proximity detection ──────────────────────────────────
	void CheckForNearbyCharacters();

	// ── REST API methods (fallback) ──────────────────────────────────
	void StartConversationREST(const FString& InitiatorID, const FString& TargetID);
	void ContinueConversationREST(const FString& PlayerMessage = TEXT(""));
	void EndConversationREST();
	void ProcessConversationData(const TSharedPtr<FJsonObject>& ConversationJson);
	void GetCharacterData(const FString& CharacterID);

	// ── WebSocket streaming callbacks ────────────────────────────────
	void OnWSTextChunk(const FString& Text, bool bIsFinal);
	void OnWSAudioChunk(const TArray<uint8>& AudioData, int32 DurationMs);
	void OnWSTranscript(const FString& Transcript);
	void OnWSComplete();
	void OnWSError(const FString& ErrorMessage);
	void OnWSMeta(const FString& SessionId, const FString& State);

	// ── REST client callbacks ────────────────────────────────────────
	void OnRESTConversationStarted(FString ConversationId);
	void OnRESTUtteranceReceived(FString Text, FString SpeakerId);
	void OnRESTAudioReceived(TArray<uint8> AudioData);
	void OnRESTTranscriptReceived(FString Transcript);
	void OnRESTError(FString ErrorMessage);

	// ── Offline provider callbacks ───────────────────────────────────
	void OnOfflineTextChunk(const FString& Text, bool bIsFinal);
	void OnOfflineComplete();
	void OnOfflineError(const FString& ErrorMessage);
};
