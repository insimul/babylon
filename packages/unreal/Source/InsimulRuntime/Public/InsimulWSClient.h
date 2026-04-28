// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "IWebSocket.h"

/**
 * Delegate types for streaming conversation events from the Insimul WS bridge.
 * These fire on the game thread as data arrives from the server.
 */
DECLARE_DELEGATE_TwoParams(FOnInsimulWSTextChunk, const FString& /* Text */, bool /* bIsFinal */);
DECLARE_DELEGATE_TwoParams(FOnInsimulWSAudioChunk, const TArray<uint8>& /* AudioData */, int32 /* DurationMs */);
DECLARE_DELEGATE_OneParam(FOnInsimulWSTranscript, const FString& /* Transcript */);
DECLARE_DELEGATE(FOnInsimulWSComplete);
DECLARE_DELEGATE_OneParam(FOnInsimulWSError, const FString& /* ErrorMessage */);
DECLARE_DELEGATE_TwoParams(FOnInsimulWSMeta, const FString& /* SessionId */, const FString& /* State */);

/**
 * WebSocket client for the Insimul conversation WS bridge.
 *
 * Connects to /ws/conversation on the Insimul server for persistent,
 * bidirectional streaming. The WS bridge wraps the server-side gRPC
 * conversation pipeline (LLM streaming, TTS, viseme generation).
 *
 * This gives us the same streaming performance as a native gRPC client
 * without requiring proto stub generation for Insimul's service definition.
 */
class INSIMULRUNTIME_API FInsimulWSClient
{
public:
	FInsimulWSClient();
	~FInsimulWSClient();

	/**
	 * Initialize and connect to the Insimul WS bridge.
	 * @param ServerURL - Base URL (e.g., "http://localhost:8080"); ws:// will be derived
	 */
	void Connect(const FString& ServerURL);

	/** Disconnect from the server. */
	void Disconnect();

	/** Whether the WebSocket is currently connected. */
	bool IsConnected() const;

	/**
	 * Send a text message and begin streaming the response.
	 * Delegates will fire as data arrives.
	 */
	void SendText(
		const FString& Text,
		const FString& SessionId,
		const FString& CharacterId,
		const FString& WorldId,
		const FString& LanguageCode = TEXT("en")
	);

	/**
	 * Send audio data for STT + LLM + TTS pipeline.
	 * Call SendAudioChunk for each chunk, then SendAudioEnd to process.
	 */
	void SendAudioChunk(const TArray<uint8>& AudioData);

	/** Signal end of audio input and begin processing. */
	void SendAudioEnd(
		const FString& SessionId,
		const FString& CharacterId,
		const FString& WorldId,
		const FString& LanguageCode = TEXT("en")
	);

	/** Send a system command (END, PAUSE, RESUME). */
	void SendSystemCommand(const FString& CommandType, const FString& SessionId);

	// Streaming event delegates
	FOnInsimulWSTextChunk OnTextChunk;
	FOnInsimulWSAudioChunk OnAudioChunk;
	FOnInsimulWSTranscript OnTranscript;
	FOnInsimulWSComplete OnComplete;
	FOnInsimulWSError OnError;
	FOnInsimulWSMeta OnMeta;

private:
	void OnConnected();
	void OnConnectionError(const FString& Error);
	void OnClosed(int32 StatusCode, const FString& Reason, bool bWasClean);
	void OnMessage(const FString& Message);
	void OnRawMessage(const void* Data, SIZE_T Size, SIZE_T BytesRemaining);

	/** Derive ws:// URL from http:// URL */
	static FString DeriveWSUrl(const FString& HttpURL);

	TSharedPtr<IWebSocket> WebSocket;
	bool bConnected = false;

	// Audio metadata queue (pairs with binary audio frames from server)
	struct FAudioMeta
	{
		int32 Encoding = 3;
		int32 SampleRate = 24000;
		int32 DurationMs = 0;
	};
	TArray<FAudioMeta> PendingAudioMeta;
};
