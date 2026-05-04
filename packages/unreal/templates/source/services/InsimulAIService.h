#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Http.h"
#include "Data/DialogueContextData.h"
#include "InsimulAIService.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnChatChunk, const FString&, NPCId, const FString&, Text);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnChatComplete, const FString&, NPCId, const FString&, FullText);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnChatError, const FString&, NPCId, const FString&, Error);

/**
 * AI service for NPC dialogue — supports Insimul API and direct Gemini modes.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulAIService : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    void InitializeService(const FInsimulAIConfig& InConfig, const TArray<FInsimulDialogueContext>& InContexts);

    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    FInsimulDialogueContext GetContext(const FString& CharacterId) const;

    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    void SendMessage(const FString& CharacterId, const FString& UserMessage);

    /**
     * Send a chat message with a natural-language appearance description.
     * Mirrors BabylonChatPanel.ts sendMessageViaGrpc gameContext.appearanceDescription:
     * the description is forwarded to the server so the LLM can acknowledge
     * what the player actually sees on the NPC model.
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    void SendMessageWithAppearance(const FString& CharacterId, const FString& UserMessage, const FString& AppearanceDescription);

    UFUNCTION(BlueprintCallable, Category = "Insimul|AI")
    void ClearHistory(const FString& CharacterId);

    UPROPERTY(BlueprintAssignable, Category = "Insimul|AI")
    FOnChatChunk OnChatChunk;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|AI")
    FOnChatComplete OnChatComplete;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|AI")
    FOnChatError OnChatError;

    /**
     * Broadcast when the client-side stream watchdog fires — the server did
     * not produce a `done` event within the timeout window. Mirrors
     * BabylonChatPanel.ts streamTimeoutMs error path. Listeners should clear
     * any "thinking" UI and show a connection-timeout message.
     */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|AI")
    FOnChatError OnChatTimedOut;

private:
    FInsimulAIConfig Config;
    TMap<FString, FInsimulDialogueContext> Contexts;
    TMap<FString, TArray<FChatMessage>> Histories;
    FString InsimulBaseUrl;

    /** Per-character pending appearance description, applied to the next request. */
    TMap<FString, FString> PendingAppearance;

    /** Per-character watchdog handles so each in-flight request can time out independently. */
    TMap<FString, FTimerHandle> StreamWatchdogTimers;

    /** Watchdog window in seconds — mirrors BabylonChatPanel.ts streamTimeoutMs. */
    static constexpr float STREAM_TIMEOUT_SECONDS = 90.0f;

    void SendInsimulRequest(const FString& CharacterId, const FInsimulDialogueContext& Context);
    void SendGeminiRequest(const FString& CharacterId, const FInsimulDialogueContext& Context);

    void HandleResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString CharacterId);

    FString BuildGeminiRequestBody(const FString& SystemPrompt, const TArray<FChatMessage>& History) const;
    FString ExtractTextFromSSE(const FString& ResponseBody) const;
    FString ExtractTextFromGemini(const FString& ResponseBody) const;

    /** Arm the per-character watchdog. Replaces any prior handle for that character. */
    void StartStreamWatchdog(const FString& CharacterId, const FString& UserMessage);

    /** Clear the per-character watchdog. Safe to call multiple times. */
    void ClearStreamWatchdog(const FString& CharacterId);

    /** Invoked when the watchdog fires — broadcasts OnChatTimedOut + OnChatError. */
    void OnStreamWatchdogFired(FString CharacterId, FString UserMessage);
};
