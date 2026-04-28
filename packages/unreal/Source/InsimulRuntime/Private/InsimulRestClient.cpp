// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulRestClient.h"
#include "HttpModule.h"
#include "JsonObjectConverter.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

FInsimulRestClient::FInsimulRestClient()
    : ServerURL(TEXT("http://localhost:8080"))
    , APIKey(TEXT(""))
    , CurrentConversationId(TEXT(""))
{
}

FInsimulRestClient::~FInsimulRestClient()
{
}

void FInsimulRestClient::Initialize(const FString& InServerURL, const FString& InAPIKey)
{
    ServerURL = InServerURL;
    APIKey = InAPIKey;

    UE_LOG(LogTemp, Log, TEXT("InsimulRestClient initialized with server: %s"), *ServerURL);
}

TSharedRef<IHttpRequest> FInsimulRestClient::CreateHttpRequest(const FString& Endpoint, const FString& Verb)
{
    FHttpModule* HttpModule = &FHttpModule::Get();
    TSharedRef<IHttpRequest> HttpRequest = HttpModule->CreateRequest();

    HttpRequest->SetURL(ServerURL + Endpoint);
    HttpRequest->SetVerb(Verb);
    HttpRequest->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

    if (!APIKey.IsEmpty())
    {
        HttpRequest->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *APIKey));
    }

    return HttpRequest;
}

void FInsimulRestClient::HandleHttpError(const FString& Operation, FHttpResponsePtr Response)
{
    FString ErrorMessage;

    if (!Response.IsValid())
    {
        ErrorMessage = FString::Printf(TEXT("%s failed: Invalid response"), *Operation);
    }
    else
    {
        ErrorMessage = FString::Printf(TEXT("%s failed with code %d: %s"),
            *Operation,
            Response->GetResponseCode(),
            *Response->GetContentAsString());
    }

    UE_LOG(LogTemp, Error, TEXT("%s"), *ErrorMessage);
    OnError.ExecuteIfBound(ErrorMessage);
}

void FInsimulRestClient::StartConversation(const FString& InitiatorId, const FString& TargetId, const FString& Location, int32 CurrentTimestep)
{
    UE_LOG(LogTemp, Log, TEXT("Starting Insimul conversation: %s -> %s at %s"), *InitiatorId, *TargetId, *Location);

    CurrentInitiatorId = InitiatorId;
    CurrentTargetId = TargetId;

    // Create request body
    TSharedPtr<FJsonObject> RequestBody = MakeShareable(new FJsonObject());
    RequestBody->SetStringField(TEXT("initiatorId"), InitiatorId);
    RequestBody->SetStringField(TEXT("targetId"), TargetId);
    RequestBody->SetStringField(TEXT("location"), Location);
    RequestBody->SetNumberField(TEXT("currentTimestep"), CurrentTimestep);

    FString RequestBodyString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&RequestBodyString);
    FJsonSerializer::Serialize(RequestBody.ToSharedRef(), Writer);

    // Create and configure HTTP request
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(TEXT("/api/conversations/start"), TEXT("POST"));
    HttpRequest->SetContentAsString(RequestBodyString);
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnStartConversationResponse);

    // Send request
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnStartConversationResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        HandleHttpError(TEXT("Start Conversation"), Response);
        return;
    }

    // Parse response
    FString ResponseString = Response->GetContentAsString();
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseString);

    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        // Extract conversation ID
        FString ConversationId = JsonObject->GetStringField(TEXT("id"));
        CurrentConversationId = ConversationId;

        UE_LOG(LogTemp, Log, TEXT("Conversation started successfully. ID: %s"), *ConversationId);
        OnConversationStarted.ExecuteIfBound(ConversationId);

        // Automatically get first utterance
        ContinueConversation(ConversationId, 0);
    }
    else
    {
        HandleHttpError(TEXT("Parse Start Conversation Response"), Response);
    }
}

