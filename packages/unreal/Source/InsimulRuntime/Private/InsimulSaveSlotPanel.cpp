// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulSaveSlotPanel — thin UObject wrapper over FInsimulSaveSlotModel. All
// slot-rendering SEMANTICS (incl. the corrupted-envelope messaging contract) live
// in (and are host-tested by) the portable core; this file only marshals
// FString<->std::string and the USTRUCT boundary. Structurally syntax-gated
// (check.mjs).

#include "InsimulSaveSlotPanel.h"

#include "../Portable/InsimulSaveSlotModel.h"

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

	FInsimulSaveSlotView FromView(const insimul::FSlotView& V)
	{
		FInsimulSaveSlotView Out;
		Out.Index = V.Index;
		Out.Status = ToFString(V.Status);
		Out.Title = ToFString(V.Title);
		Out.Message = ToFString(V.Message);
		Out.bCanLoad = V.bCanLoad;
		Out.bCanSave = V.bCanSave;
		return Out;
	}
}

UInsimulSaveSlotPanel::UInsimulSaveSlotPanel()
{
}

insimul::FInsimulSaveSlotModel& UInsimulSaveSlotPanel::EnsureModel()
{
	if (!Model.IsValid())
	{
		Model = MakeUnique<insimul::FInsimulSaveSlotModel>();
	}
	return *Model;
}

void UInsimulSaveSlotPanel::SetSlots(const TArray<FInsimulSaveSlotResult>& Results)
{
	std::vector<insimul::FSlotResult> Portable;
	Portable.reserve(Results.Num());
	for (const FInsimulSaveSlotResult& R : Results)
	{
		insimul::FSlotResult P;
		P.Index = R.Index;
		P.Outcome = ToStd(R.Outcome);
		P.bHasSummary = R.bHasSummary;
		P.Summary.PlayerName = ToStd(R.Summary.PlayerName);
		P.Summary.bHasLevel = R.Summary.bHasLevel;
		P.Summary.Level = R.Summary.Level;
		P.Summary.LocationName = ToStd(R.Summary.LocationName);
		P.Summary.SavedAt = ToStd(R.Summary.SavedAt);
		Portable.push_back(P);
	}
	EnsureModel().SetSlots(Portable);
}

TArray<FInsimulSaveSlotView> UInsimulSaveSlotPanel::Slots() const
{
	TArray<FInsimulSaveSlotView> Out;
	if (Model.IsValid())
	{
		for (const insimul::FSlotView& V : Model->Slots())
		{
			Out.Add(FromView(V));
		}
	}
	return Out;
}

FInsimulSaveSlotView UInsimulSaveSlotPanel::Slot(int32 Index) const
{
	if (Model.IsValid())
	{
		return FromView(Model->Slot(Index));
	}
	return FInsimulSaveSlotView();
}

bool UInsimulSaveSlotPanel::HasAnyLoadable() const
{
	return Model.IsValid() && Model->HasAnyLoadable();
}

void UInsimulSaveSlotPanel::BeginDestroy()
{
	Model.Reset();
	Super::BeginDestroy();
}
