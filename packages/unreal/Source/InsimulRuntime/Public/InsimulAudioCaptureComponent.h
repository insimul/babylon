// Copyright 2024 Insimul. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "InsimulAudioCaptureComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnInsimulCaptureEvent, const FString&, Message);

/**
 * UInsimulAudioCaptureComponent — Wraps platform microphone APIs
 * for push-to-talk voice input to the Insimul conversation service.
 *
 * Attach alongside UInsimulConversationComponent on the player character.
 */
UCLASS(ClassGroup = (Insimul), meta = (BlueprintSpawnableComponent))
class INSIMULRUNTIME_API UInsimulAudioCaptureComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UInsimulAudioCaptureComponent();

	/** Audio sample rate for capture (default 16000 Hz) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Audio", meta = (ClampMin = "8000", ClampMax = "48000"))
	int32 SampleRate = 16000;

	/** Number of audio channels (1 = mono, recommended for speech) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Audio", meta = (ClampMin = "1", ClampMax = "2"))
	int32 NumChannels = 1;

	/** Start capturing audio from the default microphone */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
	bool StartCapture();

	/** Stop capturing and return the recorded audio buffer */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
	TArray<uint8> StopCapture();

	/** Check if currently recording */
	UFUNCTION(BlueprintPure, Category = "Insimul|Audio")
	bool IsCapturing() const { return bIsCapturing; }

	/** Get the current captured audio buffer (for streaming while recording) */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
	TArray<uint8> GetCapturedAudio() const { return CapturedAudio; }

	/** Clear the captured audio buffer */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Audio")
	void ClearBuffer();

	/** Fired when audio capture starts */
	UPROPERTY(BlueprintAssignable, Category = "Insimul|Audio|Events")
	FOnInsimulCaptureEvent OnCaptureStarted;

	/** Fired when audio capture stops */
	UPROPERTY(BlueprintAssignable, Category = "Insimul|Audio|Events")
	FOnInsimulCaptureEvent OnCaptureStopped;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	bool bIsCapturing = false;
	TArray<uint8> CapturedAudio;

	UPROPERTY()
	TObjectPtr<class UAudioCaptureComponent> PlatformCapture;
};
