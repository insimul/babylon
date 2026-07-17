// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEntityIdComponent.cpp — the generated-actor identity stamp (US-XG2).
// UNREAL-COUPLED — syntax-gated only.

#include "InsimulEntityIdComponent.h"

#include "GameFramework/Actor.h"

const FName UInsimulEntityIdComponent::GeneratedTag = FName(TEXT("Insimul.Generated"));

UInsimulEntityIdComponent::UInsimulEntityIdComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UInsimulEntityIdComponent::StampFrom(const FString& InEntityId, const FString& InKind,
		const FString& InArchetype, const FString& InBindingSource)
{
	EntityId = InEntityId;
	Kind = InKind;
	Archetype = InArchetype;
	BindingSource = InBindingSource;
	bGenerated = true;

	if (AActor* Owner = GetOwner())
	{
		Owner->Tags.AddUnique(GeneratedTag);
		// Also tag with the entity id so an actor iterator can match by id without
		// resolving this component (the re-import diff fast path).
		if (!InEntityId.IsEmpty())
		{
			Owner->Tags.AddUnique(FName(*InEntityId));
		}
	}
}
