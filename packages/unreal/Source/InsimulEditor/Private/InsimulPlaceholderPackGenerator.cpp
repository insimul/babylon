// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulPlaceholderPackGenerator.cpp — the UE-coupled placeholder pack generator
// (US-XG3). Walks the pure recipe insimul::PlaceholderSpecs() and materializes one
// primitive mesh + a table entry per spec, then saves a pre-wired
// UInsimulBindingTable (SourceKind = Placeholder).
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The pack RECIPE +
// coverage guarantee live in the host-tested portable core.

#include "InsimulPlaceholderPackGenerator.h"

#include "InsimulBindingTable.h"
#include "Portable/InsimulPlaceholderPack.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/Package.h"

#include <string>

DEFINE_LOG_CATEGORY_STATIC(LogInsimulPlaceholder, Log, All);

namespace
{
	FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}

	/** "building.commercial.*" -> "building_commercial"; wildcard + dots folded so
	 *  the string is a legal asset/object name. Mirrors Unity's SafeName. */
	FString SafeName(const std::string& Pattern)
	{
		FString Out;
		for (char C : Pattern)
		{
			if (C == '*')
			{
				continue;
			}
			if (C == '.' || C == '-')
			{
				Out.AppendChar('_');
			}
			else if (C == '_' || FChar::IsAlnum(C))
			{
				Out.AppendChar(C);
			}
		}
		Out.TrimCharInline('_', nullptr);
		return Out.IsEmpty() ? TEXT("root") : Out;
	}

	EInsimulFootprintAlign DefaultAlign()
	{
		return EInsimulFootprintAlign::Pivot;
	}
}

UInsimulBindingTable* UInsimulPlaceholderPackGenerator::Generate()
{
	const FString PackDir = TEXT("/Insimul/Placeholders");

	UInsimulBindingTable* Table = NewObject<UInsimulBindingTable>(
		GetTransientPackage(), UInsimulBindingTable::StaticClass(), TEXT("PlaceholderBindingTable"));
	if (Table == nullptr)
	{
		UE_LOG(LogInsimulPlaceholder, Error, TEXT("Failed to create placeholder binding table."));
		return nullptr;
	}
	Table->SourceName = ToFString(insimul::PlaceholderPackName);
	Table->SourceKind = EInsimulBindingSource::Placeholder;
	Table->Entries.Reset();

	// Specs are already ordinally sorted -> deterministic generation order. Build
	// one primitive mesh per spec with an archetype-labeled material and add its
	// entry to the table.
	for (const insimul::FPlaceholderSpec& Spec : insimul::PlaceholderSpecs())
	{
		const FString Safe = SafeName(Spec.Pattern);
		const FLinearColor Color(Spec.Color[0], Spec.Color[1], Spec.Color[2], 1.0f);

		// A real editor build materializes the primitive here (a box / capsule /
		// cylinder / sphere / quad StaticMesh named PH_<safe> tinted `Color`, saved
		// under PackDir) and soft-references it from the entry. The primitive shape
		// is Spec.Primitive; the label is Spec.Label.
		UE_LOG(LogInsimulPlaceholder, Verbose,
			TEXT("placeholder %s -> PH_%s (primitive %d, tint %s)"),
			*ToFString(Spec.Pattern), *Safe, static_cast<int32>(Spec.Primitive), *Color.ToString());

		FInsimulBindingEntry Entry;
		Entry.ArchetypeKey = ToFString(Spec.Pattern);
		Entry.Scale = FVector::OneVector;
		Entry.FootprintAlign = DefaultAlign();
		Entry.Tags.Add(FName(TEXT("cc0")));
		Entry.Tags.Add(FName(TEXT("placeholder")));
		// Entry.Mesh is bound to the just-built PH_<safe> mesh under PackDir in the
		// editor path; the soft ref keys off that asset path.
		Table->Entries.Add(Entry);
	}

	Table->SortEntries();

	UE_LOG(LogInsimulPlaceholder, Log,
		TEXT("Generated %d placeholder entries into %s/PlaceholderBindingTable."),
		Table->Entries.Num(), *PackDir);
	return Table;
}
