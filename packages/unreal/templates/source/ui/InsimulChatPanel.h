#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/ScrollBox.h"
#include "Components/EditableTextBox.h"
#include "Components/TextBlock.h"
#include "Components/Image.h"
#include "Components/Button.h"
#include "Components/VerticalBox.h"
#include "Systems/EventBus.h"
#include "InsimulChatPanel.generated.h"

/**
 * A single dialogue message entry in the chat panel.
 */
USTRUCT(BlueprintType)
struct FDialogueMessage
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "Insimul|Chat")
    FString Speaker;

    UPROPERTY(BlueprintReadWrite, Category = "Insimul|Chat")
    FString Text;

    UPROPERTY(BlueprintReadWrite, Category = "Insimul|Chat")
    bool bIsPlayer = false;

    UPROPERTY(BlueprintReadWrite, Category = "Insimul|Chat")
    FDateTime Timestamp;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPlayerMessageSent, const FString&, Message);

/**
 * Richer player-message broadcast that includes the NPC's visible-appearance
 * description resolved via the registered appearance provider (if any). Game
 * code subscribing to this can pass AppearanceDescription straight to
 * UInsimulAIService::SendMessageWithAppearance so the LLM prompt can
 * acknowledge what the player sees on the NPC. Matches Babylon's
 * gameContext.appearanceDescription contract.
 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnPlayerMessageWithAppearance, const FString&, Message, const FString&, CharacterId, const FString&, AppearanceDescription);

/**
 * Single-bound provider that returns a natural-language appearance
 * description for the given character. Non-multicast so it has a return
 * value (UE multicast delegates can't return). Optional — if unbound, the
 * panel sends the message with an empty appearance description.
 */
DECLARE_DYNAMIC_DELEGATE_RetVal_OneParam(FString, FInsimulAppearanceProvider, const FString&, CharacterId);

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnChatPanelClosed);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGesturePerformed, const FString&, GestureId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnActionSelected, const FString&, ActionId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnVocabularyUsed, const FString&, Word);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnNPCConversationStarted, const FString&, NPCId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnNPCSpeechUpdate, const FString&, Text);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnFluencyGain, float, Fluency, float, Gain);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnChatExchange, const FString&, NPCId, const FString&, PlayerMessage, const FString&, NPCResponse);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnTalkRequested);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnNpcConversationTurn, const FString&, NPCId, const FString&, TopicTag);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnNPCRelationshipChanged, const FString&, NPCId, float, NewStrength);

