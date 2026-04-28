// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulOfflineProvider.h"
#include "InsimulSettings.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

FInsimulOfflineProvider::FInsimulOfflineProvider()
{
}

FInsimulOfflineProvider::~FInsimulOfflineProvider()
{
	Sessions.Empty();
}

void FInsimulOfflineProvider::Initialize(
	const FString& InLLMServerURL,
	const FString& InModelName,
	int32 InMaxTokens,
	float InTemperature)
{
	LLMServerURL = InLLMServerURL;
	LLMModel = InModelName;
	LLMMaxTokens = InMaxTokens;
	LLMTemperature = InTemperature;

	UE_LOG(LogTemp, Log, TEXT("[InsimulOffline] Initialized — LLM: %s, Model: %s, MaxTokens: %d"),
		*LLMServerURL, *LLMModel, LLMMaxTokens);
}

bool FInsimulOfflineProvider::LoadWorldData(const FString& FilePath)
{
	bWorldLoaded = FInsimulWorldExportLoader::LoadFromFile(FilePath, WorldData);
	if (bWorldLoaded)
	{
		UE_LOG(LogTemp, Log, TEXT("[InsimulOffline] World loaded: '%s' (%d characters, %d contexts)"),
			*WorldData.WorldName, WorldData.Characters.Num(), WorldData.DialogueContexts.Num());
	}
	return bWorldLoaded;
}

bool FInsimulOfflineProvider::LoadWorldDataFromDirectory(const FString& DataDirectory)
{
	bWorldLoaded = FInsimulWorldExportLoader::LoadFromDataDirectory(DataDirectory, WorldData);
	if (bWorldLoaded)
	{
		UE_LOG(LogTemp, Log, TEXT("[InsimulOffline] World loaded from directory: '%s' (%d characters, %d contexts)"),
			*WorldData.WorldName, WorldData.Characters.Num(), WorldData.DialogueContexts.Num());
	}
	return bWorldLoaded;
}

void FInsimulOfflineProvider::SendText(
	const FString& Text,
	const FString& SessionId,
	const FString& CharacterId,
	const FString& LanguageCode)
{
	if (!bWorldLoaded)
	{
		OnError.ExecuteIfBound(TEXT("World data not loaded"));
		return;
	}

	// Get or create session
	FConversationSession& Session = Sessions.FindOrAdd(SessionId);
	if (Session.CharacterId.IsEmpty())
	{
		Session.CharacterId = CharacterId;
	}

	// Add user message to history
	Session.History.Add(TPair<FString, FString>(TEXT("user"), Text));

	// Build prompt and send to LLM
	FString Prompt = BuildPrompt(CharacterId, Text, SessionId);
	FString RequestBody = BuildLLMRequestBody(Prompt);

	FHttpModule* HttpModule = &FHttpModule::Get();
	TSharedRef<IHttpRequest> Request = HttpModule->CreateRequest();
	Request->SetURL(LLMServerURL);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetContentAsString(RequestBody);

	// Capture SessionId and CharacterId for the response callback
	Request->OnProcessRequestComplete().BindRaw(
		this, &FInsimulOfflineProvider::OnLLMResponse, SessionId, CharacterId);

	Request->ProcessRequest();

	UE_LOG(LogTemp, Log, TEXT("[InsimulOffline] Sent message to LLM for character %s: %s"), *CharacterId, *Text);
}

void FInsimulOfflineProvider::EndSession(const FString& SessionId)
{
	Sessions.Remove(SessionId);
	UE_LOG(LogTemp, Log, TEXT("[InsimulOffline] Session ended: %s"), *SessionId);
}

FString FInsimulOfflineProvider::GetGreeting(const FString& CharacterId) const
{
	if (const FInsimulDialogueContext* Ctx = WorldData.FindDialogueContext(CharacterId))
	{
		return Ctx->Greeting;
	}
	return TEXT("");
}

FString FInsimulOfflineProvider::GetVoice(const FString& CharacterId) const
{
	if (const FInsimulDialogueContext* Ctx = WorldData.FindDialogueContext(CharacterId))
	{
		return Ctx->Voice;
	}
	return TEXT("Kore");
}

