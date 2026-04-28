// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "Modules/ModuleManager.h"

class FInsimulRuntimeModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
