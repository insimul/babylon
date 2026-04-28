// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulWSClient.h"
#include "WebSocketsModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Misc/Base64.h"

FInsimulWSClient::FInsimulWSClient()
{
	// Ensure the WebSockets module is loaded
	FModuleManager::Get().LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
}

FInsimulWSClient::~FInsimulWSClient()
{
	Disconnect();
}

FString FInsimulWSClient::DeriveWSUrl(const FString& HttpURL)
{
	FString URL = HttpURL;

	// Replace http(s):// with ws(s)://
	if (URL.StartsWith(TEXT("https://")))
	{
		URL = TEXT("wss://") + URL.Mid(8);
	}
	else if (URL.StartsWith(TEXT("http://")))
	{
		URL = TEXT("ws://") + URL.Mid(7);
	}
	else if (!URL.StartsWith(TEXT("ws://")) && !URL.StartsWith(TEXT("wss://")))
	{
		URL = TEXT("ws://") + URL;
	}

	// Remove trailing slash
	if (URL.EndsWith(TEXT("/")))
	{
		URL = URL.LeftChop(1);
	}

	// Append the WS bridge path
	URL += TEXT("/ws/conversation");

	return URL;
}

void FInsimulWSClient::Connect(const FString& ServerURL)
{
	if (WebSocket.IsValid() && bConnected)
	{
		return;
	}

	const FString WSUrl = DeriveWSUrl(ServerURL);

	UE_LOG(LogTemp, Log, TEXT("[InsimulWS] Connecting to %s"), *WSUrl);

	WebSocket = FWebSocketsModule::Get().CreateWebSocket(WSUrl, TEXT(""));

	// Bind handlers
	WebSocket->OnConnected().AddRaw(this, &FInsimulWSClient::OnConnected);
	WebSocket->OnConnectionError().AddRaw(this, &FInsimulWSClient::OnConnectionError);
	WebSocket->OnClosed().AddRaw(this, &FInsimulWSClient::OnClosed);
	WebSocket->OnMessage().AddRaw(this, &FInsimulWSClient::OnMessage);
	WebSocket->OnRawMessage().AddRaw(this, &FInsimulWSClient::OnRawMessage);

	WebSocket->Connect();
}

void FInsimulWSClient::Disconnect()
{
	if (WebSocket.IsValid())
	{
		if (WebSocket->IsConnected())
		{
			WebSocket->Close();
		}
		WebSocket.Reset();
	}
	bConnected = false;
	PendingAudioMeta.Empty();
}

bool FInsimulWSClient::IsConnected() const
{
	return bConnected && WebSocket.IsValid() && WebSocket->IsConnected();
}

void FInsimulWSClient::SendText(
	const FString& Text,
	const FString& SessionId,
	const FString& CharacterId,
	const FString& WorldId,
	const FString& LanguageCode)
{
	if (!IsConnected())
	{
		OnError.ExecuteIfBound(TEXT("WebSocket not connected"));
		return;
	}

	// Build JSON message matching ws-bridge expected format
	TSharedPtr<FJsonObject> TextInput = MakeShareable(new FJsonObject());
	TextInput->SetStringField(TEXT("text"), Text);
	TextInput->SetStringField(TEXT("sessionId"), SessionId);
	TextInput->SetStringField(TEXT("characterId"), CharacterId);
	TextInput->SetStringField(TEXT("worldId"), WorldId);
	TextInput->SetStringField(TEXT("languageCode"), LanguageCode);

	TSharedPtr<FJsonObject> Wrapper = MakeShareable(new FJsonObject());
	Wrapper->SetObjectField(TEXT("textInput"), TextInput);

	FString MessageStr;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&MessageStr);
	FJsonSerializer::Serialize(Wrapper.ToSharedRef(), Writer);

	WebSocket->Send(MessageStr);
}

void FInsimulWSClient::SendAudioChunk(const TArray<uint8>& AudioData)
{
	if (!IsConnected())
	{
		return;
	}

	// Send raw audio as binary WebSocket frame
	WebSocket->Send(AudioData.GetData(), AudioData.Num(), true);
}

void FInsimulWSClient::SendAudioEnd(
	const FString& SessionId,
	const FString& CharacterId,
	const FString& WorldId,
	const FString& LanguageCode)
{
	if (!IsConnected())
	{
		OnError.ExecuteIfBound(TEXT("WebSocket not connected"));
		return;
	}

	TSharedPtr<FJsonObject> AudioEnd = MakeShareable(new FJsonObject());
	AudioEnd->SetStringField(TEXT("sessionId"), SessionId);
	AudioEnd->SetStringField(TEXT("characterId"), CharacterId);
	AudioEnd->SetStringField(TEXT("worldId"), WorldId);
	AudioEnd->SetStringField(TEXT("languageCode"), LanguageCode);

	TSharedPtr<FJsonObject> Wrapper = MakeShareable(new FJsonObject());
	Wrapper->SetObjectField(TEXT("audioEnd"), AudioEnd);

	FString MessageStr;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&MessageStr);
	FJsonSerializer::Serialize(Wrapper.ToSharedRef(), Writer);

	WebSocket->Send(MessageStr);
}

