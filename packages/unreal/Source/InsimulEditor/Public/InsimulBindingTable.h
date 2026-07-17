// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingTable — the Unreal UDataAsset that authors an archetype-key ->
// asset binding (US-XG1). It is the editor-facing THIN adapter over the pure,
// UE-free resolver core (Portable/InsimulBindingResolver.{h,cpp}, host-tested):
// all matching / specificity / fallback-chain logic lives there; this type only
// holds soft asset references + transform fixups + sockets and projects itself
// into an insimul::FBindingSource the resolver consumes.
//
// The matching semantics here MUST stay identical to that core; the shared
// resolver matrix (Tests/fixtures/resolver-matrix.json — byte-identical to the
// Unity/Godot legs) pins BOTH so they can never diverge.
//
// Serialization is kept diff-friendly: entries are sorted by archetype key on
// PostEditChange, so the saved .uasset / exported portable pack JSON has a
// stable order (the cross-engine round-trip contract shared with Unity/Godot).
//
// UNREAL-COUPLED, so it is verified by the structural syntax gate only
// (tools/verify-unreal/check.mjs / `npm run engines:check`). The pure resolver
// core underneath is the part that host-tests on a bare box.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "UObject/SoftObjectPtr.h"
#include "InsimulBindingTable.generated.h"

/** Where a binding table sits in the resolution order. Lower value (higher
 *  priority) is consulted first: Project -> Pack -> Placeholder. */
UENUM(BlueprintType)
enum class EInsimulBindingSource : uint8
{
	Project     UMETA(DisplayName = "Project"),
	Pack        UMETA(DisplayName = "Pack"),
	Placeholder UMETA(DisplayName = "Placeholder"),
};

/** How a bound asset is aligned onto its lot footprint (US-XG2 consumes this;
 *  authored here so a table fully describes its placement fixups). */
UENUM(BlueprintType)
enum class EInsimulFootprintAlign : uint8
{
	/** Use the asset's own pivot as-is. */
	Pivot     UMETA(DisplayName = "Pivot"),
	/** Center the mesh bounds on the lot center. */
	Center    UMETA(DisplayName = "Center"),
	/** Align the mesh min-corner to the footprint origin. */
	MinCorner UMETA(DisplayName = "Min Corner"),
};

/** Named attach point on a bound asset (door, chimney, sign, …). */
USTRUCT(BlueprintType)
struct FInsimulBindingSocket
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FName Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FVector LocalPosition = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FRotator LocalRotation = FRotator::ZeroRotator;
};

/** One archetype-key -> asset mapping plus its transform fixups. The asset is a
 *  soft reference so a table never force-loads every bound asset; the resolver
 *  keys on the archetype pattern, the generator loads the picked entry. */
USTRUCT(BlueprintType)
struct FInsimulBindingEntry
{
	GENERATED_BODY()

	/** Archetype key pattern, e.g. `building.commercial.bakery` or `building.*`.
	 *  Exact | descendant | `prefix.*` | `*` (match-all). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FString ArchetypeKey;

	/** Actor class / Blueprint to spawn for this archetype (the "scene" ref in
	 *  the portable pack). Mutually usable with Mesh; Actor wins when both set. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding",
		meta = (AllowedClasses = "/Script/Engine.Blueprint,/Script/Engine.Actor"))
	TSoftObjectPtr<UObject> Actor;

	/** Optional StaticMesh to place directly (alternative to Actor). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	TSoftObjectPtr<UStaticMesh> Mesh;

	/** Local pivot offset applied on spawn. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FVector PivotOffset = FVector::ZeroVector;

	/** Uniform/per-axis scale applied on spawn (defaults to identity). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FVector Scale = FVector::OneVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	EInsimulFootprintAlign FootprintAlign = EInsimulFootprintAlign::Pivot;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	TArray<FInsimulBindingSocket> Sockets;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	TArray<FName> Tags;

	/** True when this entry names a placeable asset (Actor or Mesh). An empty
	 *  entry is a deliberate gap that still needs art. */
	bool HasAsset() const { return !Actor.IsNull() || !Mesh.IsNull(); }

	/** The portable-pack "scene" string for this entry (asset path or empty). */
	FString SceneRef() const;
};

/**
 * An archetype-key -> asset binding table. Create via
 * Content Browser ▸ Miscellaneous ▸ Data Asset ▸ Insimul Binding Table.
 * Multiple tables layer by SourceKind (Project > Pack > Placeholder); the pure
 * insimul::FBindingResolver consults them in that order.
 */
UCLASS(BlueprintType)
class INSIMULEDITOR_API UInsimulBindingTable : public UDataAsset
{
	GENERATED_BODY()

public:
	/** Human-facing tier name used in the portable pack + resolver reporting. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	FString SourceName;

	/** Where this table sits in the resolution order (Project > Pack > Placeholder). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	EInsimulBindingSource SourceKind = EInsimulBindingSource::Project;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	TArray<FInsimulBindingEntry> Entries;

	/** Resolution priority for the fallback chain: Project=100, Pack=50,
	 *  Placeholder=0. Mirrors the shared resolver matrix's tier priorities. */
	int32 ResolutionPriority() const;

	/** Sort entries ascending by archetype key (stable) so the serialized asset
	 *  and any exported pack are diff-stable / byte-deterministic. */
	void SortEntries();

	/** Find the entry whose key exactly equals `Key`, or nullptr. */
	const FInsimulBindingEntry* FindExact(const FString& Key) const;

	/**
	 * Import a portable binding pack JSON (the `insimul-binding-pack` interchange
	 * format shared with Unity/Godot) into this table, replacing Entries. Keys
	 * and transform/socket fixups are preserved; only the asset-ref STRING is
	 * engine-specific (a Unity `Assets/…` path imports as an unresolved soft ref
	 * to be re-bound). Returns false + OutError on malformed JSON.
	 */
	bool ImportPackJson(const FString& Json, FString& OutError);

	/**
	 * Export this table to the portable binding pack JSON (sorted, canonical) so
	 * a Godot/Unity leg can round-trip it byte-identically.
	 */
	FString ExportPackJson() const;

#if WITH_EDITOR
	virtual void PostEditChangeProperty(struct FPropertyChangedEvent& PropertyChangedEvent) override;
#endif
};
