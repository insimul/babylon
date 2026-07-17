// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "Modules/ModuleManager.h"

/**
 * Insimul editor module — the editor-time scene-generation + Asset Binding
 * Layer pipeline (US-XG1..4). Type: Editor (declared in Insimul.uplugin); its
 * code is stripped from cooked/shipping builds.
 */
class FInsimulEditorModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
