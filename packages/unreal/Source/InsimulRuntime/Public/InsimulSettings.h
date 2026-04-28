// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "InsimulSettings.generated.h"

/** Chat provider: where LLM inference runs. */
UENUM(BlueprintType)
enum class EInsimulChatProvider : uint8
{
	/** Insimul server via WebSocket/REST (Gemini LLM, server-side TTS) */
	Server UMETA(DisplayName = "Server"),
	/** Local LLM server (Ollama / llama.cpp) with exported world data */
	Local UMETA(DisplayName = "Local LLM"),
};

/** TTS provider: where text-to-speech runs. */
UENUM(BlueprintType)
enum class EInsimulTTSProvider : uint8
{
	/** Server-side TTS (audio streams inline with chat response) */
	Server UMETA(DisplayName = "Server"),
	/** Local TTS via Runtime Text To Speech plugin (Piper/Kokoro ONNX) */
	Local UMETA(DisplayName = "Local (Runtime TTS Plugin)"),
	/** TTS disabled */
	None UMETA(DisplayName = "None"),
};

/** STT provider: where speech-to-text runs. */
UENUM(BlueprintType)
enum class EInsimulSTTProvider : uint8
{
	/** Server-side STT */
	Server UMETA(DisplayName = "Server"),
	/** Local STT (not yet implemented) */
	Local UMETA(DisplayName = "Local"),
	/** STT disabled */
	None UMETA(DisplayName = "None"),
};

/**
 * Global settings for the Insimul plugin.
 * Configure in Project Settings > Plugins > Insimul.
 *
 * The provider model matches the JavaScript SDK (@insimul/typescript):
 * pick a provider for Chat (LLM), TTS, and STT independently.
 */
UCLASS(config = Game, defaultconfig, meta = (DisplayName = "Insimul"))
class INSIMULRUNTIME_API UInsimulSettings : public UObject
{
	GENERATED_BODY()

public:
	// ── Provider Selection ────────────────────────────────────────────

	/** Chat (LLM) provider — where NPC dialogue is generated. */
	UPROPERTY(Config, EditAnywhere, Category = "Providers")
	EInsimulChatProvider ChatProvider = EInsimulChatProvider::Server;

	/** TTS provider — where NPC speech audio is synthesized. */
	UPROPERTY(Config, EditAnywhere, Category = "Providers")
	EInsimulTTSProvider TTSProvider = EInsimulTTSProvider::Server;

	/** STT provider — where player voice input is transcribed. */
	UPROPERTY(Config, EditAnywhere, Category = "Providers")
	EInsimulSTTProvider STTProvider = EInsimulSTTProvider::None;

	// ── Server Settings (ChatProvider = Server) ──────────────────────

	/** Base URL of the Insimul server */
	UPROPERTY(Config, EditAnywhere, Category = "Server", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Server"))
	FString ServerURL = TEXT("http://localhost:8080");

	/** Default world ID for conversations */
	UPROPERTY(Config, EditAnywhere, Category = "Server")
	FString DefaultWorldID = TEXT("default-world");

	/** Optional API key for authentication */
	UPROPERTY(Config, EditAnywhere, Category = "Server", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Server"))
	FString APIKey;

	/** Prefer WebSocket streaming over REST (recommended for low latency) */
	UPROPERTY(Config, EditAnywhere, Category = "Server", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Server"))
	bool bPreferWebSocket = true;

	// ── Local LLM Settings (ChatProvider = Local) ────────────────────

	/** Path to a local GGUF model file for in-process inference (relative to Content/).
	 *  When set, the plugin spawns llama.cpp as a subprocess — no external server needed.
	 *  Leave empty to use LocalLLMServerURL instead (requires running Ollama/llama.cpp separately).
	 *  Example: "InsimulModels/mistral-7b-instruct.Q4_K_M.gguf" */
	UPROPERTY(Config, EditAnywhere, Category = "Local LLM", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Local"))
	FString LocalModelPath;

	/** URL of an external LLM server (used when LocalModelPath is empty).
	 *  Ollama: http://localhost:11434/api/generate
	 *  llama.cpp: http://localhost:8081/completion */
	UPROPERTY(Config, EditAnywhere, Category = "Local LLM", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Local"))
	FString LocalLLMServerURL = TEXT("http://localhost:11434/api/generate");

	/** LLM model name (used by Ollama; ignored when using LocalModelPath) */
	UPROPERTY(Config, EditAnywhere, Category = "Local LLM", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Local"))
	FString LocalLLMModel = TEXT("mistral");

	/** Path to the exported Insimul world data JSON file (relative to Content/) */
	UPROPERTY(Config, EditAnywhere, Category = "Local LLM", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Local"))
	FString WorldDataPath = TEXT("InsimulData/world_export.json");

	/** Maximum tokens for LLM response generation */
	UPROPERTY(Config, EditAnywhere, Category = "Local LLM", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Local", ClampMin = "32", ClampMax = "2048"))
	int32 MaxTokens = 256;

	/** LLM temperature (0.0 = deterministic, 1.0+ = creative) */
	UPROPERTY(Config, EditAnywhere, Category = "Local LLM", meta = (EditCondition = "ChatProvider == EInsimulChatProvider::Local", ClampMin = "0.0", ClampMax = "2.0"))
	float Temperature = 0.7f;

	// ── Local TTS Settings (TTSProvider = Local) ─────────────────────

	/** Voice model name for Runtime Text To Speech plugin.
	 *  Piper examples: "en_US-amy-medium", "en_GB-alba-medium"
	 *  Kokoro examples: "en_US-libritts_r-medium" */
	UPROPERTY(Config, EditAnywhere, Category = "Local TTS", meta = (EditCondition = "TTSProvider == EInsimulTTSProvider::Local"))
	FString LocalVoiceModel = TEXT("en_US-amy-medium");

	/** Speaker index within the voice model (for multi-speaker models) */
	UPROPERTY(Config, EditAnywhere, Category = "Local TTS", meta = (EditCondition = "TTSProvider == EInsimulTTSProvider::Local", ClampMin = "0"))
	int32 LocalSpeakerIndex = 0;

	// ── Common Settings ──────────────────────────────────────────────

	/** Default language code for conversations (BCP47, e.g., "en", "fr-FR", "ja") */
	UPROPERTY(Config, EditAnywhere, Category = "Common")
	FString LanguageCode = TEXT("en");

	// ── Convenience Accessors ────────────────────────────────────────

	/** Whether chat is routed to a local LLM (equivalent to old bOfflineMode) */
	bool IsOfflineMode() const { return ChatProvider == EInsimulChatProvider::Local; }

	/** Get the singleton settings instance */
	static const UInsimulSettings* Get()
	{
		return GetDefault<UInsimulSettings>();
	}
};
