// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulConversationComponent.h"
#include "InsimulWSClient.h"
#include "InsimulRestClient.h"
#include "InsimulOfflineProvider.h"
#include "InsimulSettings.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Engine/Engine.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

UInsimulConversationComponent::UInsimulConversationComponent()
{
	PrimaryComponentTick.bCanEverTick = true;

	// Pull defaults from settings if available
	if (const UInsimulSettings* Settings = UInsimulSettings::Get())
	{
		Config.APIBaseUrl = Settings->ServerURL;
		Config.WorldID = Settings->DefaultWorldID;
	}
}

void UInsimulConversationComponent::BeginPlay()
{
	Super::BeginPlay();

	// Start proximity timer; conversations won't fire until CharacterID is set.
	if (Config.ConversationCheckInterval > 0.0f)
	{
		GetWorld()->GetTimerManager().SetTimer(
			ConversationTimer,
			this,
			&UInsimulConversationComponent::CheckForNearbyCharacters,
			Config.ConversationCheckInterval,
			true
		);
	}
}

void UInsimulConversationComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// End any active REST conversation
	if (!CurrentConversationID.IsEmpty())
	{
		EndConversationREST();
	}

	// Disconnect WebSocket
	if (WSClient)
	{
		WSClient->SendSystemCommand(TEXT("END"), WSSessionId);
		delete WSClient;
		WSClient = nullptr;
	}

	if (RestClient)
	{
		delete RestClient;
		RestClient = nullptr;
	}

	if (OfflineProvider)
	{
		OfflineProvider->EndSession(WSSessionId);
		delete OfflineProvider;
		OfflineProvider = nullptr;
	}

	if (ConversationTimer.IsValid())
	{
		GetWorld()->GetTimerManager().ClearTimer(ConversationTimer);
	}

	Super::EndPlay(EndPlayReason);
}

void UInsimulConversationComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

void UInsimulConversationComponent::InitializeInsimul()
{
	if (Config.CharacterID.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("InsimulConversationComponent: CharacterID is not set"));
		return;
	}

	if (Config.WorldID.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("InsimulConversationComponent: WorldID is not set"));
		return;
	}

	// Generate session ID
	WSSessionId = FString::Printf(TEXT("insimul-%lld-%d"), FDateTime::Now().GetTicks(), FMath::Rand());

	// Check chat provider
	const UInsimulSettings* Settings = UInsimulSettings::Get();
	bOfflineMode = Settings ? Settings->IsOfflineMode() : false;

	if (bOfflineMode)
	{
		// ── Local LLM mode: local LLM + exported world data ──
		if (!OfflineProvider)
		{
			OfflineProvider = new FInsimulOfflineProvider();
			OfflineProvider->Initialize(
				Settings->LocalLLMServerURL,
				Settings->LocalLLMModel,
				Settings->MaxTokens,
				Settings->Temperature
			);

			// Bind delegates
			OfflineProvider->OnTextChunk.BindUObject(this, &UInsimulConversationComponent::OnOfflineTextChunk);
			OfflineProvider->OnComplete.BindUObject(this, &UInsimulConversationComponent::OnOfflineComplete);
			OfflineProvider->OnError.BindUObject(this, &UInsimulConversationComponent::OnOfflineError);

			// Load world data
			OfflineProvider->LoadWorldData(Settings->WorldDataPath);
		}

		UE_LOG(LogTemp, Log, TEXT("InsimulConversationComponent initialized LOCAL for character %s"),
			*Config.CharacterID);
	}
	else
	{
		// ── Online mode: Insimul server via WebSocket + REST ──
		if (!WSClient)
		{
			WSClient = new FInsimulWSClient();
			WSClient->OnTextChunk.BindUObject(this, &UInsimulConversationComponent::OnWSTextChunk);
			WSClient->OnAudioChunk.BindUObject(this, &UInsimulConversationComponent::OnWSAudioChunk);
			WSClient->OnTranscript.BindUObject(this, &UInsimulConversationComponent::OnWSTranscript);
			WSClient->OnComplete.BindUObject(this, &UInsimulConversationComponent::OnWSComplete);
			WSClient->OnError.BindUObject(this, &UInsimulConversationComponent::OnWSError);
			WSClient->OnMeta.BindUObject(this, &UInsimulConversationComponent::OnWSMeta);
			WSClient->Connect(Config.APIBaseUrl);
		}

		if (!RestClient)
		{
			RestClient = new FInsimulRestClient();
			RestClient->Initialize(Config.APIBaseUrl);
			RestClient->OnConversationStarted.BindUObject(this, &UInsimulConversationComponent::OnRESTConversationStarted);
			RestClient->OnUtteranceReceived.BindUObject(this, &UInsimulConversationComponent::OnRESTUtteranceReceived);
			RestClient->OnAudioReceived.BindUObject(this, &UInsimulConversationComponent::OnRESTAudioReceived);
			RestClient->OnTranscriptReceived.BindUObject(this, &UInsimulConversationComponent::OnRESTTranscriptReceived);
			RestClient->OnError.BindUObject(this, &UInsimulConversationComponent::OnRESTError);
		}

		// Fetch character metadata
		RestClient->GetCharacter(Config.CharacterID);

		UE_LOG(LogTemp, Log, TEXT("InsimulConversationComponent initialized SERVER for character %s in world %s"),
			*Config.CharacterID, *Config.WorldID);
	}
}

