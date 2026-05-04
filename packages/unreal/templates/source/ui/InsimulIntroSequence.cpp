#include "InsimulIntroSequence.h"
#include "Components/TextBlock.h"
#include "Components/Image.h"
#include "TimerManager.h"
#include "Engine/Texture2D.h"

void UInsimulIntroSequence::NativeConstruct()
{
    Super::NativeConstruct();

    // Start hidden
    SetVisibility(ESlateVisibility::Collapsed);

    if (SkipHintText)
    {
        SkipHintText->SetText(FText::FromString(TEXT("Press ESC or click to skip")));
    }
}

void UInsimulIntroSequence::PlayIntroSequence(const TArray<FNarrativeBeat>& Beats)
{
    if (Beats.Num() == 0) return;

    CurrentBeats = Beats;
    CurrentBeatIndex = 0;
    BeginPlayback();

    UE_LOG(LogTemp, Log, TEXT("[InsimulIntro] Playing intro sequence with %d beats"), Beats.Num());
}

void UInsimulIntroSequence::PlayCutscene(const TArray<FNarrativeBeat>& Beats)
{
    if (Beats.Num() == 0) return;

    CurrentBeats = Beats;
    CurrentBeatIndex = 0;
    BeginPlayback();

    UE_LOG(LogTemp, Log, TEXT("[InsimulIntro] Playing cutscene with %d beats"), Beats.Num());
}

void UInsimulIntroSequence::SkipSequence()
{
    if (!bIsPlaying) return;

    UE_LOG(LogTemp, Log, TEXT("[InsimulIntro] Sequence skipped at beat %d/%d"), CurrentBeatIndex, CurrentBeats.Num());

    EndSequence();
}

void UInsimulIntroSequence::BeginPlayback()
{
    bIsPlaying = true;
    SetVisibility(ESlateVisibility::SelfHitTestInvisible);

    if (SkipHintText)
    {
        SkipHintText->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
    }

    ShowCurrentBeat();
}

void UInsimulIntroSequence::ShowCurrentBeat()
{
    if (CurrentBeatIndex >= CurrentBeats.Num())
    {
        EndSequence();
        return;
    }

    const FNarrativeBeat& Beat = CurrentBeats[CurrentBeatIndex];

    // Update narrative text
    if (NarrativeText)
    {
        NarrativeText->SetText(FText::FromString(Beat.Text));
        NarrativeText->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
    }

    // Update character name
    if (CharacterNameText)
    {
        if (!Beat.CharacterName.IsEmpty())
        {
            CharacterNameText->SetText(FText::FromString(Beat.CharacterName));
            CharacterNameText->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
        }
        else
        {
            CharacterNameText->SetVisibility(ESlateVisibility::Collapsed);
        }
    }

    // Update portrait
    if (PortraitImage)
    {
        if (!Beat.PortraitPath.IsEmpty())
        {
            UTexture2D* Portrait = Cast<UTexture2D>(
                StaticLoadObject(UTexture2D::StaticClass(), nullptr, *Beat.PortraitPath));
            if (Portrait)
            {
                PortraitImage->SetBrushFromTexture(Portrait);
                PortraitImage->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
            }
            else
            {
                PortraitImage->SetVisibility(ESlateVisibility::Collapsed);
            }
        }
        else
        {
            PortraitImage->SetVisibility(ESlateVisibility::Collapsed);
        }
    }

    // Set timer to advance to next beat
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(BeatTimerHandle);
        World->GetTimerManager().SetTimer(
            BeatTimerHandle,
            FTimerDelegate::CreateUObject(this, &UInsimulIntroSequence::AdvanceBeat),
            Beat.Duration,
            false
        );
    }
}

void UInsimulIntroSequence::AdvanceBeat()
{
    CurrentBeatIndex++;
    ShowCurrentBeat();
}

void UInsimulIntroSequence::EndSequence()
{
    bIsPlaying = false;

    // Clear the beat timer
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(BeatTimerHandle);
    }

    // Hide everything
    SetVisibility(ESlateVisibility::Collapsed);

    CurrentBeats.Empty();
    CurrentBeatIndex = 0;

    OnSequenceComplete.Broadcast();

    UE_LOG(LogTemp, Log, TEXT("[InsimulIntro] Sequence complete"));
}