TArray<FString> FInsimulOfflineProvider::GetCharacterIds() const
{
	TArray<FString> Ids;
	for (const FInsimulDialogueContext& Ctx : WorldData.DialogueContexts)
	{
		Ids.Add(Ctx.CharacterId);
	}
	return Ids;
}

// ── Prompt Building ─────────────────────────────────────────────────────

FString FInsimulOfflineProvider::BuildPrompt(
	const FString& CharacterId,
	const FString& UserMessage,
	const FString& SessionId) const
{
	FString Prompt;

	// System prompt from dialogue context (pre-built by Insimul export)
	if (const FInsimulDialogueContext* Ctx = WorldData.FindDialogueContext(CharacterId))
	{
		Prompt = Ctx->SystemPrompt;
		Prompt += TEXT("\n\n");
	}
	else
	{
		// Fallback: build a basic prompt from character data
		if (const FInsimulExportedCharacter* Char = WorldData.FindCharacter(CharacterId))
		{
			Prompt = FString::Printf(
				TEXT("You are %s %s, a %s. Stay in character and respond naturally.\n\n"),
				*Char->FirstName, *Char->LastName, *Char->Occupation);
		}
		else
		{
			Prompt = TEXT("You are an NPC in a game world. Respond in character.\n\n");
		}
	}

	// Append conversation history
	if (const FConversationSession* Session = Sessions.Find(SessionId))
	{
		for (const TPair<FString, FString>& Entry : Session->History)
		{
			if (Entry.Key == TEXT("user"))
			{
				Prompt += FString::Printf(TEXT("Player: %s\n"), *Entry.Value);
			}
			else
			{
				// Use character name if available
				FString SpeakerName = TEXT("NPC");
				if (const FInsimulDialogueContext* Ctx = WorldData.FindDialogueContext(CharacterId))
				{
					SpeakerName = Ctx->CharacterName;
				}
				Prompt += FString::Printf(TEXT("%s: %s\n"), *SpeakerName, *Entry.Value);
			}
		}
	}

	// Add NPC turn marker (LLM continues from here)
	FString NPCName = TEXT("NPC");
	if (const FInsimulDialogueContext* Ctx = WorldData.FindDialogueContext(CharacterId))
	{
		NPCName = Ctx->CharacterName;
	}
	Prompt += FString::Printf(TEXT("%s:"), *NPCName);

	return Prompt;
}

FString FInsimulOfflineProvider::BuildLLMRequestBody(const FString& Prompt) const
{
	TSharedPtr<FJsonObject> RequestBody = MakeShareable(new FJsonObject());

	// Detect Ollama vs llama.cpp from URL pattern
	if (LLMServerURL.Contains(TEXT("/api/generate")) || LLMServerURL.Contains(TEXT("/api/chat")))
	{
		// Ollama format
		RequestBody->SetStringField(TEXT("model"), LLMModel);
		RequestBody->SetStringField(TEXT("prompt"), Prompt);
		RequestBody->SetBoolField(TEXT("stream"), false);

		TSharedPtr<FJsonObject> Options = MakeShareable(new FJsonObject());
		Options->SetNumberField(TEXT("temperature"), LLMTemperature);
		Options->SetNumberField(TEXT("num_predict"), LLMMaxTokens);
		Options->SetNumberField(TEXT("top_k"), 40);
		Options->SetNumberField(TEXT("top_p"), 0.5);
		Options->SetNumberField(TEXT("repeat_penalty"), 1.18);

		// Stop tokens
		TArray<TSharedPtr<FJsonValue>> StopTokens;
		StopTokens.Add(MakeShareable(new FJsonValueString(TEXT("Player:"))));
		StopTokens.Add(MakeShareable(new FJsonValueString(TEXT("</s>"))));
		StopTokens.Add(MakeShareable(new FJsonValueString(TEXT("\nPlayer"))));
		Options->SetArrayField(TEXT("stop"), StopTokens);

		RequestBody->SetObjectField(TEXT("options"), Options);
	}
	else
	{
		// llama.cpp /completion format
		RequestBody->SetStringField(TEXT("prompt"), Prompt);
		RequestBody->SetNumberField(TEXT("n_predict"), LLMMaxTokens);
		RequestBody->SetNumberField(TEXT("temperature"), LLMTemperature);
		RequestBody->SetNumberField(TEXT("top_k"), 40);
		RequestBody->SetNumberField(TEXT("top_p"), 0.5);
		RequestBody->SetNumberField(TEXT("repeat_penalty"), 1.18);
		RequestBody->SetNumberField(TEXT("repeat_last_n"), 256);
		RequestBody->SetBoolField(TEXT("cache_prompt"), true);
		RequestBody->SetBoolField(TEXT("stream"), false);

		TArray<TSharedPtr<FJsonValue>> StopTokens;
		StopTokens.Add(MakeShareable(new FJsonValueString(TEXT("Player:"))));
		StopTokens.Add(MakeShareable(new FJsonValueString(TEXT("</s>"))));
		StopTokens.Add(MakeShareable(new FJsonValueString(TEXT("\nPlayer"))));
		RequestBody->SetArrayField(TEXT("stop"), StopTokens);
	}

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(RequestBody.ToSharedRef(), Writer);
	return Body;
}

