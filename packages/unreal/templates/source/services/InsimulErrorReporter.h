#pragma once

#include "CoreMinimal.h"

/**
 * Minimal error reporting for NPC-chat failures. Ports BabylonChatPanel.ts
 * Sentry.captureException calls to Unreal.
 *
 * Default behavior: UE_LOG + optional crash-reporter breadcrumb. To route to
 * Sentry (or any external reporter), install a handler via SetHandler that
 * mirrors the Sentry SDK signature.
 */

DECLARE_LOG_CATEGORY_EXTERN(LogInsimulChat, Log, All);

struct FInsimulChatErrorScope
{
    /** One of "timeout" | "provider" | "safety" | "sendMessage" | "unknown". */
    FString Stage;
    FString CharacterId;
    FString WorldId;
    FString UserMessage;
    int32 AccumulatedTextLength = 0;
};

DECLARE_DELEGATE_TwoParams(FInsimulChatErrorHandler, const FString& /*Message*/, const FInsimulChatErrorScope& /*Scope*/);

class INSIMULEXPORT_API FInsimulErrorReporter
{
public:
    /** Install (or uninstall, by passing an unbound delegate) a Sentry-compatible handler. */
    static void SetHandler(const FInsimulChatErrorHandler& InHandler);

    /**
     * Capture a chat-path failure. Always logs via UE_LOG; when a handler is
     * installed it is invoked after logging so external reporters see every
     * event.
     */
    static void Capture(const FString& Message, const FInsimulChatErrorScope& Scope);

    /** Map an error message into a Sentry-compatible stage tag. */
    static FString ClassifyErrorStage(const FString& Message);

    /** User-facing friendly message for a given stage. */
    static FString DisplayMessageForStage(const FString& Stage);

private:
    static FInsimulChatErrorHandler Handler;
};
