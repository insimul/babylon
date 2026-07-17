// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulTradePanel — thin UObject wrapper over FInsimulTradeModel. All trade
// logic lives in (and is host-tested by) the portable core; this file only marshals
// FString<->std::string and FTradeItem<->std::vector, and is structurally
// syntax-gated (check.mjs). State is the attached FTradeState the save shell
// hydrates from currentState — the model keeps no store of its own.

#include "InsimulTradePanel.h"

#include "../Portable/InsimulTradeModel.h"

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

	FInsimulTradeItem FromPortable(const insimul::FTradeItem& I)
	{
		FInsimulTradeItem Out;
		Out.ItemId = ToFString(I.ItemId);
		Out.Quantity = static_cast<int32>(I.Quantity);
		Out.Value = static_cast<int32>(I.Value);
		return Out;
	}

	TArray<FInsimulTradeItem> ToArray(const std::vector<insimul::FTradeItem>& Items)
	{
		TArray<FInsimulTradeItem> Out;
		Out.Reserve(static_cast<int32>(Items.size()));
		for (const insimul::FTradeItem& I : Items)
		{
			Out.Add(FromPortable(I));
		}
		return Out;
	}

	FInsimulTradeResult FromResult(const insimul::FTradeResult& R)
	{
		FInsimulTradeResult Out;
		Out.bOk = R.bOk;
		Out.Reason = ToFString(R.Reason);
		Out.Moved = static_cast<int32>(R.Moved);
		return Out;
	}
}

UInsimulTradePanel::UInsimulTradePanel()
{
}

insimul::FInsimulTradeModel& UInsimulTradePanel::EnsureModel()
{
	if (!State.IsValid())
	{
		// In a live game the save shell hydrates this from save.currentState
		// (player.gold/inventory, containers.containers, npcs.merchantStates); here it
		// starts empty so a Blueprint call before hydration is always safe.
		State = MakeUnique<insimul::FTradeState>();
	}
	if (!Model.IsValid())
	{
		Model = MakeUnique<insimul::FInsimulTradeModel>(State.Get());
	}
	return *Model;
}

int32 UInsimulTradePanel::PlayerGold() const
{
	return Model.IsValid() ? static_cast<int32>(Model->PlayerGold()) : 0;
}

TArray<FInsimulTradeItem> UInsimulTradePanel::PlayerItems() const
{
	return Model.IsValid() ? ToArray(Model->PlayerItems()) : TArray<FInsimulTradeItem>();
}

TArray<FInsimulTradeItem> UInsimulTradePanel::ContainerItems(const FString& ContainerId) const
{
	return Model.IsValid() ? ToArray(Model->ContainerItems(ToStd(ContainerId))) : TArray<FInsimulTradeItem>();
}

TArray<FInsimulTradeItem> UInsimulTradePanel::MerchantItems(const FString& MerchantId) const
{
	return Model.IsValid() ? ToArray(Model->MerchantItems(ToStd(MerchantId))) : TArray<FInsimulTradeItem>();
}

int32 UInsimulTradePanel::MerchantGold(const FString& MerchantId) const
{
	return Model.IsValid() ? static_cast<int32>(Model->MerchantGold(ToStd(MerchantId))) : 0;
}

FInsimulTradeResult UInsimulTradePanel::TakeFromContainer(const FString& ContainerId, const FString& ItemId, int32 Qty)
{
	return FromResult(EnsureModel().TakeFromContainer(ToStd(ContainerId), ToStd(ItemId), Qty));
}

FInsimulTradeResult UInsimulTradePanel::TakeAllFromContainer(const FString& ContainerId)
{
	return FromResult(EnsureModel().TakeAllFromContainer(ToStd(ContainerId)));
}

FInsimulTradeResult UInsimulTradePanel::Buy(const FString& MerchantId, const FString& ItemId, int32 Qty)
{
	return FromResult(EnsureModel().Buy(ToStd(MerchantId), ToStd(ItemId), Qty));
}

FInsimulTradeResult UInsimulTradePanel::Sell(const FString& MerchantId, const FString& ItemId, int32 Qty)
{
	return FromResult(EnsureModel().Sell(ToStd(MerchantId), ToStd(ItemId), Qty));
}

void UInsimulTradePanel::BeginDestroy()
{
	Model.Reset();
	State.Reset();
	Super::BeginDestroy();
}
