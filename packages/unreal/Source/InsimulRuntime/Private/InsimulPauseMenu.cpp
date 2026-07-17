// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulPauseMenu — thin UObject wrapper over FInsimulPauseMenuModel. All gating
// + reducer SEMANTICS live in (and are host-tested by) the portable core; this
// file only marshals FString<->std::string and broadcasts OnPauseMenuChanged after
// each state change (the no-poll UMG seam). Structurally syntax-gated (check.mjs).

#include "InsimulPauseMenu.h"

#include "../Portable/InsimulPauseMenuModel.h"

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

UInsimulPauseMenu::UInsimulPauseMenu()
{
}

insimul::FInsimulPauseMenuModel& UInsimulPauseMenu::EnsureModel()
{
	if (!Model.IsValid())
	{
		Model = MakeUnique<insimul::FInsimulPauseMenuModel>();
	}
	return *Model;
}

void UInsimulPauseMenu::Configure(const TArray<FString>& EnabledModules)
{
	std::vector<std::string> Modules;
	Modules.reserve(EnabledModules.Num());
	for (const FString& M : EnabledModules)
	{
		Modules.push_back(ToStd(M));
	}
	Model = MakeUnique<insimul::FInsimulPauseMenuModel>(Modules);
	OnPauseMenuChanged.Broadcast();
}

TArray<FInsimulPauseTab> UInsimulPauseMenu::VisibleTabs() const
{
	TArray<FInsimulPauseTab> Out;
	if (Model.IsValid())
	{
		for (const insimul::FPauseTab& T : Model->VisibleTabs())
		{
			FInsimulPauseTab Row;
			Row.Key = ToFString(T.Key);
			Row.Label = ToFString(T.Label);
			Out.Add(Row);
		}
	}
	return Out;
}

TArray<FString> UInsimulPauseMenu::VisibleKeys() const
{
	TArray<FString> Out;
	if (Model.IsValid())
	{
		for (const std::string& K : Model->VisibleKeys())
		{
			Out.Add(ToFString(K));
		}
	}
	return Out;
}

bool UInsimulPauseMenu::IsTabVisible(const FString& Key) const
{
	return Model.IsValid() && Model->IsVisible(ToStd(Key));
}

void UInsimulPauseMenu::Open(const FString& Tab)
{
	EnsureModel().OpenMenu(ToStd(Tab));
	OnPauseMenuChanged.Broadcast();
}

void UInsimulPauseMenu::Close()
{
	EnsureModel().CloseMenu();
	OnPauseMenuChanged.Broadcast();
}

void UInsimulPauseMenu::Toggle()
{
	EnsureModel().Toggle();
	OnPauseMenuChanged.Broadcast();
}

bool UInsimulPauseMenu::IsOpen() const
{
	return Model.IsValid() && Model->IsOpen();
}

bool UInsimulPauseMenu::SetActive(const FString& Key)
{
	const bool bOk = EnsureModel().SetActive(ToStd(Key));
	if (bOk)
	{
		OnPauseMenuChanged.Broadcast();
	}
	return bOk;
}

FString UInsimulPauseMenu::ActiveTab() const
{
	return Model.IsValid() ? ToFString(Model->ActiveTab()) : FString();
}

void UInsimulPauseMenu::BeginDestroy()
{
	Model.Reset();
	Super::BeginDestroy();
}
