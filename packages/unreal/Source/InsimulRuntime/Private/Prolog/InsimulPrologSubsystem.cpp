// Copyright 2024 Insimul. All Rights Reserved.
//
// Implementation of UInsimulPrologSubsystem — the thin UE marshalling layer over
// insimul::InsimulKB. Nothing here does Prolog logic; it converts strings/
// UStructs and enforces game-thread affinity, delegating everything else to the
// core wrapper (Private/Prolog/InsimulKB.h).

#include "InsimulPrologSubsystem.h"
#include "InsimulKB.h"

DEFINE_LOG_CATEGORY_STATIC(LogInsimulProlog, Log, All);

namespace
{
	// std::string <-> FString marshalling. libinsimul emits/consumes UTF-8.
	FString ToFString(const std::string& S)
	{
		return FString(UTF8_TO_TCHAR(S.c_str()));
	}

	std::string ToStdString(const FString& S)
	{
		return std::string(TCHAR_TO_UTF8(*S));
	}

	EInsimulPrologValueType MapType(insimul::PrologValueType T)
	{
		switch (T)
		{
		case insimul::PrologValueType::Atom:     return EInsimulPrologValueType::Atom;
		case insimul::PrologValueType::Int:      return EInsimulPrologValueType::Int;
		case insimul::PrologValueType::Float:    return EInsimulPrologValueType::Float;
		case insimul::PrologValueType::List:     return EInsimulPrologValueType::List;
		case insimul::PrologValueType::Compound: return EInsimulPrologValueType::Compound;
		case insimul::PrologValueType::Null:
		default:                                 return EInsimulPrologValueType::Null;
		}
	}

	// Flatten one core PrologValue into the Blueprint-facing UStruct. Scalars
	// carry their payload; lists/compounds expose their rendered elements/args in
	// Elements while DisplayString holds the whole canonical rendering.
	FInsimulPrologValue MakeValue(const insimul::PrologValue& V)
	{
		FInsimulPrologValue Out;
		Out.Type = MapType(V.Type);
		Out.Text = ToFString(V.Text);
		Out.IntValue = static_cast<int64>(V.Int);
		Out.FloatValue = V.Float;
		Out.DisplayString = ToFString(V.ToDisplayString());
		for (const insimul::PrologValue& Elem : V.Elements)
		{
			Out.Elements.Add(ToFString(Elem.ToDisplayString()));
		}
		return Out;
	}

	FInsimulPrologBinding MakeBinding(const insimul::PrologBinding& B)
	{
		FInsimulPrologBinding Out;
		Out.Vars.Reserve(static_cast<int32>(B.Vars.size()));
		for (const auto& Pair : B.Vars)
		{
			FInsimulPrologVar Var;
			Var.Name = ToFString(Pair.first);
			Var.Value = MakeValue(Pair.second);
			Out.Vars.Add(MoveTemp(Var));
		}
		return Out;
	}
}

UInsimulPrologSubsystem::UInsimulPrologSubsystem() = default;

// Defined here (not defaulted in the header) so ~TUniquePtr<insimul::InsimulKB>
// instantiates against the now-complete type from InsimulKB.h.
UInsimulPrologSubsystem::~UInsimulPrologSubsystem() = default;

void UInsimulPrologSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	KB = MakeUnique<insimul::InsimulKB>();
	if (!KB.IsValid() || !KB->IsValid())
	{
		UE_LOG(LogInsimulProlog, Error, TEXT("Prolog KB failed to initialize: %s"),
			KB.IsValid() ? *ToFString(KB->LastError()) : TEXT("allocation failed"));
		KB.Reset();
		return;
	}

	UE_LOG(LogInsimulProlog, Log, TEXT("InsimulPrologSubsystem initialized (%s)"),
		*GetPrologVersion());
}

void UInsimulPrologSubsystem::Deinitialize()
{
	// Releasing the KB on the game thread (Deinitialize is game-thread) tears
	// down the libinsimul session cleanly.
	KB.Reset();

	Super::Deinitialize();
}

