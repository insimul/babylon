// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InsimulConversationComponent.h"
#include "InsimulDebugComponent.h"
#include "InsimulAICharacter.generated.h"

class UInsimulDialogueWidget;
class USphereComponent;
class UAudioComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnInsimulNPCInteract, AInsimulAICharacter*, NPC, APawn*, InteractingPawn);

UCLASS()
class INSIMULRUNTIME_API AInsimulAICharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AInsimulAICharacter();

protected:
	virtual void BeginPlay() override;

public:
	/** The Insimul conversation component */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Insimul")
	UInsimulConversationComponent* InsimulConversationComponent;

	/** Sphere trigger for player interaction detection */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Insimul")
	USphereComponent* InteractionSphere;

	/**
	 * Widget class to instantiate when the player interacts with this NPC.
	 * Set this to your WBP_InsimulDialogue Blueprint in the NPC's Blueprint class defaults.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Insimul")
	TSubclassOf<UInsimulDialogueWidget> DialogueWidgetClass;

	/** Fired when a player enters the interaction sphere. Bind to this in your game to open dialogue. */
	UPROPERTY(BlueprintAssignable, Category = "Insimul")
	FOnInsimulNPCInteract OnPlayerInteract;

	/**
	 * Call this to manually trigger the interaction (e.g., from your game's interaction system).
	 * Opens the dialogue widget and starts a player-initiated conversation.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul")
	void HandlePlayerInteract(APawn* InteractingPawn);

	/** Handle when an utterance is received */
	UFUNCTION()
	void OnUtteranceReceived(const FInsimulUtterance& Utterance);

	/** Handle when conversation starts */
	UFUNCTION()
	void OnConversationStarted(const FInsimulConversation& Conversation);

	/** Handle when conversation ends */
	UFUNCTION()
	void OnConversationEnded(const FInsimulConversation& Conversation);

	/** Handle streaming audio chunk from TTS */
	UFUNCTION()
	void OnAudioChunkReceived(const TArray<uint8>& AudioData, int32 DurationMs);

private:
	/** Audio component for playing TTS speech */
	UPROPERTY(VisibleAnywhere, Category = "Insimul")
	UAudioComponent* SpeechAudioComponent;

	/** Currently displayed dialogue widget */
	UPROPERTY(Transient)
	UInsimulDialogueWidget* ActiveDialogueWidget;

	/** Buffer for accumulating audio data before playback */
	TArray<uint8> AudioBuffer;

	/** Overlap handler for the interaction sphere */
	UFUNCTION()
	void OnInteractionSphereBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	/** Display subtitle for utterance (fallback when no widget) */
	void DisplaySubtitle(const FString& Text, float Duration = 3.0f);
};
