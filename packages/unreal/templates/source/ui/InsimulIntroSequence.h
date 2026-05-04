#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/TextBlock.h"
#include "Components/Image.h"
#include "InsimulIntroSequence.generated.h"

/**
 * A single narrative beat in an intro or cutscene sequence.
 */
USTRUCT(BlueprintType)
struct FNarrativeBeat
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Intro")
    FString Text;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Intro")
    FString CharacterName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Intro")
    FString PortraitPath;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Intro")
    float Duration = 3.0f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnSequenceComplete);

/**
 * Game intro and cutscene sequence widget matching GameIntroSequence.ts.
 *
 * Plays a series of narrative beats with text overlays, character portraits,
 * and timed transitions. Supports both intro sequences and in-game cutscenes.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulIntroSequence : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Play a full intro sequence with the given narrative beats */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Intro")
    void PlayIntroSequence(const TArray<FNarrativeBeat>& Beats);

    /** Play a cutscene with the given narrative beats */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Intro")
    void PlayCutscene(const TArray<FNarrativeBeat>& Beats);

    /** Skip the current sequence and jump to the end */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Intro")
    void SkipSequence();

    /** Whether a sequence is currently playing */
    UFUNCTION(BlueprintPure, Category = "Insimul|Intro")
    bool IsPlaying() const { return bIsPlaying; }

    /** Get the current beat index */
    UFUNCTION(BlueprintPure, Category = "Insimul|Intro")
    int32 GetCurrentBeatIndex() const { return CurrentBeatIndex; }

    /** Fired when the sequence finishes (or is skipped) */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Intro")
    FOnSequenceComplete OnSequenceComplete;

protected:
    virtual void NativeConstruct() override;

    /** Main text display for narrative content */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Intro")
    TObjectPtr<UTextBlock> NarrativeText;

    /** Character name display */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Intro")
    TObjectPtr<UTextBlock> CharacterNameText;

    /** Character portrait image */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Intro")
    TObjectPtr<UImage> PortraitImage;

    /** Skip button / hint text */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Intro")
    TObjectPtr<UTextBlock> SkipHintText;

private:
    UPROPERTY()
    bool bIsPlaying = false;

    UPROPERTY()
    int32 CurrentBeatIndex = 0;

    UPROPERTY()
    TArray<FNarrativeBeat> CurrentBeats;

    /** Timer handle for advancing to the next beat */
    FTimerHandle BeatTimerHandle;

    /** Start playing beats from the current index */
    void BeginPlayback();

    /** Display the current beat */
    void ShowCurrentBeat();

    /** Advance to the next beat (called by timer) */
    void AdvanceBeat();

    /** End the sequence and broadcast completion */
    void EndSequence();
};
