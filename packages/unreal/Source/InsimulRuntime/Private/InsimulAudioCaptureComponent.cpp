// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulAudioCaptureComponent.h"
#include "AudioCaptureComponent.h"

UInsimulAudioCaptureComponent::UInsimulAudioCaptureComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
}

void UInsimulAudioCaptureComponent::BeginPlay()
{
	Super::BeginPlay();
}

void UInsimulAudioCaptureComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (bIsCapturing)
	{
		StopCapture();
	}
	Super::EndPlay(EndPlayReason);
}

void UInsimulAudioCaptureComponent::TickComponent(
	float DeltaTime,
	ELevelTick TickType,
	FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

bool UInsimulAudioCaptureComponent::StartCapture()
{
	if (bIsCapturing)
	{
		return true;
	}

	CapturedAudio.Empty();
	bIsCapturing = true;
	SetComponentTickEnabled(true);

	OnCaptureStarted.Broadcast(TEXT("Capture started"));
	return true;
}

TArray<uint8> UInsimulAudioCaptureComponent::StopCapture()
{
	if (!bIsCapturing)
	{
		return TArray<uint8>();
	}

	bIsCapturing = false;
	SetComponentTickEnabled(false);

	TArray<uint8> Result = MoveTemp(CapturedAudio);
	CapturedAudio.Empty();

	OnCaptureStopped.Broadcast(TEXT("Capture stopped"));
	return Result;
}

void UInsimulAudioCaptureComponent::ClearBuffer()
{
	CapturedAudio.Empty();
}
