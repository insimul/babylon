// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulDialogueWidget.h"
#include "InsimulConversationComponent.h"
#include "GameFramework/PlayerController.h"

void UInsimulDialogueWidget::SetConversationComponent(UInsimulConversationComponent* Comp)
{
	ConversationComponent = Comp;
}

void UInsimulDialogueWidget::SubmitPlayerMessage(const FString& Message)
{
	if (ConversationComponent && !Message.IsEmpty())
	{
		ConversationComponent->SendMessage(Message);
	}
}

void UInsimulDialogueWidget::CloseDialogue()
{
	if (ConversationComponent)
	{
		ConversationComponent->EndConversation();
	}

	APlayerController* PC = GetOwningPlayer();
	if (PC)
	{
		PC->SetInputMode(FInputModeGameOnly());
		PC->bShowMouseCursor = false;
	}

	RemoveFromParent();
}
