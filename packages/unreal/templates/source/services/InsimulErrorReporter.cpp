#include "InsimulErrorReporter.h"

DEFINE_LOG_CATEGORY(LogInsimulChat);

FInsimulChatErrorHandler FInsimulErrorReporter::Handler;

void FInsimulErrorReporter::SetHandler(const FInsimulChatErrorHandler& InHandler)
{
    Handler = InHandler;
}

void FInsimulErrorReporter::Capture(const FString& Message, const FInsimulChatErrorScope& Scope)
{
    UE_LOG(LogInsimulChat, Error,
           TEXT("[chat-panel %s] %s | characterId=%s worldId=%s accumulated=%d"),
           *Scope.Stage, *Message, *Scope.CharacterId, *Scope.WorldId, Scope.AccumulatedTextLength);

    if (Handler.IsBound())
    {
        Handler.Execute(Message, Scope);
    }
}

FString FInsimulErrorReporter::ClassifyErrorStage(const FString& Message)
{
    if (Message.IsEmpty())
    {
        return TEXT("unknown");
    }
    const FString Lower = Message.ToLower();
    if (Lower.Contains(TEXT("timeout")) || Lower.Contains(TEXT("ws timeout")))
    {
        return TEXT("timeout");
    }
    if (Lower.Contains(TEXT("llm")) && Lower.Contains(TEXT("not available")))
    {
        return TEXT("provider");
    }
    if (Lower.Contains(TEXT("provider")))
    {
        return TEXT("provider");
    }
    if (Lower.Contains(TEXT("safety")) || Lower.Contains(TEXT("blocked")) || Lower.Contains(TEXT("empty response")))
    {
        return TEXT("safety");
    }
    return TEXT("unknown");
}

FString FInsimulErrorReporter::DisplayMessageForStage(const FString& Stage)
{
    if (Stage == TEXT("timeout"))
    {
        return TEXT("Sorry, the connection timed out. Please try again.");
    }
    if (Stage == TEXT("provider"))
    {
        return TEXT("The conversation service is temporarily unavailable.");
    }
    if (Stage == TEXT("safety"))
    {
        return TEXT("I'm not sure how to respond to that. Could you rephrase?");
    }
    return TEXT("Sorry, I cannot respond right now. Please try again.");
}
