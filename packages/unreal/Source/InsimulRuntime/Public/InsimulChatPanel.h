// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulChatPanel — the UE seam over the portable dialogue view-model
// (Portable/InsimulChatModel.h, US-XU4). The UObject the streaming conversation
// panel (InsimulChatPanel UUserWidget) binds to: the streaming SDK drives
// BeginUserTurn / AppendChunk / TriggerAction / CompleteTurn / FailTurn, the panel
// renders MessageList / StreamingText, feeds TTS + the InsimulFaceSync lip-sync
// hook from LastNpcText() on completion, applies each TriggeredActions() entry to
// the KB, and persists History() into save.conversations.
//
// All turn SEMANTICS (reject-while-streaming, error bubbles drop from history, the
// full-text override, the history projection) live in the portable core and are
// host-tested by run-dialogue-ui-tests.sh. This class is the thin, syntax-gated
// Blueprint / UObject boundary (pimpl — the std-based model never appears in the
// reflected layout).

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "InsimulChatPanel.generated.h"

// The engine-agnostic model this seam wraps (pimpl). Host-tested by
// run-dialogue-ui-tests.sh.
namespace insimul { class FInsimulChatModel; }

/** One rendered chat bubble as the panel draws it. */
USTRUCT(BlueprintType)
struct FInsimulChatMessage
{
	GENERATED_BODY()

	/** "player" | "npc". */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	FString Role;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	FString Text;

	/** True for the live in-flight NPC bubble (renders a typing indicator). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	bool bStreaming = false;

	/** True for an error bubble (renders in the error style; excluded from history). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	bool bError = false;
};

/** An action the stream triggered — the panel applies FactToAssert to the KB. */
USTRUCT(BlueprintType)
struct FInsimulChatAction
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	FString Name;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	TArray<FString> Args;

	/** The Prolog fact the panel asserts into the live KB (e.g. has_item(player,sword)). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Chat")
	FString FactToAssert;
};

/** Fired on every transcript mutation so the panel re-renders without polling. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnChatChanged);

/**
 * The default-runtime dialogue view-model. The conversation panel binds the turn
 * lifecycle below and re-renders from OnChatChanged; all state lives in the
 * portable core (pimpl) that host-tests UE-free.
 */
UCLASS(BlueprintType)
class INSIMULRUNTIME_API UInsimulChatPanel : public UObject
{
	GENERATED_BODY()

public:
	UInsimulChatPanel();

	/** Bind the panel to a character (id + display name). Resets any prior turn. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	void SetCharacter(const FString& CharacterId, const FString& CharacterName);

	/** Seed the NPC's opening line (context greeting) — not a streamed turn. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	void Greeting(const FString& Text);

	/** Open a turn with the player's line. Rejected while a turn is streaming. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	bool BeginUserTurn(const FString& Text);

	/** Append a streamed response chunk to the in-flight NPC bubble. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	void AppendChunk(const FString& Text);

	/** Record an action the stream triggered (the panel then asserts it to the KB). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	void TriggerAction(const FString& ActionName, const TArray<FString>& Args, const FString& FactToAssert);

	/** Close the in-flight turn (a done event). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	bool CompleteTurn();

	/** Close the in-flight turn with an authoritative full text (overrides chunks). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	bool CompleteTurnWithText(const FString& FullText);

	/** Fail the in-flight turn — renders an error bubble, drops it from history. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Chat")
	bool FailTurn(const FString& Error);

	UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
	bool IsStreaming() const;

	/** The whole transcript (incl. any in-flight / errored bubble), oldest first. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
	TArray<FInsimulChatMessage> Messages() const;

	/** Actions triggered so far (the panel diffs this to feed the KB). */
	UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
	TArray<FInsimulChatAction> TriggeredActions() const;

	/** The in-flight bubble text (live-render source). */
	UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
	FString StreamingText() const;

	/** The last settled NPC line — the TTS / InsimulFaceSync lip-sync source. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
	FString LastNpcText() const;

	UFUNCTION(BlueprintPure, Category = "Insimul|Chat")
	int32 CompletedTurnCount() const;

	/** No-poll re-render signal (broadcast on every mutation). */
	UPROPERTY(BlueprintAssignable, Category = "Insimul|Chat")
	FOnChatChanged OnChatChanged;

	virtual void BeginDestroy() override;

private:
	/** The host-tested portable model (pimpl — never in the reflected layout). */
	TUniquePtr<insimul::FInsimulChatModel> Model;

	insimul::FInsimulChatModel& EnsureModel();
};
