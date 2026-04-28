// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Http.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

DECLARE_DELEGATE_OneParam(FOnInsimulRESTConversationStarted, FString /* ConversationId */);
DECLARE_DELEGATE_TwoParams(FOnInsimulRESTUtteranceReceived, FString /* Text */, FString /* SpeakerId */);
DECLARE_DELEGATE(FOnInsimulRESTConversationEnded);
DECLARE_DELEGATE_OneParam(FOnInsimulRESTError, FString /* ErrorMessage */);
DECLARE_DELEGATE_OneParam(FOnInsimulRESTAudioReceived, TArray<uint8> /* AudioData */);
DECLARE_DELEGATE_OneParam(FOnInsimulRESTTranscriptReceived, FString /* Transcript */);

/**
 * Insimul REST API Client
 * Handles HTTP communication with Insimul server for character conversations
 */
class INSIMULRUNTIME_API FInsimulRestClient
{
public:
    FInsimulRestClient();
    ~FInsimulRestClient();

    /**
     * Initialize the client with server URL
     * @param InServerURL - Base URL of Insimul server (e.g., "http://localhost:8080")
     * @param InAPIKey - Optional API key for authentication
     */
    void Initialize(const FString& InServerURL, const FString& InAPIKey = TEXT(""));

    /**
     * Start a conversation between two characters
     * @param InitiatorId - Insimul character ID of the initiator (player or NPC)
     * @param TargetId - Insimul character ID of the target NPC
     * @param Location - Location where conversation takes place
     * @param CurrentTimestep - Current simulation timestep
     */
    void StartConversation(const FString& InitiatorId, const FString& TargetId, const FString& Location, int32 CurrentTimestep = 0);

    /**
     * Continue the conversation (generates next utterance)
     * @param ConversationId - ID of the ongoing conversation
     * @param CurrentTimestep - Current simulation timestep
     */
    void ContinueConversation(const FString& InConversationId, int32 CurrentTimestep = 0);

    /**
     * End the conversation
     * @param ConversationId - ID of the conversation to end
     * @param CurrentTimestep - Current simulation timestep
     */
    void EndConversation(const FString& InConversationId, int32 CurrentTimestep = 0);

    /**
     * Get character details from Insimul
     * @param CharacterId - Insimul character ID
     */
    void GetCharacter(const FString& CharacterId);

    /**
     * Create a new character in Insimul
     * @param WorldId - Insimul world ID
     * @param FirstName - Character first name
     * @param LastName - Character last name
     * @param AdditionalData - JSON object with additional character properties
     */
    void CreateCharacter(const FString& WorldId, const FString& FirstName, const FString& LastName, const FString& AdditionalData = TEXT(""));

    /**
     * Convert text to speech using Insimul's TTS
     * @param Text - Text to convert to speech
     * @param Voice - Voice name (e.g., "Kore", "Charon")
     * @param Gender - Voice gender ("male", "female", "neutral")
     */
    void TextToSpeech(const FString& Text, const FString& Voice = TEXT("Kore"), const FString& Gender = TEXT("neutral"));

    /**
     * Convert speech to text using Insimul's STT
     * @param AudioData - WAV audio data
     */
    void SpeechToText(const TArray<uint8>& AudioData);

    // Delegates
    FOnInsimulRESTConversationStarted OnConversationStarted;
    FOnInsimulRESTUtteranceReceived OnUtteranceReceived;
    FOnInsimulRESTConversationEnded OnConversationEnded;
    FOnInsimulRESTError OnError;
    FOnInsimulRESTAudioReceived OnAudioReceived;
    FOnInsimulRESTTranscriptReceived OnTranscriptReceived;

    // Getters
    FString GetCurrentConversationId() const { return CurrentConversationId; }
    bool IsConversationActive() const { return !CurrentConversationId.IsEmpty(); }
    FString GetServerURL() const { return ServerURL; }

private:
    // HTTP request handlers
    void OnStartConversationResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void OnContinueConversationResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void OnEndConversationResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void OnGetCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void OnCreateCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void OnTextToSpeechResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void OnSpeechToTextResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);

    // Helper functions
    TSharedRef<IHttpRequest> CreateHttpRequest(const FString& Endpoint, const FString& Verb);
    void HandleHttpError(const FString& Operation, FHttpResponsePtr Response);

    // Member variables
    FString ServerURL;
    FString APIKey;
    FString CurrentConversationId;
    FString CurrentInitiatorId;
    FString CurrentTargetId;
};