// ── LLM Response Handling ───────────────────────────────────────────────

void FInsimulOfflineProvider::OnLLMResponse(
	FHttpRequestPtr Request,
	FHttpResponsePtr Response,
	bool bSuccess,
	FString SessionId,
	FString CharacterId)
{
	if (!bSuccess || !Response.IsValid())
	{
		OnError.ExecuteIfBound(TEXT("LLM server request failed — is the server running?"));
		OnComplete.ExecuteIfBound();
		return;
	}

	const int32 ResponseCode = Response->GetResponseCode();
	if (ResponseCode != 200)
	{
		OnError.ExecuteIfBound(FString::Printf(TEXT("LLM server returned %d"), ResponseCode));
		OnComplete.ExecuteIfBound();
		return;
	}

	const FString ResponseBody = Response->GetContentAsString();
	FString GeneratedText = ParseLLMResponse(ResponseBody);

	if (GeneratedText.IsEmpty())
	{
		OnError.ExecuteIfBound(TEXT("LLM returned empty response"));
		OnComplete.ExecuteIfBound();
		return;
	}

	// Clean up the response — trim whitespace and any trailing turn markers
	GeneratedText = GeneratedText.TrimStartAndEnd();

	// Store in history
	FConversationSession* Session = Sessions.Find(SessionId);
	if (Session)
	{
		Session->History.Add(TPair<FString, FString>(TEXT("assistant"), GeneratedText));
	}

	// Fire text chunk delegate (full text at once — non-streaming LLM)
	OnTextChunk.ExecuteIfBound(GeneratedText, true);

	// Signal completion
	OnComplete.ExecuteIfBound();

	UE_LOG(LogTemp, Log, TEXT("[InsimulOffline] LLM response for %s: %s"),
		*CharacterId, *GeneratedText.Left(100));
}

FString FInsimulOfflineProvider::ParseLLMResponse(const FString& ResponseBody) const
{
	TSharedPtr<FJsonObject> JsonObj;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseBody);

	if (!FJsonSerializer::Deserialize(Reader, JsonObj) || !JsonObj.IsValid())
	{
		return FString();
	}

	// Ollama format: {"response": "..."}
	if (JsonObj->HasField(TEXT("response")))
	{
		return JsonObj->GetStringField(TEXT("response"));
	}

	// llama.cpp format: {"content": "..."}
	if (JsonObj->HasField(TEXT("content")))
	{
		return JsonObj->GetStringField(TEXT("content"));
	}

	// Gemini format: candidates[0].content.parts[0].text
	if (JsonObj->HasField(TEXT("candidates")))
	{
		const TArray<TSharedPtr<FJsonValue>> Candidates = JsonObj->GetArrayField(TEXT("candidates"));
		if (Candidates.Num() > 0)
		{
			const TSharedPtr<FJsonObject> Content = Candidates[0]->AsObject()->GetObjectField(TEXT("content"));
			const TArray<TSharedPtr<FJsonValue>> Parts = Content->GetArrayField(TEXT("parts"));
			if (Parts.Num() > 0)
			{
				return Parts[0]->AsObject()->GetStringField(TEXT("text"));
			}
		}
	}

	return FString();
}
