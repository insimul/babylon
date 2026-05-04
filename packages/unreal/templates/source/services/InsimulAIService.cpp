#include "InsimulAIService.h"
#include "InsimulErrorReporter.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Engine/World.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "TimerManager.h"

void UInsimulAIService::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[InsimulAI] Service initialized"));
}

void UInsimulAIService::InitializeService(const FInsimulAIConfig& InConfig, const TArray<FInsimulDialogueContext>& InContexts)
{
    Config = InConfig;
    Contexts.Empty();
    Histories.Empty();

    for (const auto& Ctx : InContexts)
    {
        Contexts.Add(Ctx.CharacterId, Ctx);
    }

    UE_LOG(LogTemp, Log, TEXT("[InsimulAI] Initialized with %d contexts, mode: %s"), Contexts.Num(), *Config.ApiMode);
}

FInsimulDialogueContext UInsimulAIService::GetContext(const FString& CharacterId) const
{
    if (const FInsimulDialogueContext* Found = Contexts.Find(CharacterId))
    {
        return *Found;
    }
    return FInsimulDialogueContext();
}

void UInsimulAIService::SendMessage(const FString& CharacterId, const FString& UserMessage)
{
    SendMessageWithAppearance(CharacterId, UserMessage, FString());
}

void UInsimulAIService::SendMessageWithAppearance(const FString& CharacterId, const FString& UserMessage, const FString& AppearanceDescription)
{
    if (!Contexts.Contains(CharacterId))
    {
        OnChatError.Broadcast(CharacterId, TEXT("No dialogue context for: ") + CharacterId);
        return;
    }

    TArray<FChatMessage>& History = Histories.FindOrAdd(CharacterId);
    FChatMessage UserMsg;
    UserMsg.Role = TEXT("user");
    UserMsg.Text = UserMessage;
    History.Add(UserMsg);

    if (!AppearanceDescription.IsEmpty())
    {
        PendingAppearance.Add(CharacterId, AppearanceDescription);
    }
    else
    {
        PendingAppearance.Remove(CharacterId);
    }

    StartStreamWatchdog(CharacterId, UserMessage);

    const FInsimulDialogueContext& Context = Contexts[CharacterId];

    if (Config.ApiMode == TEXT("gemini"))
    {
        SendGeminiRequest(CharacterId, Context);
    }
    else
    {
        SendInsimulRequest(CharacterId, Context);
    }
}

void UInsimulAIService::ClearHistory(const FString& CharacterId)
{
    Histories.Remove(CharacterId);
}

void UInsimulAIService::SendInsimulRequest(const FString& CharacterId, const FInsimulDialogueContext& Context)
{
    const TArray<FChatMessage>& History = Histories[CharacterId];

    TSharedRef<FJsonObject> RequestObj = MakeShared<FJsonObject>();
    RequestObj->SetStringField(TEXT("characterId"), CharacterId);
    RequestObj->SetStringField(TEXT("text"), History.Last().Text);
    RequestObj->SetStringField(TEXT("systemPrompt"), Context.SystemPrompt);
    RequestObj->SetBoolField(TEXT("stream"), false); // UE HTTP doesn't support SSE easily

    // Forward appearance description so the LLM can acknowledge what the
    // player actually sees on the NPC model. Mirrors BabylonChatPanel.ts
    // sendMessageViaGrpc gameContext.appearanceDescription.
    if (const FString* Appearance = PendingAppearance.Find(CharacterId))
    {
        if (!Appearance->IsEmpty())
        {
            RequestObj->SetStringField(TEXT("appearanceDescription"), *Appearance);
        }
    }

    // Build history array (exclude last message)
    TArray<TSharedPtr<FJsonValue>> HistoryArr;
    for (int32 i = 0; i < History.Num() - 1; ++i)
    {
        TSharedRef<FJsonObject> MsgObj = MakeShared<FJsonObject>();
        MsgObj->SetStringField(TEXT("role"), History[i].Role);
        MsgObj->SetStringField(TEXT("text"), History[i].Text);
        HistoryArr.Add(MakeShared<FJsonValueObject>(MsgObj));
    }
    RequestObj->SetArrayField(TEXT("history"), HistoryArr);

    FString Body;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(RequestObj, Writer);

    FString Url = InsimulBaseUrl + Config.InsimulEndpoint;
    auto Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UInsimulAIService::HandleResponse, CharacterId);
    Request->ProcessRequest();
}

