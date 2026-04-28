// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulAICharacter.h"
#include "InsimulDialogueWidget.h"
#include "Components/SphereComponent.h"
#include "Components/AudioComponent.h"
#include "GameFramework/PlayerController.h"
#include "Blueprint/UserWidget.h"
#include "Engine/Engine.h"
#include "Sound/SoundWaveProcedural.h"

AInsimulAICharacter::AInsimulAICharacter()
{
	PrimaryActorTick.bCanEverTick = false;

	// Create conversation component
	InsimulConversationComponent = CreateDefaultSubobject<UInsimulConversationComponent>(TEXT("InsimulConversation"));

	// Create interaction sphere (200 units radius by default)
	InteractionSphere = CreateDefaultSubobject<USphereComponent>(TEXT("InteractionSphere"));
	InteractionSphere->SetupAttachment(RootComponent);
	InteractionSphere->SetSphereRadius(200.0f);
	InteractionSphere->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	InteractionSphere->SetGenerateOverlapEvents(true);

	// Create audio component for TTS speech playback
	SpeechAudioComponent = CreateDefaultSubobject<UAudioComponent>(TEXT("SpeechAudio"));
	SpeechAudioComponent->SetupAttachment(RootComponent);
	SpeechAudioComponent->bAutoActivate = false;

	ActiveDialogueWidget = nullptr;
}

void AInsimulAICharacter::BeginPlay()
{
	Super::BeginPlay();

	// Bind conversation delegates
	InsimulConversationComponent->OnConversationStarted.AddDynamic(this, &AInsimulAICharacter::OnConversationStarted);
	InsimulConversationComponent->OnUtteranceReceived.AddDynamic(this, &AInsimulAICharacter::OnUtteranceReceived);
	InsimulConversationComponent->OnConversationEnded.AddDynamic(this, &AInsimulAICharacter::OnConversationEnded);
	InsimulConversationComponent->OnAudioChunkReceived.AddDynamic(this, &AInsimulAICharacter::OnAudioChunkReceived);

	// Bind overlap for interaction sphere
	InteractionSphere->OnComponentBeginOverlap.AddDynamic(this, &AInsimulAICharacter::OnInteractionSphereBeginOverlap);
}

void AInsimulAICharacter::OnInteractionSphereBeginOverlap(
	UPrimitiveComponent* OverlappedComponent,
	AActor* OtherActor,
	UPrimitiveComponent* OtherComp,
	int32 OtherBodyIndex,
	bool bFromSweep,
	const FHitResult& SweepResult)
{
	// Check if it's a player pawn
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (Pawn && Pawn->IsPlayerControlled())
	{
		// Fire the delegate — the game can decide what to do
		OnPlayerInteract.Broadcast(this, Pawn);
	}
}

void AInsimulAICharacter::HandlePlayerInteract(APawn* InteractingPawn)
{
	if (!InteractingPawn)
	{
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("Player interacting with NPC %s"), *InsimulConversationComponent->Config.CharacterID);

	// Create dialogue widget if we have a class and don't already have one
	if (DialogueWidgetClass && !ActiveDialogueWidget)
	{
		APlayerController* PC = Cast<APlayerController>(InteractingPawn->GetController());
		if (PC)
		{
			ActiveDialogueWidget = CreateWidget<UInsimulDialogueWidget>(PC, DialogueWidgetClass);
			if (ActiveDialogueWidget)
			{
				ActiveDialogueWidget->SetConversationComponent(InsimulConversationComponent);
				ActiveDialogueWidget->AddToViewport(100);

				// Switch to UI input mode
				FInputModeUIOnly InputMode;
				InputMode.SetWidgetToFocus(ActiveDialogueWidget->TakeWidget());
				PC->SetInputMode(InputMode);
				PC->bShowMouseCursor = true;
			}
		}
	}

	// Start a player-initiated conversation
	InsimulConversationComponent->StartPlayerInitiatedConversation();
}

void AInsimulAICharacter::OnUtteranceReceived(const FInsimulUtterance& Utterance)
{
	// Forward to dialogue widget if open
	if (ActiveDialogueWidget)
	{
		ActiveDialogueWidget->BP_AddUtterance(Utterance.SpeakerID, Utterance.Text);
	}

	// Also display as subtitle (for NPC-NPC conversations or no widget)
	DisplaySubtitle(FString::Printf(TEXT("%s: %s"), *Utterance.SpeakerID, *Utterance.Text));
}

void AInsimulAICharacter::OnConversationStarted(const FInsimulConversation& Conversation)
{
	UE_LOG(LogTemp, Log, TEXT("Conversation started: %s"), *Conversation.ConversationID);
}

void AInsimulAICharacter::OnConversationEnded(const FInsimulConversation& Conversation)
{
	UE_LOG(LogTemp, Log, TEXT("Conversation ended: %s"), *Conversation.ConversationID);

	// Close dialogue widget
	if (ActiveDialogueWidget)
	{
		// Restore game input
		if (UWorld* World = GetWorld())
		{
			APlayerController* PC = World->GetFirstPlayerController();
			if (PC)
			{
				FInputModeGameOnly InputMode;
				PC->SetInputMode(InputMode);
				PC->bShowMouseCursor = false;
			}
		}

		ActiveDialogueWidget->RemoveFromParent();
		ActiveDialogueWidget = nullptr;
	}
}

void AInsimulAICharacter::OnAudioChunkReceived(const TArray<uint8>& AudioData, int32 DurationMs)
{
	if (AudioData.Num() == 0 || !SpeechAudioComponent)
	{
		return;
	}

	// Create a procedural sound wave for streaming playback
	USoundWaveProcedural* SoundWave = NewObject<USoundWaveProcedural>(this);
	SoundWave->SetSampleRate(24000);
	SoundWave->NumChannels = 1;
	SoundWave->Duration = DurationMs > 0 ? DurationMs / 1000.0f : 2.0f;
	SoundWave->SoundGroup = SOUNDGROUP_Voice;
	SoundWave->bLooping = false;

	// Queue the raw audio data (PCM 16-bit expected from the server)
	SoundWave->QueueAudio(AudioData.GetData(), AudioData.Num());

	// Play on the audio component (spatially attached to this character)
	SpeechAudioComponent->SetSound(SoundWave);
	SpeechAudioComponent->Play();

	UE_LOG(LogTemp, Verbose, TEXT("Playing TTS audio chunk: %d bytes, %dms"), AudioData.Num(), DurationMs);
}

void AInsimulAICharacter::DisplaySubtitle(const FString& Text, float Duration)
{
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, Duration, FColor::Yellow, Text);
	}
}