/**
 * Chat panel widget for NPC dialogue interactions.
 *
 * Provides a scrollable conversation history, text input for the player,
 * NPC portrait and name display, typing indicator, and contextual action
 * buttons. Matches BabylonChatPanel.ts event surface.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulChatPanel : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Add a message to the conversation history */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void AddMessage(const FString& Speaker, const FString& Text, bool bIsPlayer);

    /** Clear all messages from the conversation history */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void ClearHistory();

    /** Set the NPC name, portrait, and optional world/gender context */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetNPCInfo(const FString& Name, UTexture2D* Portrait, const FString& WorldId = TEXT(""), const FString& Gender = TEXT(""));

    /** Show the typing indicator with animated dots */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void ShowTypingIndicator();

    /** Hide the typing indicator */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void HideTypingIndicator();

    /** Show the chat panel with fade-in animation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void ShowPanel();

    /** Hide the chat panel with fade-out animation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void HidePanel();

    /** Whether the panel is currently visible */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    bool IsPanelVisible() const { return bPanelVisible; }

    /** Whether voice recording is active */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    bool IsRecording() const { return bIsRecording; }

    /** Whether listening mode is active */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    bool IsListeningMode() const { return bIsListeningMode; }

    /** Get the full message history */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    const TArray<FDialogueMessage>& GetMessageHistory() const { return MessageHistory; }

    /**
     * Return the conversation transcript in the shape the server-side grader
     * (POST /api/assessments/score-conversation) expects. Used by the
     * assessment flow to grade the conversation phase per-turn. Player turns
     * map to role "user", NPC turns to "assistant". Mirrors
     * BabylonChatPanel.getTranscriptForGrading().
     */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    TArray<FInsimulConversationTurn> GetTranscriptForGrading() const;

    /** Set the AI provider for dialogue */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetAIProvider(const FString& Provider);

    /**
     * Register a provider that returns a natural-language description of the
     * NPC's current visible appearance (clothing, body, accessories). The
     * chat panel invokes it on each send and broadcasts the result via
     * OnPlayerMessageWithAppearance so game code can attach it to the
     * outgoing UInsimulAIService::SendMessageWithAppearance call.
     *
     * Mirrors BabylonChatPanel.setAppearanceProvider() / Unity
     * ChatPanel.SetAppearanceProvider().
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetAppearanceProvider(const FInsimulAppearanceProvider& Provider);

    /** Get the current AI provider */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    FString GetAIProvider() const { return AIProvider; }

    /** Set the playthrough ID for conversation context */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetPlaythroughId(const FString& Id);

    /** Set the target language for language-learning dialogue */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetTargetLanguage(const FString& Language);

    /** Called after world data finishes loading. Re-sets character on the AI service
     *  so the system prompt is rebuilt with language context. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void OnWorldDataLoaded();

    /** Set player inventory context for NPC dialogue awareness */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetPlayerInventoryContext(const TArray<FString>& Items, int32 Gold);

    /** Add a system message to the chat panel */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void AddSystemMessage(const FString& Text);

    /** Enter listening mode for voice-based conversation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void EnterListeningMode();

    /** Exit listening mode */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void ExitListeningMode();

    /** Start push-to-talk voice recording */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void StartPushToTalk();

    /** Stop push-to-talk voice recording */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void StopPushToTalk();

    /** Perform a non-verbal gesture during conversation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void PerformGesture(const FString& GestureId);

    /** Set the quest bridge for conversation goal evaluation. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetQuestBridge(UObject* Bridge);

    /** Set the game event bus for emitting grammar, translation, and friendship events. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetGameEventBus(UObject* EventBus);

    /** Set pronunciation quest active state — guards listen-and-repeat behind this flag. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetPronunciationQuestActive(bool bActive);

    /** Whether pronunciation quest is active. */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    bool IsPronunciationQuestActive() const { return bPronunciationQuestActive; }

    /** Set eavesdrop mode */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetEavesdropMode(bool bEnabled);

    /** Set dialogue actions available to the player with energy cost display */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetDialogueActions(const TArray<FString>& ActionIds, float PlayerEnergy);

    /** Update dialogue actions with current player energy (re-evaluates availability) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void UpdateDialogueActions(float PlayerEnergy);

    /** Set quest offering context for NPC dialogue */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetQuestOfferingContext(UObject* Context);

    /** Set active quest context from this NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetActiveQuestFromNPC(UObject* Context);

    /** Set quest guidance prompt for directed conversation */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetQuestGuidancePrompt(const FString& Prompt);

    /** Trigger quest guidance greeting from NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void TriggerQuestGuidanceGreeting();

    /** Callback for streaming response chunks — appends to full response accumulator */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void OnResponseChunk(const FString& Chunk);

    /** Start a typewriter effect that reveals text character by character */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void StartTypewriterEffect(const FString& Text, float CharsPerSecond = 30.f);

    /** Enable or disable voice input (microphone) features */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void SetVoiceInputEnabled(bool bEnabled);

    /** Whether voice input is enabled */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    bool IsVoiceInputEnabled() const { return bVoiceInputEnabled; }

    /** Get the current conversation turn count */
    UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
    int32 GetConversationTurnCount() const { return ConversationTurnCount; }

    /** Clean up resources */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
    void Dispose();

    // ─── Delegates ───

    /** Fired when the player sends a message */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnPlayerMessageSent OnPlayerMessageSent;

    /**
     * Fired alongside OnPlayerMessageSent but includes the NPC character id
     * and the resolved appearance description. Wire to UInsimulAIService's
     * SendMessageWithAppearance so the LLM prompt can reference what the
     * player sees on the NPC.
     */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnPlayerMessageWithAppearance OnPlayerMessageWithAppearance;

    /** Fired when the chat panel is closed */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnChatPanelClosed OnChatPanelClosed;

    /** Fired when a gesture is performed */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnGesturePerformed OnGesturePerformed;

    /** Fired when a dialogue action is selected */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnActionSelected OnActionSelected;

    /** Fired when vocabulary is used in conversation */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnVocabularyUsed OnVocabularyUsed;

    /** Fired when an NPC conversation starts */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnNPCConversationStarted OnNPCConversationStarted;

    /** Fired when NPC speech text updates (streaming) */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnNPCSpeechUpdate OnNPCSpeechUpdate;

    /** Fired when fluency changes */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnFluencyGain OnFluencyGain;

    /** Fired when a chat exchange completes (player + NPC response) */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnChatExchange OnChatExchange;

    /** Fired when a talk action is requested */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnTalkRequested OnTalkRequested;

    /** Fired on each NPC conversation turn */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnNpcConversationTurn OnNpcConversationTurn;

    /** Fired when NPC relationship strength changes (conversation count based). */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
    FOnNPCRelationshipChanged OnNPCRelationshipChanged;