void UInsimulAIService::SendGeminiRequest(const FString& CharacterId, const FInsimulDialogueContext& Context)
{
    const TArray<FChatMessage>& History = Histories[CharacterId];
    FString Body = BuildGeminiRequestBody(Context.SystemPrompt, History);

    FString Url = FString::Printf(
        TEXT("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s"),
        *Config.GeminiModel, *Config.GeminiApiKey
    );

    auto Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UInsimulAIService::HandleResponse, CharacterId);
    Request->ProcessRequest();
}

void UInsimulAIService::HandleResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString CharacterId)
{
    // Watchdog may have already fired and torn down the pending state. If it
    // did, the timer handle will have been cleared and broadcasts will have
    // been sent — bail so we don't double-report.
    const bool bWatchdogWasActive = StreamWatchdogTimers.Contains(CharacterId);
    ClearStreamWatchdog(CharacterId);
    if (!bWatchdogWasActive)
    {
        return;
    }

    if (!bSuccess || !Response.IsValid())
    {
        FInsimulChatErrorScope Scope;
        Scope.Stage = TEXT("unknown");
        Scope.CharacterId = CharacterId;
        FInsimulErrorReporter::Capture(TEXT("HTTP request failed"), Scope);
        OnChatError.Broadcast(CharacterId, TEXT("HTTP request failed"));
        return;
    }

    int32 Code = Response->GetResponseCode();
    if (Code != 200)
    {
        const FString ErrMsg = FString::Printf(TEXT("HTTP %d"), Code);
        FInsimulChatErrorScope Scope;
        Scope.Stage = FInsimulErrorReporter::ClassifyErrorStage(ErrMsg);
        Scope.CharacterId = CharacterId;
        FInsimulErrorReporter::Capture(ErrMsg, Scope);
        OnChatError.Broadcast(CharacterId, ErrMsg);
        return;
    }

    FString Body = Response->GetContentAsString();
    FString FullText;

    if (Config.ApiMode == TEXT("gemini"))
    {
        FullText = ExtractTextFromGemini(Body);
    }
    else
    {
        FullText = ExtractTextFromSSE(Body);
    }

    if (FullText.IsEmpty())
    {
        FInsimulChatErrorScope Scope;
        Scope.Stage = TEXT("safety");
        Scope.CharacterId = CharacterId;
        FInsimulErrorReporter::Capture(TEXT("Empty response"), Scope);
        OnChatError.Broadcast(CharacterId, TEXT("Empty response"));
        return;
    }

    // Store in history
    TArray<FChatMessage>& History = Histories.FindOrAdd(CharacterId);
    FChatMessage AssistantMsg;
    AssistantMsg.Role = TEXT("model");
    AssistantMsg.Text = FullText;
    History.Add(AssistantMsg);

    OnChatChunk.Broadcast(CharacterId, FullText);
    OnChatComplete.Broadcast(CharacterId, FullText);
}

// ─── Stream watchdog ────────────────────────────────────────────────────────
//
// Ports BabylonChatPanel.ts sendMessageViaGrpc streamTimeoutMs race: if the
// server never completes within STREAM_TIMEOUT_SECONDS, broadcast a timeout
// error so the dialogue UI can unstick itself and surface a friendly message.

void UInsimulAIService::StartStreamWatchdog(const FString& CharacterId, const FString& UserMessage)
{
    ClearStreamWatchdog(CharacterId);

    UWorld* World = GetWorld();
    if (!World) return;

    FTimerHandle& Handle = StreamWatchdogTimers.Add(CharacterId);
    FString CapturedId = CharacterId;
    FString CapturedMsg = UserMessage;
    World->GetTimerManager().SetTimer(
        Handle,
        FTimerDelegate::CreateUObject(this, &UInsimulAIService::OnStreamWatchdogFired, CapturedId, CapturedMsg),
        STREAM_TIMEOUT_SECONDS,
        false
    );
}

void UInsimulAIService::ClearStreamWatchdog(const FString& CharacterId)
{
    if (FTimerHandle* Handle = StreamWatchdogTimers.Find(CharacterId))
    {
        if (UWorld* World = GetWorld())
        {
            World->GetTimerManager().ClearTimer(*Handle);
        }
        StreamWatchdogTimers.Remove(CharacterId);
    }
}

void UInsimulAIService::OnStreamWatchdogFired(FString CharacterId, FString UserMessage)
{
    // Timer fires only if HandleResponse hasn't already cleared it.
    StreamWatchdogTimers.Remove(CharacterId);

    const FString ErrMsg = FString::Printf(
        TEXT("Stream timeout: no done event in %.0fs"),
        STREAM_TIMEOUT_SECONDS
    );

    FInsimulChatErrorScope Scope;
    Scope.Stage = TEXT("timeout");
    Scope.CharacterId = CharacterId;
    Scope.UserMessage = UserMessage;
    FInsimulErrorReporter::Capture(ErrMsg, Scope);

    OnChatTimedOut.Broadcast(CharacterId, ErrMsg);
    OnChatError.Broadcast(CharacterId, ErrMsg);
}

