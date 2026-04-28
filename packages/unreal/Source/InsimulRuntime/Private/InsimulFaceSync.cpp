// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulFaceSync.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Actor.h"

UInsimulFaceSync::UInsimulFaceSync()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
}

void UInsimulFaceSync::BeginPlay()
{
	Super::BeginPlay();
	FindTargetMesh();

	if (VisemeToMorphTarget.Num() == 0)
	{
		InitializeDefaultMorphTargetMapping();
	}
}

void UInsimulFaceSync::TickComponent(
	float DeltaTime,
	ELevelTick TickType,
	FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!bIsActive || !TargetMesh)
	{
		return;
	}

	VisemeTimeRemaining -= DeltaTime;

	// Smoothly interpolate current weights toward targets
	InterpolateWeights(DeltaTime);
	ApplyWeightsToMesh();

	// If viseme duration expired and no new data pending, fade out
	if (VisemeTimeRemaining <= 0.0f)
	{
		for (auto& Pair : TargetWeights)
		{
			Pair.Value = 0.0f;
		}

		bool bAllZero = true;
		for (const auto& Pair : CurrentWeights)
		{
			if (Pair.Value > 0.01f)
			{
				bAllZero = false;
				break;
			}
		}

		if (bAllZero)
		{
			bIsActive = false;
			SetComponentTickEnabled(false);
		}
	}
}

void UInsimulFaceSync::ApplyVisemes(const FInsimulFacialData& FacialData)
{
	if (!TargetMesh)
	{
		FindTargetMesh();
		if (!TargetMesh)
		{
			return;
		}
	}

	for (auto& Pair : TargetWeights)
	{
		Pair.Value = 0.0f;
	}

	float TotalDuration = 0.0f;
	for (const FInsimulViseme& Viseme : FacialData.Visemes)
	{
		const FName* MorphTarget = VisemeToMorphTarget.Find(Viseme.Phoneme);
		if (MorphTarget)
		{
			TargetWeights.FindOrAdd(*MorphTarget) = FMath::Clamp(Viseme.Weight, 0.0f, 1.0f);
		}
		TotalDuration = FMath::Max(TotalDuration, static_cast<float>(Viseme.DurationMs) / 1000.0f);
	}

	VisemeTimeRemaining = TotalDuration > 0.0f ? TotalDuration : 0.1f;

	if (!bIsActive)
	{
		bIsActive = true;
		SetComponentTickEnabled(true);
	}
}

void UInsimulFaceSync::ResetVisemes()
{
	for (auto& Pair : CurrentWeights)
	{
		Pair.Value = 0.0f;
	}
	for (auto& Pair : TargetWeights)
	{
		Pair.Value = 0.0f;
	}

	ApplyWeightsToMesh();

	bIsActive = false;
	SetComponentTickEnabled(false);
}

void UInsimulFaceSync::FindTargetMesh()
{
	AActor* Owner = GetOwner();
	if (!Owner) return;

	if (!TargetMeshComponentName.IsNone())
	{
		TArray<USkeletalMeshComponent*> SkeletalMeshes;
		Owner->GetComponents<USkeletalMeshComponent>(SkeletalMeshes);
		for (USkeletalMeshComponent* SMC : SkeletalMeshes)
		{
			if (SMC->GetFName() == TargetMeshComponentName)
			{
				TargetMesh = SMC;
				return;
			}
		}
	}

	TargetMesh = Owner->FindComponentByClass<USkeletalMeshComponent>();
}

void UInsimulFaceSync::InitializeDefaultMorphTargetMapping()
{
	// Oculus OVR 15-viseme standard mapping
	VisemeToMorphTarget.Add(TEXT("sil"), FName(TEXT("viseme_sil")));
	VisemeToMorphTarget.Add(TEXT("PP"),  FName(TEXT("viseme_PP")));
	VisemeToMorphTarget.Add(TEXT("FF"),  FName(TEXT("viseme_FF")));
	VisemeToMorphTarget.Add(TEXT("TH"),  FName(TEXT("viseme_TH")));
	VisemeToMorphTarget.Add(TEXT("DD"),  FName(TEXT("viseme_DD")));
	VisemeToMorphTarget.Add(TEXT("kk"),  FName(TEXT("viseme_kk")));
	VisemeToMorphTarget.Add(TEXT("CH"),  FName(TEXT("viseme_CH")));
	VisemeToMorphTarget.Add(TEXT("SS"),  FName(TEXT("viseme_SS")));
	VisemeToMorphTarget.Add(TEXT("nn"),  FName(TEXT("viseme_nn")));
	VisemeToMorphTarget.Add(TEXT("RR"),  FName(TEXT("viseme_RR")));
	VisemeToMorphTarget.Add(TEXT("aa"),  FName(TEXT("viseme_aa")));
	VisemeToMorphTarget.Add(TEXT("E"),   FName(TEXT("viseme_E")));
	VisemeToMorphTarget.Add(TEXT("ih"),  FName(TEXT("viseme_ih")));
	VisemeToMorphTarget.Add(TEXT("oh"),  FName(TEXT("viseme_oh")));
	VisemeToMorphTarget.Add(TEXT("ou"),  FName(TEXT("viseme_ou")));
}

void UInsimulFaceSync::InterpolateWeights(float DeltaTime)
{
	float Alpha = FMath::Clamp(BlendSpeed * DeltaTime, 0.0f, 1.0f);

	for (auto& Pair : TargetWeights)
	{
		float& Current = CurrentWeights.FindOrAdd(Pair.Key, 0.0f);
		Current = FMath::Lerp(Current, Pair.Value, Alpha);
	}

	for (auto& Pair : CurrentWeights)
	{
		if (!TargetWeights.Contains(Pair.Key))
		{
			Pair.Value = FMath::Lerp(Pair.Value, 0.0f, Alpha);
		}
	}
}

void UInsimulFaceSync::ApplyWeightsToMesh()
{
	if (!TargetMesh) return;

	for (const auto& Pair : CurrentWeights)
	{
		TargetMesh->SetMorphTarget(Pair.Key, Pair.Value);
	}
}