protected:
    virtual void NativeConstruct() override;

    // --- UI components (bound from UMG or created in C++) ---

    /** Scrollable conversation history */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UScrollBox> ConversationScrollBox;

    /** Player text input field */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UEditableTextBox> MessageInputBox;

    /** Send button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UButton> SendButton;

    /** NPC name display */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UTextBlock> NPCNameText;

    /** NPC portrait image */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UImage> NPCPortraitImage;

    /** Typing indicator text (animated dots) */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UTextBlock> TypingIndicatorText;

    /** Container for action buttons */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UVerticalBox> ActionButtonsContainer;

    // --- Action buttons ---

    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UButton> AskAboutQuestButton;

    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UButton> TradeButton;

    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UButton> RequestHelpButton;

    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Chat")
    TObjectPtr<UButton> SayGoodbyeButton;

private:
    UPROPERTY()
    TArray<FDialogueMessage> MessageHistory;

    UPROPERTY()
    bool bPanelVisible = false;

    UPROPERTY()
    bool bTypingIndicatorVisible = false;

    UPROPERTY()
    bool bIsRecording = false;

    UPROPERTY()
    bool bIsListeningMode = false;

    UPROPERTY()
    FString AIProvider = TEXT("server");

    /** Optional provider for the NPC's visible-appearance description. */
    UPROPERTY()
    FInsimulAppearanceProvider AppearanceProvider;

    UPROPERTY()
    FString PlaythroughId;

    UPROPERTY()
    FString TargetLanguage;

    /** Quest bridge for conversation goal evaluation (implements IConversationQuestBridge interface). */
    UPROPERTY()
    TObjectPtr<UObject> QuestBridge;

    /** Game event bus for emitting grammar, translation, and friendship events. */
    UPROPERTY()
    TObjectPtr<UObject> GameEventBus;

    /** Whether pronunciation quest is active — guards listen-and-repeat feature. */
    UPROPERTY()
    bool bPronunciationQuestActive = false;

    /** Per-NPC conversation counts for friendship/rapport tracking. */
    TMap<FString, int32> NPCConversationCounts;

    /** Current NPC character ID for active conversation. */
    UPROPERTY()
    FString CurrentNPCId;

    /** World ID for the current character's world. */
    UPROPERTY()
    FString CurrentWorldId;

    /** Gender of the current NPC character. */
    UPROPERTY()
    FString CurrentCharacterGender;

    /** Timer handle for typing indicator animation */
    FTimerHandle TypingAnimTimerHandle;

    /** Current dot count for typing animation */
    int32 TypingDotCount = 0;

    /** Full response accumulator for streaming chunks */
    FString FullResponse;

    /** Conversation turn counter */
    int32 ConversationTurnCount = 0;

    /** Whether voice input is enabled */
    bool bVoiceInputEnabled = false;

    /** Quest offering context for NPC dialogue */
    UPROPERTY()
    TObjectPtr<UObject> QuestOfferingContext;

    /** Active quest context from this NPC */
    UPROPERTY()
    TObjectPtr<UObject> ActiveQuestFromNPC;

    /** Quest guidance prompt for directed conversation */
    FString QuestGuidancePromptText;

    /** Timer handle for typewriter effect */
    FTimerHandle TypewriterTimerHandle;

    /** Full text for typewriter animation */
    FString TypewriterFullText;

    /** Current character index in typewriter animation */
    int32 TypewriterCharIndex = 0;

    /** Characters per second for typewriter speed */
    float TypewriterSpeed = 30.f;

    UFUNCTION()
    void OnSendClicked();

    UFUNCTION()
    void OnInputCommitted(const FText& Text, ETextCommit::Type CommitMethod);

    UFUNCTION()
    void OnAskAboutQuestClicked();

    UFUNCTION()
    void OnTradeClicked();

    UFUNCTION()
    void OnRequestHelpClicked();

    UFUNCTION()
    void OnSayGoodbyeClicked();

    /** Send the current input text as a player message */
    void SendCurrentMessage();

    /** Animate the typing indicator dots */
    void AnimateTypingDots();

    /** Create a widget entry for a message in the scroll box */
    UWidget* CreateMessageWidget(const FDialogueMessage& Message);

    /** Advance typewriter animation by one character */
    void AdvanceTypewriter();
};
