// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "InsimulWorldExport.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

/**
 * Offline conversation provider.
 *
 * Replaces the WebSocket/REST clients when bOfflineMode is enabled.
 * Routes conversations through a local LLM server (Ollama or llama.cpp)
 * and optionally synthesizes TTS via the Runtime Text To Speech plugin.
 *
 * Uses the same delegate signatures as FInsimulWSClient so
 * InsimulConversationComponent can swap providers transparently.
 */

// Same delegate types as FInsimulWSClient for drop-in compatibility
DECLARE_DELEGATE_TwoParams(FOnOfflineTextChunk, const FString& /* Text */, bool /* bIsFinal */);
DECLARE_DELEGATE_TwoParams(FOnOfflineAudioChunk, const TArray<uint8>& /* AudioData */, int32 /* DurationMs */);
DECLARE_DELEGATE_OneParam(FOnOfflineTranscript, const FString& /* Transcript */);
DECLARE_DELEGATE(FOnOfflineComplete);
DECLARE_DELEGATE_OneParam(FOnOfflineError, const FString& /* ErrorMessage */);

class INSIMULRUNTIME_API FInsimulOfflineProvider
{
public:
	FInsimulOfflineProvider();
	~FInsimulOfflineProvider();

	/** Initialize with exported world data and LLM settings */
	void Initialize(
		const FString& LLMServerURL,
		const FString& ModelName,
		int32 MaxTokens,
		float Temperature
	);

	/** Load world data from file (populates character contexts) */
	bool LoadWorldData(const FString& FilePath);

	/** Load world data from a data directory (split-file layout) */
	bool LoadWorldDataFromDirectory(const FString& DataDirectory);

	/** Whether world data is loaded and LLM is configured */
	bool IsReady() const { return bWorldLoaded; }

	/**
	 * Send a text message and receive streaming response via delegates.
	 * Builds a prompt from the character's dialogue context + conversation history,
	 * sends it to the local LLM, and fires OnTextChunk as tokens arrive.
	 */
	void SendText(
		const FString& Text,
		const FString& SessionId,
		const FString& CharacterId,
		const FString& LanguageCode = TEXT("en")
	);

	/** End a conversation session (clears history) */
	void EndSession(const FString& SessionId);

	/** Get the greeting for a character (from dialogue context) */
	FString GetGreeting(const FString& CharacterId) const;

	/** Get the voice name for a character (from dialogue context) */
	FString GetVoice(const FString& CharacterId) const;

	/** Get a list of all available character IDs */
	TArray<FString> GetCharacterIds() const;

	// Delegates — same interface as FInsimulWSClient
	FOnOfflineTextChunk OnTextChunk;
	FOnOfflineAudioChunk OnAudioChunk;
	FOnOfflineTranscript OnTranscript;
	FOnOfflineComplete OnComplete;
	FOnOfflineError OnError;

private:
	/** Exported world data */
	FInsimulExportedWorld WorldData;
	bool bWorldLoaded = false;

	/** LLM configuration */
	FString LLMServerURL;
	FString LLMModel;
	int32 LLMMaxTokens = 256;
	float LLMTemperature = 0.7f;

	/** Per-session conversation history */
	struct FConversationSession
	{
		FString CharacterId;
		TArray<TPair<FString, FString>> History; // (role, text) pairs
	};
	TMap<FString, FConversationSession> Sessions;

	/** Build the full LLM prompt from context + history */
	FString BuildPrompt(const FString& CharacterId, const FString& UserMessage, const FString& SessionId) const;

	/** Build the JSON request body for the LLM server */
	FString BuildLLMRequestBody(const FString& Prompt) const;

	/** Handle the LLM HTTP response */
	void OnLLMResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString SessionId, FString CharacterId);

	/** Extract the generated text from the LLM response JSON */
	FString ParseLLMResponse(const FString& ResponseBody) const;
};
