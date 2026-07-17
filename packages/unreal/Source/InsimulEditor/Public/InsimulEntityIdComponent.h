// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulEntityIdComponent — the stable-identity stamp every actor the scene
// generator spawns carries (US-XG2). It mirrors the Unity `InsimulEntityId`
// MonoBehaviour: the EntityId is the IR entity's stable id (the re-import diff
// match key, US-XG4), plus the coarse Kind, the resolved Archetype, the binding
// tier that provided the asset, and the `bGenerated` flag that marks this actor
// as regenerable content (a hand-placed actor never carries one, so the
// conservative re-import leaves it untouched).
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The placement math
// that decides WHAT gets stamped is the pure host-tested core
// (Portable/InsimulScenePlacement.{h,cpp}).

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "InsimulEntityIdComponent.generated.h"

/**
 * Identity marker added to every generated actor. Read back by the re-import diff
 * (US-XG4) to match a freshly-computed placement node to the actor already in the
 * level, so hand-edits survive and only generated-tagged actors are refreshed.
 */
UCLASS(ClassGroup = (Insimul), meta = (BlueprintSpawnableComponent))
class INSIMULEDITOR_API UInsimulEntityIdComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UInsimulEntityIdComponent();

	/** Stable IR entity id — the re-import match key. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Insimul|Identity")
	FString EntityId;

	/** Coarse category: terrain_chunk | road | building | interior | prop | nav_region. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Insimul|Identity")
	FString Kind;

	/** Archetype key resolved through the binding table ("" for interiors / nav). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Insimul|Identity")
	FString Archetype;

	/** Which binding tier resolved the asset (for reporting / re-bind). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Insimul|Identity")
	FString BindingSource;

	/** True for pipeline-generated actors; the re-import only refreshes these. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Insimul|Identity")
	bool bGenerated = true;

	/** The actor tag the generator also applies, so a level filter / query can
	 *  find generated content without loading this component. */
	static const FName GeneratedTag;

	/** Copy identity fields off a placement node and apply the generated tag to
	 *  the owning actor. */
	void StampFrom(const FString& InEntityId, const FString& InKind,
			const FString& InArchetype, const FString& InBindingSource);
};