void FInsimulRestClient::ContinueConversation(const FString& InConversationId, int32 CurrentTimestep)
{
    if (InConversationId.IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("Cannot continue conversation: No active conversation ID"));
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("Continuing conversation: %s"), *InConversationId);

    // Create request body
    TSharedPtr<FJsonObject> RequestBody = MakeShareable(new FJsonObject());
    RequestBody->SetNumberField(TEXT("currentTimestep"), CurrentTimestep);

    FString RequestBodyString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&RequestBodyString);
    FJsonSerializer::Serialize(RequestBody.ToSharedRef(), Writer);

    // Create and configure HTTP request
    FString Endpoint = FString::Printf(TEXT("/api/conversations/%s/continue"), *InConversationId);
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(Endpoint, TEXT("POST"));
    HttpRequest->SetContentAsString(RequestBodyString);
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnContinueConversationResponse);

    // Send request
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnContinueConversationResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid())
    {
        HandleHttpError(TEXT("Continue Conversation"), Response);
        return;
    }

    int32 ResponseCode = Response->GetResponseCode();

    // 404 means conversation not found or ended
    if (ResponseCode == 404)
    {
        UE_LOG(LogTemp, Log, TEXT("Conversation has ended or not found"));
        CurrentConversationId.Empty();
        OnConversationEnded.ExecuteIfBound();
        return;
    }

    if (ResponseCode != 200)
    {
        HandleHttpError(TEXT("Continue Conversation"), Response);
        return;
    }

    // Parse response
    FString ResponseString = Response->GetContentAsString();
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseString);

    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        // Extract utterance data
        FString Speaker = JsonObject->GetStringField(TEXT("speaker"));
        FString Content = JsonObject->GetStringField(TEXT("content"));

        UE_LOG(LogTemp, Log, TEXT("Utterance received from %s: %s"), *Speaker, *Content);
        OnUtteranceReceived.ExecuteIfBound(Content, Speaker);
    }
    else
    {
        HandleHttpError(TEXT("Parse Continue Conversation Response"), Response);
    }
}

void FInsimulRestClient::EndConversation(const FString& InConversationId, int32 CurrentTimestep)
{
    if (InConversationId.IsEmpty())
    {
        UE_LOG(LogTemp, Warning, TEXT("Cannot end conversation: No active conversation ID"));
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("Ending conversation: %s"), *InConversationId);

    // Create request body
    TSharedPtr<FJsonObject> RequestBody = MakeShareable(new FJsonObject());
    RequestBody->SetNumberField(TEXT("currentTimestep"), CurrentTimestep);

    FString RequestBodyString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&RequestBodyString);
    FJsonSerializer::Serialize(RequestBody.ToSharedRef(), Writer);

    // Create and configure HTTP request
    FString Endpoint = FString::Printf(TEXT("/api/conversations/%s/end"), *InConversationId);
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(Endpoint, TEXT("POST"));
    HttpRequest->SetContentAsString(RequestBodyString);
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnEndConversationResponse);

    // Send request
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnEndConversationResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        HandleHttpError(TEXT("End Conversation"), Response);
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("Conversation ended successfully"));
    CurrentConversationId.Empty();
    CurrentInitiatorId.Empty();
    CurrentTargetId.Empty();
    OnConversationEnded.ExecuteIfBound();
}

void FInsimulRestClient::GetCharacter(const FString& CharacterId)
{
    UE_LOG(LogTemp, Log, TEXT("Fetching character: %s"), *CharacterId);

    FString Endpoint = FString::Printf(TEXT("/api/characters/%s"), *CharacterId);
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(Endpoint, TEXT("GET"));
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnGetCharacterResponse);
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnGetCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        HandleHttpError(TEXT("Get Character"), Response);
        return;
    }

    FString ResponseString = Response->GetContentAsString();
    UE_LOG(LogTemp, Log, TEXT("Character data received: %s"), *ResponseString);
}

void FInsimulRestClient::CreateCharacter(const FString& WorldId, const FString& FirstName, const FString& LastName, const FString& AdditionalData)
{
    UE_LOG(LogTemp, Log, TEXT("Creating character: %s %s in world %s"), *FirstName, *LastName, *WorldId);

    // Create request body
    TSharedPtr<FJsonObject> RequestBody = MakeShareable(new FJsonObject());
    RequestBody->SetStringField(TEXT("firstName"), FirstName);
    RequestBody->SetStringField(TEXT("lastName"), LastName);

    // Parse and merge additional data if provided
    if (!AdditionalData.IsEmpty())
    {
        TSharedPtr<FJsonObject> AdditionalJson;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(AdditionalData);
        if (FJsonSerializer::Deserialize(Reader, AdditionalJson) && AdditionalJson.IsValid())
        {
            for (auto& Pair : AdditionalJson->Values)
            {
                RequestBody->SetField(Pair.Key, Pair.Value);
            }
        }
    }

    FString RequestBodyString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&RequestBodyString);
    FJsonSerializer::Serialize(RequestBody.ToSharedRef(), Writer);

    // Create and configure HTTP request
    FString Endpoint = FString::Printf(TEXT("/api/worlds/%s/characters"), *WorldId);
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(Endpoint, TEXT("POST"));
    HttpRequest->SetContentAsString(RequestBodyString);
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnCreateCharacterResponse);

    // Send request
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnCreateCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 201)
    {
        HandleHttpError(TEXT("Create Character"), Response);
        return;
    }

    FString ResponseString = Response->GetContentAsString();
    UE_LOG(LogTemp, Log, TEXT("Character created successfully: %s"), *ResponseString);
}

