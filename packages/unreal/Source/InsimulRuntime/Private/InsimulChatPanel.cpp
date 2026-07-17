// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulChatPanel — thin UObject wrapper over FInsimulChatModel. All turn
// SEMANTICS live in (and are host-tested by) the portable core; this file only
// marshals FString<->std::string and FInsimulChatMessage/FInsimulChatAction
// USTRUCTs, broadcasts OnChatChanged after each mutation (the no-poll UMG seam),
// and is structurally syntax-gated (check.mjs).

#include "InsimulChatPanel.h"

#include "../Portable/InsimulChatModel.h"

namespace
{
	FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}

	std::string ToStd(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}
}

UInsimulChatPanel::UInsimulChatPanel()
{
}

insimul::FInsimulChatModel& UInsimulChatPanel::EnsureModel()
{
	if (!Model.IsValid())
	{
		Model = MakeUnique<insimul::FInsimulChatModel>();
	}
	return *Model;
}

void UInsimulChatPanel::SetCharacter(const FString& CharacterId, const FString& CharacterName)
{
	Model = MakeUnique<insimul::FInsimulChatModel>(ToStd(CharacterId), ToStd(CharacterName));
	OnChatChanged.Broadcast();
}

void UInsimulChatPanel::Greeting(const FString& Text)
{
	EnsureModel().Greeting(ToStd(Text));
	OnChatChanged.Broadcast();
}

bool UInsimulChatPanel::BeginUserTurn(const FString& Text)
{
	const bool bOk = EnsureModel().BeginUserTurn(ToStd(Text));
	if (bOk)
	{
		OnChatChanged.Broadcast();
	}
	return bOk;
}

void UInsimulChatPanel::AppendChunk(const FString& Text)
{
	EnsureModel().AppendChunk(ToStd(Text));
	OnChatChanged.Broadcast();
}

void UInsimulChatPanel::TriggerAction(const FString& ActionName, const TArray<FString>& Args, const FString& FactToAssert)
{
	insimul::FChatAction A;
	A.Name = ToStd(ActionName);
	for (const FString& Arg : Args)
	{
		A.Args.push_back(ToStd(Arg));
	}
	A.FactToAssert = ToStd(FactToAssert);
	EnsureModel().TriggerAction(A);
	OnChatChanged.Broadcast();
}

bool UInsimulChatPanel::CompleteTurn()
{
	const bool bOk = EnsureModel().CompleteTurn();
	if (bOk)
	{
		OnChatChanged.Broadcast();
	}
	return bOk;
}

bool UInsimulChatPanel::CompleteTurnWithText(const FString& FullText)
{
	const bool bOk = EnsureModel().CompleteTurn(ToStd(FullText));
	if (bOk)
	{
		OnChatChanged.Broadcast();
	}
	return bOk;
}

bool UInsimulChatPanel::FailTurn(const FString& Error)
{
	const bool bOk = EnsureModel().FailTurn(ToStd(Error));
	if (bOk)
	{
		OnChatChanged.Broadcast();
	}
	return bOk;
}

bool UInsimulChatPanel::IsStreaming() const
{
	return Model.IsValid() && Model->IsStreaming();
}

TArray<FInsimulChatMessage> UInsimulChatPanel::Messages() const
{
	TArray<FInsimulChatMessage> Out;
	if (Model.IsValid())
	{
		for (const insimul::FChatMessage& M : Model->MessageList())
		{
			FInsimulChatMessage Row;
			Row.Role = ToFString(M.Role);
			Row.Text = ToFString(M.Text);
			Row.bStreaming = M.bStreaming;
			Row.bError = M.bError;
			Out.Add(Row);
		}
	}
	return Out;
}

TArray<FInsimulChatAction> UInsimulChatPanel::TriggeredActions() const
{
	TArray<FInsimulChatAction> Out;
	if (Model.IsValid())
	{
		for (const insimul::FChatAction& A : Model->ActionList())
		{
			FInsimulChatAction Row;
			Row.Name = ToFString(A.Name);
			for (const std::string& Arg : A.Args)
			{
				Row.Args.Add(ToFString(Arg));
			}
			Row.FactToAssert = ToFString(A.FactToAssert);
			Out.Add(Row);
		}
	}
	return Out;
}

FString UInsimulChatPanel::StreamingText() const
{
	return Model.IsValid() ? ToFString(Model->StreamingText()) : FString();
}

FString UInsimulChatPanel::LastNpcText() const
{
	return Model.IsValid() ? ToFString(Model->LastNpcText()) : FString();
}

int32 UInsimulChatPanel::CompletedTurnCount() const
{
	return Model.IsValid() ? static_cast<int32>(Model->CompletedTurnCount()) : 0;
}

void UInsimulChatPanel::BeginDestroy()
{
	Model.Reset();
	Super::BeginDestroy();
}