// ── Public API ──────────────────────────────────────────────────────────────

void UInsimulConversationComponent::StartConversationWithCharacter(const FString& TargetCharacterID)
{
	if (IsInConversation())
	{
		UE_LOG(LogTemp, Log, TEXT("Already in conversation"));
		return;
	}

	if (TargetCharacterID.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("TargetCharacterID is empty"));
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("Starting conversation with character %s"), *TargetCharacterID);
	StartConversationREST(Config.CharacterID, TargetCharacterID);
}

void UInsimulConversationComponent::StartPlayerInitiatedConversation()
{
	if (IsInConversation())
	{
		UE_LOG(LogTemp, Log, TEXT("Already in conversation"));
		return;
	}

	if (Config.PlayerCharacterID.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("PlayerCharacterID is not set"));
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("Player starting conversation with NPC %s"), *Config.CharacterID);
	StartConversationREST(Config.PlayerCharacterID, Config.CharacterID);
}

void UInsimulConversationComponent::SendMessage(const FString& Message)
{
	if (Message.IsEmpty())
	{
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("Player message: %s"), *Message);

	// Offline mode: route through local LLM
	if (bOfflineMode && OfflineProvider && OfflineProvider->IsReady())
	{
		OfflineProvider->SendText(Message, WSSessionId, Config.CharacterID, TEXT("en"));
		return;
	}

	// Online mode: try WebSocket streaming first
	if (WSClient && WSClient->IsConnected())
	{
		bWSConversationActive = true;
		WSClient->SendText(
			Message,
			WSSessionId,
			Config.CharacterID,
			Config.WorldID,
			TEXT("en")
		);
		return;
	}

	// Fallback to REST
	if (!CurrentConversationID.IsEmpty())
	{
		ContinueConversationREST(Message);
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("SendMessage: no active conversation and WebSocket not available"));
	}
}

void UInsimulConversationComponent::EndConversation()
{
	if (bWSConversationActive && WSClient)
	{
		WSClient->SendSystemCommand(TEXT("END"), WSSessionId);
		bWSConversationActive = false;
	}

	if (!CurrentConversationID.IsEmpty())
	{
		EndConversationREST();
	}
}

// ── NPC-NPC proximity detection ─────────────────────────────────────────

void UInsimulConversationComponent::CheckForNearbyCharacters()
{
	if (IsInConversation() || Config.CharacterID.IsEmpty())
	{
		return;
	}

	TArray<AActor*> AllCharacters;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), ACharacter::StaticClass(), AllCharacters);

	NearbyCharacters.Empty();
	const FVector MyLocation = GetOwner()->GetActorLocation();

	for (AActor* Actor : AllCharacters)
	{
		if (Actor == GetOwner())
		{
			continue;
		}

		const float Distance = FVector::Dist(MyLocation, Actor->GetActorLocation());
		if (Distance <= Config.ConversationRadius)
		{
			NearbyCharacters.Add(Actor);

			if (!IsInConversation())
			{
				UInsimulConversationComponent* OtherComponent = Actor->FindComponentByClass<UInsimulConversationComponent>();
				if (OtherComponent && !OtherComponent->Config.CharacterID.IsEmpty())
				{
					StartConversationWithCharacter(OtherComponent->Config.CharacterID);
					break;
				}
			}
		}
	}
}

