// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulDialogueWidget.generated.h"

class UInsimulConversationComponent;

/**
 * Base C++ class for the Insimul player dialogue UI.
 * Create a Blueprint child class (WBP_InsimulDialogue) in the editor with the actual layout:
 *   - A scroll box or text block to show conversation history (bound to BP_AddUtterance)
 *   - An editable text box for player input
 *   - A "Send" button that calls SubmitPlayerMessage with the text box contents
 *   - A "Close" button that calls CloseDialogue
 */
UCLASS(Abstract, Blueprintable)
class INSIMULRUNTIME_API UInsimulDialogueWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** Called by InsimulAICharacter to link this widget to the NPC's conversation component */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void SetConversationComponent(UInsimulConversationComponent* Comp);

	/**
	 * Override in Blueprint to display a new utterance line in the conversation UI.
	 * @param Speaker  The character ID or display name of the speaker
	 * @param Text     The line of dialogue
	 */
	UFUNCTION(BlueprintImplementableEvent, Category = "Insimul")
	void BP_AddUtterance(const FString& Speaker, const FString& Text);

	/** Override in Blueprint to clear all conversation history from the display */
	UFUNCTION(BlueprintImplementableEvent, Category = "Insimul")
	void BP_ClearHistory();

	/**
	 * Called by the Blueprint Send button to submit the player's typed message.
	 * Forwards the message to the conversation component which sends it to the Insimul API.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void SubmitPlayerMessage(const FString& Message);

	/** Ends the conversation, restores game input, and removes this widget from the viewport */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void CloseDialogue();

protected:
	UPROPERTY(Transient, BlueprintReadOnly, Category = "Insimul")
	UInsimulConversationComponent* ConversationComponent;
};