void FInsimulWSClient::SendSystemCommand(const FString& CommandType, const FString& SessionId)
{
	if (!IsConnected())
	{
		return;
	}

	TSharedPtr<FJsonObject> Command = MakeShareable(new FJsonObject());
	Command->SetStringField(TEXT("type"), CommandType);
	Command->SetStringField(TEXT("sessionId"), SessionId);

	TSharedPtr<FJsonObject> Wrapper = MakeShareable(new FJsonObject());
	Wrapper->SetObjectField(TEXT("systemCommand"), Command);

	FString MessageStr;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&MessageStr);
	FJsonSerializer::Serialize(Wrapper.ToSharedRef(), Writer);

	WebSocket->Send(MessageStr);
}

// -- WebSocket event handlers ------------------------------------------------

void FInsimulWSClient::OnConnected()
{
	bConnected = true;
	UE_LOG(LogTemp, Log, TEXT("[InsimulWS] Connected to conversation bridge"));
}

void FInsimulWSClient::OnConnectionError(const FString& Error)
{
	bConnected = false;
	UE_LOG(LogTemp, Error, TEXT("[InsimulWS] Connection error: %s"), *Error);
	OnError.ExecuteIfBound(FString::Printf(TEXT("WebSocket connection error: %s"), *Error));
}

void FInsimulWSClient::OnClosed(int32 StatusCode, const FString& Reason, bool bWasClean)
{
	bConnected = false;
	UE_LOG(LogTemp, Log, TEXT("[InsimulWS] Connection closed: %d %s (clean: %d)"), StatusCode, *Reason, bWasClean);
}

void FInsimulWSClient::OnMessage(const FString& Message)
{
	// Parse JSON message from ws-bridge
	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);

	if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
	{
		return;
	}

	FString Type = JsonObject->GetStringField(TEXT("type"));

	if (Type == TEXT("text"))
	{
		FString Text = JsonObject->GetStringField(TEXT("text"));
		bool bIsFinal = JsonObject->GetBoolField(TEXT("isFinal"));
		OnTextChunk.ExecuteIfBound(Text, bIsFinal);
	}
	else if (Type == TEXT("audio_meta"))
	{
		// Queue audio metadata — will be paired with the next binary frame
		FAudioMeta Meta;
		Meta.Encoding = JsonObject->GetIntegerField(TEXT("encoding"));
		Meta.SampleRate = JsonObject->GetIntegerField(TEXT("sampleRate"));
		Meta.DurationMs = JsonObject->GetIntegerField(TEXT("durationMs"));
		PendingAudioMeta.Add(Meta);
	}
	else if (Type == TEXT("facial"))
	{
		// Viseme data — could be forwarded to face sync
		// For now, log and skip (face sync integration is a future step)
		UE_LOG(LogTemp, Verbose, TEXT("[InsimulWS] Received facial data"));
	}
	else if (Type == TEXT("transcript"))
	{
		FString Transcript = JsonObject->GetStringField(TEXT("text"));
		OnTranscript.ExecuteIfBound(Transcript);
	}
	else if (Type == TEXT("meta"))
	{
		FString SessionId = JsonObject->GetStringField(TEXT("sessionId"));
		FString State = JsonObject->GetStringField(TEXT("state"));
		OnMeta.ExecuteIfBound(SessionId, State);
	}
	else if (Type == TEXT("done"))
	{
		OnComplete.ExecuteIfBound();
	}
	else if (Type == TEXT("error"))
	{
		FString ErrorMsg = JsonObject->GetStringField(TEXT("message"));
		OnError.ExecuteIfBound(ErrorMsg);
	}
	else if (Type == TEXT("session_restored"))
	{
		UE_LOG(LogTemp, Log, TEXT("[InsimulWS] Session restored"));
	}
}

void FInsimulWSClient::OnRawMessage(const void* Data, SIZE_T Size, SIZE_T BytesRemaining)
{
	// Binary frame = raw audio data from TTS
	TArray<uint8> AudioData;
	AudioData.Append(static_cast<const uint8*>(Data), Size);

	// Pair with queued audio metadata
	int32 DurationMs = 0;
	if (PendingAudioMeta.Num() > 0)
	{
		DurationMs = PendingAudioMeta[0].DurationMs;
		PendingAudioMeta.RemoveAt(0);
	}

	OnAudioChunk.ExecuteIfBound(AudioData, DurationMs);
}