FString UInsimulAIService::BuildGeminiRequestBody(const FString& SystemPrompt, const TArray<FChatMessage>& History) const
{
    TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();

    // System instruction
    TSharedRef<FJsonObject> SysInstr = MakeShared<FJsonObject>();
    TArray<TSharedPtr<FJsonValue>> SysParts;
    TSharedRef<FJsonObject> SysTextObj = MakeShared<FJsonObject>();
    SysTextObj->SetStringField(TEXT("text"), SystemPrompt);
    SysParts.Add(MakeShared<FJsonValueObject>(SysTextObj));
    SysInstr->SetArrayField(TEXT("parts"), SysParts);
    Root->SetObjectField(TEXT("system_instruction"), SysInstr);

    // Contents
    TArray<TSharedPtr<FJsonValue>> Contents;
    for (const auto& Msg : History)
    {
        TSharedRef<FJsonObject> ContentObj = MakeShared<FJsonObject>();
        ContentObj->SetStringField(TEXT("role"), Msg.Role == TEXT("model") ? TEXT("model") : TEXT("user"));

        TArray<TSharedPtr<FJsonValue>> Parts;
        TSharedRef<FJsonObject> TextObj = MakeShared<FJsonObject>();
        TextObj->SetStringField(TEXT("text"), Msg.Text);
        Parts.Add(MakeShared<FJsonValueObject>(TextObj));
        ContentObj->SetArrayField(TEXT("parts"), Parts);

        Contents.Add(MakeShared<FJsonValueObject>(ContentObj));
    }
    Root->SetArrayField(TEXT("contents"), Contents);

    // Generation config
    TSharedRef<FJsonObject> GenConfig = MakeShared<FJsonObject>();
    GenConfig->SetNumberField(TEXT("temperature"), 0.8);
    GenConfig->SetNumberField(TEXT("maxOutputTokens"), 2048);
    Root->SetObjectField(TEXT("generationConfig"), GenConfig);

    FString Body;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(Root, Writer);
    return Body;
}

FString UInsimulAIService::ExtractTextFromSSE(const FString& ResponseBody) const
{
    // Try JSON response format first
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseBody);
    if (FJsonSerializer::Deserialize(Reader, Root) && Root.IsValid())
    {
        FString Text;
        if (Root->TryGetStringField(TEXT("response"), Text) || Root->TryGetStringField(TEXT("text"), Text))
        {
            return Text;
        }
    }

    // Parse SSE lines
    FString FullText;
    TArray<FString> Lines;
    ResponseBody.ParseIntoArrayLines(Lines);
    for (const FString& Line : Lines)
    {
        if (Line.StartsWith(TEXT("data: ")))
        {
            FString Payload = Line.Mid(6);
            if (Payload == TEXT("[DONE]")) continue;

            TSharedPtr<FJsonObject> ChunkObj;
            TSharedRef<TJsonReader<>> ChunkReader = TJsonReaderFactory<>::Create(Payload);
            if (FJsonSerializer::Deserialize(ChunkReader, ChunkObj) && ChunkObj.IsValid())
            {
                FString ChunkText;
                if (ChunkObj->TryGetStringField(TEXT("text"), ChunkText) || ChunkObj->TryGetStringField(TEXT("chunk"), ChunkText))
                {
                    FullText += ChunkText;
                }
            }
        }
    }
    return FullText;
}

FString UInsimulAIService::ExtractTextFromGemini(const FString& ResponseBody) const
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseBody);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return TEXT("");

    FString FullText;
    const TArray<TSharedPtr<FJsonValue>>* Candidates;
    if (Root->TryGetArrayField(TEXT("candidates"), Candidates) && Candidates->Num() > 0)
    {
        auto CandidateObj = (*Candidates)[0]->AsObject();
        if (CandidateObj)
        {
            auto ContentObj = CandidateObj->GetObjectField(TEXT("content"));
            if (ContentObj)
            {
                const TArray<TSharedPtr<FJsonValue>>* Parts;
                if (ContentObj->TryGetArrayField(TEXT("parts"), Parts))
                {
                    for (const auto& Part : *Parts)
                    {
                        auto PartObj = Part->AsObject();
                        if (PartObj)
                        {
                            FString Text;
                            if (PartObj->TryGetStringField(TEXT("text"), Text))
                            {
                                FullText += Text;
                            }
                        }
                    }
                }
            }
        }
    }
    return FullText;
}
