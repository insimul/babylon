// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulPlaceholderPackGenerator — editor-time generator for the bundled
// placeholder asset pack (US-XG3), the Unreal twin of Unity's
// PlaceholderPackGenerator.cs. It walks insimul::PlaceholderSpecs() (the pure,
// host-tested recipe in Portable/InsimulPlaceholderPack) and, for each spec,
// builds a primitive-based StaticMesh (box/capsule/cylinder/sphere/quad) with an
// archetype-labeled flat material, then wires it into a pre-wired
// UInsimulBindingTable (SourceKind = Placeholder). The result is a placeholder
// tier that makes ANY imported world instantiable out of the box — the same
// coverage guarantee the host coverage test (test_placeholder_pack.cpp) proves.
//
// Determinism: generation order + names + colors come entirely from
// PlaceholderSpecs() (ordinally sorted). Re-running overwrites in place, so the
// same specs produce the same pack.
//
// No binary blobs are committed: primitives are built procedurally from UE's
// primitive builders + a single shared material, generated under
// Content/Insimul/Placeholders/ at editor time (not checked in). The licensing
// note lives beside the pack (packages/unreal/data/placeholders/LICENSE.md — all
// original / CC0).
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The pure pack
// recipe + its coverage test carry the real assertions.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "InsimulPlaceholderPackGenerator.generated.h"

class UInsimulBindingTable;

/**
 * Generates the primitive placeholder meshes + the pre-wired placeholder
 * UInsimulBindingTable. Menu: Insimul ▸ Generate Placeholder Pack.
 */
UCLASS()
class INSIMULEDITOR_API UInsimulPlaceholderPackGenerator : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Build every placeholder mesh + the pre-wired table under
	 * Content/Insimul/Placeholders/. Returns the generated table asset, or nullptr
	 * on failure. Entry point behind the "Insimul ▸ Generate Placeholder Pack"
	 * editor action.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	static UInsimulBindingTable* Generate();
};