void FInsimulRestClient::TextToSpeech(const FString& Text, const FString& Voice, const FString& Gender)
{
    UE_LOG(LogTemp, Log, TEXT("Converting text to speech: %s"), *Text.Left(50));

    // Create request body
    TSharedPtr<FJsonObject> RequestBody = MakeShareable(new FJsonObject());
    RequestBody->SetStringField(TEXT("text"), Text);
    RequestBody->SetStringField(TEXT("voice"), Voice);
    RequestBody->SetStringField(TEXT("gender"), Gender);
    RequestBody->SetStringField(TEXT("encoding"), TEXT("WAV")); // Request WAV format for Unreal compatibility

    FString RequestBodyString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&RequestBodyString);
    FJsonSerializer::Serialize(RequestBody.ToSharedRef(), Writer);

    // Create and configure HTTP request
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(TEXT("/api/tts"), TEXT("POST"));
    HttpRequest->SetContentAsString(RequestBodyString);
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnTextToSpeechResponse);

    // Send request
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnTextToSpeechResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        HandleHttpError(TEXT("Text To Speech"), Response);
        return;
    }

    // Get audio data from response
    TArray<uint8> AudioData = Response->GetContent();

    UE_LOG(LogTemp, Log, TEXT("TTS audio received: %d bytes"), AudioData.Num());
    OnAudioReceived.ExecuteIfBound(AudioData);
}

void FInsimulRestClient::SpeechToText(const TArray<uint8>& AudioData)
{
    UE_LOG(LogTemp, Log, TEXT("Converting speech to text: %d bytes"), AudioData.Num());

    // Create multipart form data request
    FString Boundary = TEXT("----UnrealBoundary") + FString::FromInt(FMath::Rand());
    FString BeginBoundary = TEXT("\r\n--") + Boundary + TEXT("\r\n");
    FString EndBoundary = TEXT("\r\n--") + Boundary + TEXT("--\r\n");

    // Build multipart body
    TArray<uint8> RequestBody;

    // Add audio file part
    FString ContentDisposition = TEXT("Content-Disposition: form-data; name=\"audio\"; filename=\"audio.wav\"\r\n");
    FString ContentType = TEXT("Content-Type: audio/wav\r\n\r\n");

    FTCHARToUTF8 BeginBoundaryUTF8(*BeginBoundary);
    RequestBody.Append((uint8*)BeginBoundaryUTF8.Get(), BeginBoundaryUTF8.Length());

    FTCHARToUTF8 ContentDispositionUTF8(*ContentDisposition);
    RequestBody.Append((uint8*)ContentDispositionUTF8.Get(), ContentDispositionUTF8.Length());

    FTCHARToUTF8 ContentTypeUTF8(*ContentType);
    RequestBody.Append((uint8*)ContentTypeUTF8.Get(), ContentTypeUTF8.Length());

    // Add audio data
    RequestBody.Append(AudioData);

    // Add end boundary
    FTCHARToUTF8 EndBoundaryUTF8(*EndBoundary);
    RequestBody.Append((uint8*)EndBoundaryUTF8.Get(), EndBoundaryUTF8.Length());

    // Create and configure HTTP request
    TSharedRef<IHttpRequest> HttpRequest = CreateHttpRequest(TEXT("/api/stt"), TEXT("POST"));
    HttpRequest->SetHeader(TEXT("Content-Type"), FString::Printf(TEXT("multipart/form-data; boundary=%s"), *Boundary));
    HttpRequest->SetContent(RequestBody);
    HttpRequest->OnProcessRequestComplete().BindRaw(this, &FInsimulRestClient::OnSpeechToTextResponse);

    // Send request
    HttpRequest->ProcessRequest();
}

void FInsimulRestClient::OnSpeechToTextResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        HandleHttpError(TEXT("Speech To Text"), Response);
        return;
    }

    // Parse response
    FString ResponseString = Response->GetContentAsString();
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseString);

    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        FString Transcript = JsonObject->GetStringField(TEXT("transcript"));
        UE_LOG(LogTemp, Log, TEXT("STT transcript received: %s"), *Transcript);
        OnTranscriptReceived.ExecuteIfBound(Transcript);
    }
    else
    {
        HandleHttpError(TEXT("Parse Speech To Text Response"), Response);
    }
}
