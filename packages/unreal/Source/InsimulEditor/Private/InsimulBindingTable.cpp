// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingTable.cpp — the thin UE adapter over the pure resolver core
// (US-XG1). Import/export delegate to Portable/InsimulBindingResolver so the
// portable pack format stays byte-identical across engines; matching/resolution
// is never re-implemented here.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The pure core it
// calls is what host-tests (tools/verify-unreal/run-binding-tests.sh).

#include "InsimulBindingTable.h"

#include "Portable/InsimulBindingResolver.h"
#include "Portable/InsimulJson.h"

#include <string>

namespace
{
	/** UE FString (UTF-16) -> portable std::string (UTF-8). */
	std::string ToStd(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}

	/** Portable std::string (UTF-8) -> UE FString. */
	FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}
}

FString FInsimulBindingEntry::SceneRef() const
{
	// Actor wins over Mesh (the "scene" ref in the portable pack). A soft ref's
	// path string is what round-trips; an unresolved import keeps the foreign
	// path verbatim until an artist re-binds it.
	if (!Actor.IsNull())
	{
		return Actor.ToSoftObjectPath().ToString();
	}
	return FString();
}

int32 UInsimulBindingTable::ResolutionPriority() const
{
	switch (SourceKind)
	{
	case EInsimulBindingSource::Project:     return 100;
	case EInsimulBindingSource::Pack:        return 50;
	case EInsimulBindingSource::Placeholder: return 0;
	default:                                 return 50;
	}
}

void UInsimulBindingTable::SortEntries()
{
	// Stable sort so equal-key entries keep their authored order. Diff-stable
	// serialization (the sorted-entries invariant shared with Unity/Godot).
	Entries.StableSort([](const FInsimulBindingEntry& A, const FInsimulBindingEntry& B)
	{
		return A.ArchetypeKey < B.ArchetypeKey;
	});
}

const FInsimulBindingEntry* UInsimulBindingTable::FindExact(const FString& Key) const
{
	for (const FInsimulBindingEntry& E : Entries)
	{
		if (E.ArchetypeKey == Key)
		{
			return &E;
		}
	}
	return nullptr;
}

bool UInsimulBindingTable::ImportPackJson(const FString& Json, FString& OutError)
{
	insimul::FJsonParseResult Parsed = insimul::ParseJson(ToStd(Json));
	if (!Parsed.bOk || !Parsed.Root)
	{
		OutError = ToFString(Parsed.Error.empty() ? std::string("invalid JSON") : Parsed.Error);
		return false;
	}

	insimul::FBindingSource Source;
	std::string Err;
	if (!insimul::ParseBindingSource(*Parsed.Root, Source, Err))
	{
		OutError = ToFString(Err);
		return false;
	}

	SourceName = ToFString(Source.Name);
	Entries.Reset();
	for (const insimul::FBindingEntry& E : Source.Entries)
	{
		FInsimulBindingEntry Entry;
		Entry.ArchetypeKey = ToFString(E.Key);
		// The asset-ref string is engine-specific: a foreign (Unity) path imports
		// as an unresolved soft ref, to be re-bound in this project. Keys and
		// fixups (carried through the portable core as raw JSON) are preserved.
		if (!E.Scene.empty())
		{
			Entry.Actor = TSoftObjectPtr<UObject>(FSoftObjectPath(ToFString(E.Scene)));
		}
		if (!E.Mesh.empty())
		{
			Entry.Mesh = TSoftObjectPtr<UStaticMesh>(FSoftObjectPath(ToFString(E.Mesh)));
		}
		Entries.Add(MoveTemp(Entry));
	}
	SortEntries();
	return true;
}

FString UInsimulBindingTable::ExportPackJson() const
{
	insimul::FBindingSource Source;
	Source.Name = ToStd(SourceName);
	Source.Priority = ResolutionPriority();
	for (const FInsimulBindingEntry& E : Entries)
	{
		if (E.ArchetypeKey.IsEmpty())
		{
			continue;
		}
		insimul::FBindingEntry Out;
		Out.Key = ToStd(E.ArchetypeKey);
		Out.Scene = ToStd(E.SceneRef());
		Out.Mesh = E.Mesh.IsNull() ? std::string() : ToStd(E.Mesh.ToSoftObjectPath().ToString());
		Source.Entries.push_back(MoveTemp(Out));
	}
	return ToFString(insimul::SerializePackSorted(Source));
}

#if WITH_EDITOR
void UInsimulBindingTable::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
	Super::PostEditChangeProperty(PropertyChangedEvent);
	// Keep the serialized asset diff-stable: default identity scale + sorted keys.
	for (FInsimulBindingEntry& E : Entries)
	{
		if (E.Scale.IsNearlyZero())
		{
			E.Scale = FVector::OneVector;
		}
	}
	SortEntries();
}
#endif