bool UInsimulPrologSubsystem::EnsureGameThread(const TCHAR* Op) const
{
	if (!IsInGameThread())
	{
		UE_LOG(LogInsimulProlog, Error,
			TEXT("%s called off the game thread — Prolog KB is single-thread-owned; ignoring."),
			Op);
		return false;
	}
	return true;
}

bool UInsimulPrologSubsystem::IsPrologReady() const
{
	return KB.IsValid() && KB->IsValid();
}

bool UInsimulPrologSubsystem::ConsultWorldData(const FString& PrologSource)
{
	if (!EnsureGameThread(TEXT("ConsultWorldData")) || !IsPrologReady())
	{
		return false;
	}
	return KB->Consult(ToStdString(PrologSource));
}

bool UInsimulPrologSubsystem::AssertFact(const FString& Fact)
{
	if (!EnsureGameThread(TEXT("AssertFact")) || !IsPrologReady())
	{
		return false;
	}
	return KB->Assert(ToStdString(Fact));
}

bool UInsimulPrologSubsystem::RetractFact(const FString& Fact)
{
	if (!EnsureGameThread(TEXT("RetractFact")) || !IsPrologReady())
	{
		return false;
	}
	return KB->Retract(ToStdString(Fact)) == insimul::InsimulKB::RetractResult::Removed;
}

bool UInsimulPrologSubsystem::QueryFirst(const FString& Goal, FInsimulPrologBinding& OutBinding)
{
	OutBinding = FInsimulPrologBinding();
	if (!EnsureGameThread(TEXT("QueryFirst")) || !IsPrologReady())
	{
		return false;
	}

	insimul::PrologBinding Binding;
	if (!KB->QueryFirst(ToStdString(Goal), Binding))
	{
		return false;
	}
	OutBinding = MakeBinding(Binding);
	return true;
}

bool UInsimulPrologSubsystem::QueryAll(const FString& Goal, TArray<FInsimulPrologBinding>& OutSolutions)
{
	OutSolutions.Reset();
	if (!EnsureGameThread(TEXT("QueryAll")) || !IsPrologReady())
	{
		return false;
	}

	std::vector<insimul::PrologBinding> Solutions;
	if (!KB->QueryAll(ToStdString(Goal), Solutions))
	{
		return false;
	}
	OutSolutions.Reserve(static_cast<int32>(Solutions.size()));
	for (const insimul::PrologBinding& B : Solutions)
	{
		OutSolutions.Add(MakeBinding(B));
	}
	return true;
}

FString UInsimulPrologSubsystem::SnapshotToString()
{
	if (!EnsureGameThread(TEXT("SnapshotToString")) || !IsPrologReady())
	{
		return FString();
	}

	std::string Image;
	if (!KB->Snapshot(Image))
	{
		return FString();
	}
	return ToFString(Image);
}

bool UInsimulPrologSubsystem::RestoreFromString(const FString& Image)
{
	if (!EnsureGameThread(TEXT("RestoreFromString")) || !IsPrologReady())
	{
		return false;
	}
	return KB->Restore(ToStdString(Image));
}

FString UInsimulPrologSubsystem::GetLastError() const
{
	if (!IsPrologReady())
	{
		return TEXT("Prolog KB is not ready");
	}
	return ToFString(KB->LastError());
}

FString UInsimulPrologSubsystem::GetPrologVersion()
{
	return ToFString(insimul::InsimulKB::Version());
}

bool UInsimulPrologSubsystem::GetBoundValue(const FInsimulPrologBinding& Binding, const FString& VarName, FInsimulPrologValue& OutValue)
{
	for (const FInsimulPrologVar& Var : Binding.Vars)
	{
		if (Var.Name == VarName)
		{
			OutValue = Var.Value;
			return true;
		}
	}
	OutValue = FInsimulPrologValue();
	return false;
}
