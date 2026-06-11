#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/VerticalBox.h"
#include "Components/ScrollBox.h"
#include "Components/EditableTextBox.h"
#include "Components/TextBlock.h"
#include "Components/Button.h"
#include "Data/DialogueContextData.h"
#include "Systems/EventBus.h"
#include "DialogueWidget.generated.h"

/**
 * Dialogue UI widget for NPC conversations.
 *
 * Displays NPC name, chat message history, a text input for the player,
 * and social action buttons with energy cost badges.
 * Integrates with UDialogueSystem and UInsimulAIService.
 */
UCLASS()
class INSIMULEXPORT_API UDialogueWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Initialize the widget and bind to DialogueSystem delegates */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void InitDialogueWidget();

    /** Open dialogue with a specific NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void OpenDialogue(const FString& NPCId);

    /** Close dialogue and hide the widget */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void CloseDialogue();

    /** Add a chat message to the history */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void AddChatMessage(const FString& Speaker, const FString& Message, bool bIsPlayer);

    /**
     * Return the conversation transcript in the shape the server-side grader
     * (POST /api/assessments/score-conversation) expects. Used by the
     * assessment flow to grade the conversation phase per-turn. System turns
     * carry NPC role context; only user/assistant turns produce task results
     * downstream. Mirrors BabylonChatPanel.getTranscriptForGrading().
     */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    TArray<FInsimulConversationTurn> GetTranscriptForGrading() const { return Transcript; }

    /** Refresh the action buttons based on current energy */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Dialogue")
    void RefreshActions(float PlayerEnergy);

    /** Get the NPC name currently in dialogue */
    UFUNCTION(BlueprintPure, Category = "Insimul|Dialogue")
    FString GetCurrentNPCName() const { return CurrentNPCName; }

    /** Whether the widget is currently showing dialogue */
    UFUNCTION(BlueprintPure, Category = "Insimul|Dialogue")
    bool IsDialogueOpen() const { return bIsOpen; }

    /**
     * Register a provider that returns a natural-language description of the
     * given NPC's visible appearance. The description is forwarded to the
     * server so the LLM can acknowledge what the player actually sees on the
     * NPC model. Mirrors BabylonGame.setAppearanceProvider().
     */
    void SetAppearanceProvider(TFunction<FString(const FString&)> InProvider) { AppearanceProvider = MoveTemp(InProvider); }

protected:
    virtual void NativeConstruct() override;

    // --- UI components (bound from UMG or created in C++) ---

    /** Root container for the entire dialogue panel */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UVerticalBox> DialogueRoot;

    /** NPC name display */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UTextBlock> NPCNameText;

    /** NPC greeting / status text */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UTextBlock> GreetingText;

    /** Scrollable chat history */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UScrollBox> ChatScrollBox;

    /** Player text input field */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UEditableTextBox> PlayerInputBox;

    /** Send button for player messages */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UButton> SendButton;

    /** Close button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UButton> CloseButton;

    /** Container for action buttons */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UVerticalBox> ActionsContainer;

    /** Hint text at the bottom */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Dialogue")
    TObjectPtr<UTextBlock> HintText;

private:
    /**
     * UI font captured from a bound, designer/Script-styled text widget in
     * NativeConstruct. Reused for the chat lines this widget creates at runtime so
     * non-Latin target-language dialogue renders glyphs instead of tofu boxes.
     * Empty (FontObject null) when no Widget Blueprint / bundled font is present —
     * callers then fall back to the engine default.
     */
    UPROPERTY()
    FSlateFontInfo UIFont;

    /** Bundled UI font at the given size, or the template widget's default font if none. */
    FSlateFontInfo ResolveUIFont(UTextBlock* TemplateWidget, int32 Size) const;

    UPROPERTY()
    bool bIsOpen = false;

    UPROPERTY()
    FString CurrentNPCId;

    UPROPERTY()
    FString CurrentNPCName;

    /** Handle player sending a chat message */
    UFUNCTION()
    void OnSendClicked();

    /** Handle player pressing Enter in the input box */
    UFUNCTION()
    void OnInputCommitted(const FText& Text, ETextCommit::Type CommitMethod);

    /** Handle close button click */
    UFUNCTION()
    void OnCloseClicked();

    /** Handle AI chat response chunk (streaming) */
    void OnAIChatChunk(const FString& Chunk);

    /** Handle AI chat response complete */
    void OnAIChatComplete(const FString& FullResponse);

    /** Handle AI chat error */
    void OnAIChatError(const FString& ErrorMessage);

    /** Handle stream-watchdog timeout broadcast from the AI service */
    UFUNCTION()
    void OnAIChatTimedOut(const FString& NPCId, const FString& Error);

    /** Send player message text to the AI service */
    void SendPlayerMessage(const FString& Message);

    /** Create a single action button and add to ActionsContainer */
    void CreateActionButton(const FString& ActionId, const FString& ActionName, float EnergyCost, bool bCanAfford);

    /** Accumulated streaming response text */
    FString StreamingResponseText;

    /** The text block currently being streamed into (for AI responses) */
    UPROPERTY()
    TObjectPtr<UTextBlock> StreamingMessageBlock;

    /** Current player message — retained so error paths can report it. */
    FString LastUserMessage;

    /**
     * Raw conversation transcript for assessment grading. Each entry is a
     * {Role, Content} pair where Role is "user" (player), "assistant" (NPC),
     * or "system". Populated alongside AddChatMessage so the assessment
     * conversation phase can surface per-turn scoring.
     */
    UPROPERTY()
    TArray<FInsimulConversationTurn> Transcript;

    /**
     * Natural-language description of the current NPC's visible appearance.
     * Populated on SendPlayerMessage via AppearanceProvider so it can be
     * forwarded to the LLM.
     */
    TFunction<FString(const FString&)> AppearanceProvider;
};