// ── WebSocket streaming callbacks ───────────────────────────────────────

void UInsimulConversationComponent::OnWSTextChunk(const FString& Text, bool bIsFinal)
{
	if (!Text.IsEmpty())
	{
		FInsimulUtterance Utterance;
		Utterance.SpeakerID = Config.CharacterID;
		Utterance.Text = Text;
		Utterance.Tone = TEXT("neutral");
		Utterance.Timestamp = FDateTime::Now().ToUnixTimestamp();
		OnUtteranceReceived.Broadcast(Utterance);
	}
}

void UInsimulConversationComponent::OnWSAudioChunk(const TArray<uint8>& AudioData, int32 DurationMs)
{
	OnAudioChunkReceived.Broadcast(AudioData, DurationMs);
}

void UInsimulConversationComponent::OnWSTranscript(const FString& Transcript)
{
	UE_LOG(LogTemp, Log, TEXT("STT transcript: %s"), *Transcript);
}

void UInsimulConversationComponent::OnWSComplete()
{
	bWSConversationActive = false;
	FInsimulConversation Conversation;
	Conversation.ConversationID = WSSessionId;
	Conversation.bIsComplete = true;
	OnConversationEnded.Broadcast(Conversation);
}

void UInsimulConversationComponent::OnWSError(const FString& ErrorMessage)
{
	UE_LOG(LogTemp, Error, TEXT("[InsimulWS] Error: %s"), *ErrorMessage);
	bWSConversationActive = false;
}

void UInsimulConversationComponent::OnWSMeta(const FString& SessionId, const FString& State)
{
	if (State == TEXT("ACTIVE"))
	{
		bWSConversationActive = true;
		FInsimulConversation Conversation;
		Conversation.ConversationID = SessionId;
		OnConversationStarted.Broadcast(Conversation);
	}
}

// ── REST client callbacks ───────────────────────────────────────────────

void UInsimulConversationComponent::OnRESTConversationStarted(FString ConversationId)
{
	CurrentConversationID = ConversationId;
	UE_LOG(LogTemp, Log, TEXT("REST conversation started: %s"), *ConversationId);

	FInsimulConversation Conversation;
	Conversation.ConversationID = ConversationId;
	OnConversationStarted.Broadcast(Conversation);
}

void UInsimulConversationComponent::OnRESTUtteranceReceived(FString Text, FString SpeakerId)
{
	FInsimulUtterance Utterance;
	Utterance.SpeakerID = SpeakerId;
	Utterance.Text = Text;
	Utterance.Tone = TEXT("neutral");
	Utterance.Timestamp = FDateTime::Now().ToUnixTimestamp();
	OnUtteranceReceived.Broadcast(Utterance);
}

void UInsimulConversationComponent::OnRESTAudioReceived(TArray<uint8> AudioData)
{
	OnAudioChunkReceived.Broadcast(AudioData, 0);
}

void UInsimulConversationComponent::OnRESTTranscriptReceived(FString Transcript)
{
	UE_LOG(LogTemp, Log, TEXT("REST transcript: %s"), *Transcript);
}

void UInsimulConversationComponent::OnRESTError(FString ErrorMessage)
{
	UE_LOG(LogTemp, Error, TEXT("[InsimulREST] Error: %s"), *ErrorMessage);
}

// ── REST API methods (fallback) ─────────────────────────────────────────

void UInsimulConversationComponent::StartConversationREST(const FString& InitiatorID, const FString& TargetID)
{
	if (RestClient)
	{
		RestClient->StartConversation(InitiatorID, TargetID, TEXT("Unreal Engine"), 0);
	}
}

void UInsimulConversationComponent::ContinueConversationREST(const FString& PlayerMessage)
{
	if (RestClient && !CurrentConversationID.IsEmpty())
	{
		RestClient->ContinueConversation(CurrentConversationID, 0);
	}
}

