// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "InsimulInteractionInterface.generated.h"

UINTERFACE(MinimalAPI, Blueprintable)
class UInsimulInteractorInterface : public UInterface
{
	GENERATED_BODY()
};

/**
 * Interface for objects that can interact with Insimul NPCs.
 * Implement this on your player pawn or controller to enable NPC interaction.
 */
class INSIMULRUNTIME_API IInsimulInteractorInterface
{
	GENERATED_BODY()

public:
	/** Get the pawn that is interacting */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Insimul")
	APawn* GetInteractingPawn();
};
