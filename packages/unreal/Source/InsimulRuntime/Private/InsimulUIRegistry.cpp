// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulUIRegistry.h"

bool UInsimulUIRegistry::HasPanel(FName PanelKey) const
{
	for (const FInsimulPanelBinding& Binding : Panels)
	{
		if (Binding.PanelKey == PanelKey)
		{
			return true;
		}
	}
	return false;
}

TSubclassOf<UUserWidget> UInsimulUIRegistry::ResolvePanelClass(FName PanelKey) const
{
	// Last binding for the key wins — a creator override appended after the
	// generated defaults takes precedence (mirrors FInsimulUIRegistryModel).
	const FInsimulPanelBinding* Found = nullptr;
	for (const FInsimulPanelBinding& Binding : Panels)
	{
		if (Binding.PanelKey == PanelKey)
		{
			Found = &Binding;
		}
	}

	if (!Found)
	{
		UE_LOG(LogTemp, Warning, TEXT("[UI] No panel registered for key '%s'"), *PanelKey.ToString());
		return nullptr;
	}

	UClass* Loaded = Found->WidgetClass.LoadSynchronous();
	if (!Loaded)
	{
		UE_LOG(LogTemp, Warning, TEXT("[UI] Panel '%s' has no loadable widget class"), *PanelKey.ToString());
		return nullptr;
	}
	return Loaded;
}

void UInsimulUIRegistry::RegisterPanel(FName PanelKey, TSoftClassPtr<UUserWidget> WidgetClass)
{
	for (FInsimulPanelBinding& Binding : Panels)
	{
		if (Binding.PanelKey == PanelKey)
		{
			Binding.WidgetClass = WidgetClass;
			return;
		}
	}

	FInsimulPanelBinding NewBinding;
	NewBinding.PanelKey = PanelKey;
	NewBinding.WidgetClass = WidgetClass;
	Panels.Add(NewBinding);
}