void UInsimulConversationComponent::EndConversationREST()
{
	if (RestClient && !CurrentConversationID.IsEmpty())
	{
		RestClient->EndConversation(CurrentConversationID, 0);
		CurrentConversationID.Empty();
	}
}

void UInsimulConversationComponent::ProcessConversationData(const TSharedPtr<FJsonObject>& ConversationJson)
{
	FInsimulConversation Conversation;
	Conversation.ConversationID = ConversationJson->GetStringField(TEXT("id"));
	CurrentConversationID = Conversation.ConversationID;

	if (ConversationJson->HasField(TEXT("participants")))
	{
		const TArray<TSharedPtr<FJsonValue>> ParticipantsArray = ConversationJson->GetArrayField(TEXT("participants"));
		for (const TSharedPtr<FJsonValue>& Participant : ParticipantsArray)
		{
			Conversation.Participants.Add(Participant->AsString());
		}
	}

	if (ConversationJson->HasField(TEXT("utterances")))
	{
		const TArray<TSharedPtr<FJsonValue>> UtterancesArray = ConversationJson->GetArrayField(TEXT("utterances"));
		for (const TSharedPtr<FJsonValue>& UtteranceValue : UtterancesArray)
		{
			const TSharedPtr<FJsonObject> UtteranceObj = UtteranceValue->AsObject();
			if (UtteranceObj.IsValid())
			{
				FInsimulUtterance Utterance;
				Utterance.SpeakerID = UtteranceObj->GetStringField(TEXT("speaker"));
				Utterance.Text = UtteranceObj->GetStringField(TEXT("text"));
				Utterance.Tone = UtteranceObj->HasField(TEXT("tone")) ? UtteranceObj->GetStringField(TEXT("tone")) : TEXT("neutral");
				Utterance.Timestamp = UtteranceObj->HasField(TEXT("timestamp")) ? UtteranceObj->GetNumberField(TEXT("timestamp")) : FDateTime::Now().ToUnixTimestamp();
				Conversation.Utterances.Add(Utterance);
			}
		}
	}

	Conversation.bIsComplete = ConversationJson->HasField(TEXT("endTimestep"));
	OnConversationStarted.Broadcast(Conversation);

	if (ConversationJson->HasField(TEXT("utterances")) && Conversation.Utterances.Num() > 0)
	{
		for (int32 i = 0; i < Conversation.Utterances.Num(); ++i)
		{
			FTimerHandle TempTimer;
			GetWorld()->GetTimerManager().SetTimer(TempTimer, [this, Conversation, i]()
			{
				if (i < Conversation.Utterances.Num())
				{
					OnUtteranceReceived.Broadcast(Conversation.Utterances[i]);
					if (i == Conversation.Utterances.Num() - 1)
					{
						CurrentConversationID = TEXT("");
						OnConversationEnded.Broadcast(Conversation);
					}
				}
			}, i * 3.0f, false);
		}
	}
}

void UInsimulConversationComponent::GetCharacterData(const FString& CharacterID)
{
	if (RestClient)
	{
		RestClient->GetCharacter(CharacterID);
	}
}

// ── Offline provider callbacks ──────────────────────────────────────────

void UInsimulConversationComponent::OnOfflineTextChunk(const FString& Text, bool bIsFinal)
{
	if (!Text.IsEmpty())
	{
		FInsimulUtterance Utterance;
		Utterance.SpeakerID = Config.CharacterID;
		Utterance.Text = Text;
		Utterance.Tone = TEXT("neutral");
		Utterance.Timestamp = FDateTime::Now().ToUnixTimestamp();
		OnUtteranceReceived.Broadcast(Utterance);
	}
}

void UInsimulConversationComponent::OnOfflineComplete()
{
	FInsimulConversation Conversation;
	Conversation.ConversationID = WSSessionId;
	Conversation.bIsComplete = true;
	OnConversationEnded.Broadcast(Conversation);
}

void UInsimulConversationComponent::OnOfflineError(const FString& ErrorMessage)
{
	UE_LOG(LogTemp, Error, TEXT("[InsimulOffline] Error: %s"), *ErrorMessage);
}
