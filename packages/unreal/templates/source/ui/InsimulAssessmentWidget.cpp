#include "InsimulAssessmentWidget.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UInsimulAssessmentWidget::NativeConstruct()
{
    Super::NativeConstruct();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] AssessmentWidget constructed — %d instruments configured"), InstrumentCount);
}

void UInsimulAssessmentWidget::LoadConfig(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* AssessObj;
    if (!Root->TryGetObjectField(TEXT("assessment"), AssessObj)) return;

    const TArray<TSharedPtr<FJsonValue>>* InstrArr;
    if ((*AssessObj)->TryGetArrayField(TEXT("instruments"), InstrArr))
    {
        InstrumentCount = InstrArr->Num();
        TotalQuestionCount = 0;

        for (const auto& InstrVal : *InstrArr)
        {
            const TSharedPtr<FJsonObject>* InstrObj;
            if (!InstrVal->TryGetObject(InstrObj)) continue;

            const TArray<TSharedPtr<FJsonValue>>* QArr;
            if ((*InstrObj)->TryGetArrayField(TEXT("questions"), QArr))
            {
                TotalQuestionCount += QArr->Num();
            }
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* PhasesArr;
    if ((*AssessObj)->TryGetArrayField(TEXT("phases"), PhasesArr))
    {
        bHasPrePhase = false;
        bHasPostPhase = false;
        bHasDelayedPhase = false;
        for (const auto& PhaseVal : *PhasesArr)
        {
            FString Phase = PhaseVal->AsString();
            if (Phase == TEXT("pre")) bHasPrePhase = true;
            else if (Phase == TEXT("post")) bHasPostPhase = true;
            else if (Phase == TEXT("delayed")) bHasDelayedPhase = true;
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Assessment config loaded: %d instruments, %d questions"), InstrumentCount, TotalQuestionCount);
}

void UInsimulAssessmentWidget::StartAssessment(EAssessmentInstrument Instrument, EAssessmentPhase Phase)
{
    CurrentQuestions.Empty();
    CurrentResponses.Empty();
    CurrentQuestionIndex = 0;
    ActiveInstrument = Instrument;
    ActivePhase = Phase;
    bActive = true;

    // Map enum to instrument ID for JSON lookup
    switch (Instrument)
    {
    case EAssessmentInstrument::ACTFL_OPI: ActiveInstrumentId = TEXT("actfl_opi"); break;
    case EAssessmentInstrument::SUS:       ActiveInstrumentId = TEXT("sus"); break;
    case EAssessmentInstrument::SSQ:       ActiveInstrumentId = TEXT("ssq"); break;
    case EAssessmentInstrument::IPQ:       ActiveInstrumentId = TEXT("ipq"); break;
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Assessment started: %s phase=%d"), *ActiveInstrumentId, (int32)Phase);
}

void UInsimulAssessmentWidget::SubmitAnswer(const FAssessmentResponse& Response)
{
    if (!bActive) return;

    if (CurrentQuestionIndex < CurrentResponses.Num())
    {
        CurrentResponses[CurrentQuestionIndex] = Response;
    }
    else
    {
        CurrentResponses.Add(Response);
    }

    OnQuestionAnswered.Broadcast(Response.QuestionId, CurrentQuestionIndex);
    CurrentQuestionIndex++;

    if (CurrentQuestionIndex >= CurrentQuestions.Num())
    {
        // Assessment complete
        bActive = false;

        FAssessmentResult Result;
        Result.InstrumentId = ActiveInstrumentId;
        Result.Phase = ActivePhase;
        Result.Responses = CurrentResponses;
        Result.TotalScore = ComputeScore();
        Result.CompletedTimestamp = FDateTime::UtcNow().ToIso8601();

        CompletedResults.Add(Result);
        OnAssessmentCompleted.Broadcast(Result);

        UE_LOG(LogTemp, Log, TEXT("[Insimul] Assessment %s completed — score: %.2f"), *ActiveInstrumentId, Result.TotalScore);
    }
}

bool UInsimulAssessmentWidget::SkipQuestion()
{
    if (!bActive || CurrentQuestionIndex >= CurrentQuestions.Num()) return false;

    const FAssessmentQuestion& Q = CurrentQuestions[CurrentQuestionIndex];
    if (Q.bRequired) return false;

    FAssessmentResponse Blank;
    Blank.QuestionId = Q.QuestionId;
    Blank.NumericValue = -1;

    if (CurrentQuestionIndex < CurrentResponses.Num())
    {
        CurrentResponses[CurrentQuestionIndex] = Blank;
    }
    else
    {
        CurrentResponses.Add(Blank);
    }

    CurrentQuestionIndex++;
    return true;
}

void UInsimulAssessmentWidget::GoBack()
{
    if (bActive && CurrentQuestionIndex > 0)
    {
        CurrentQuestionIndex--;
    }
}

FAssessmentQuestion UInsimulAssessmentWidget::GetCurrentQuestion() const
{
    if (bActive && CurrentQuestionIndex < CurrentQuestions.Num())
    {
        return CurrentQuestions[CurrentQuestionIndex];
    }
    return FAssessmentQuestion();
}

int32 UInsimulAssessmentWidget::GetCurrentQuestionIndex() const
{
    return CurrentQuestionIndex;
}

int32 UInsimulAssessmentWidget::GetTotalQuestionCount() const
{
    return CurrentQuestions.Num();
}

float UInsimulAssessmentWidget::GetProgress() const
{
    if (CurrentQuestions.Num() == 0) return 0.f;
    return (float)CurrentQuestionIndex / (float)CurrentQuestions.Num();
}

bool UInsimulAssessmentWidget::IsAssessmentActive() const
{
    return bActive;
}

TArray<FAssessmentResult> UInsimulAssessmentWidget::GetCompletedResults() const
{
    return CompletedResults;
}

float UInsimulAssessmentWidget::ComputeScore() const
{
    if (CurrentResponses.Num() == 0) return 0.f;

    float Sum = 0.f;
    int32 Count = 0;

    for (int32 i = 0; i < CurrentResponses.Num(); i++)
    {
        const FAssessmentResponse& R = CurrentResponses[i];
        if (R.NumericValue < 0) continue;

        float Val = (float)R.NumericValue;

        // Handle reverse-scored items
        if (i < CurrentQuestions.Num() && CurrentQuestions[i].bReverseScored)
        {
            int32 MaxScale = (CurrentQuestions[i].Type == EQuestionType::Likert7) ? 7 : 5;
            Val = (float)(MaxScale + 1) - Val;
        }

        Sum += Val;
        Count++;
    }

    // Default to mean scoring
    return Count > 0 ? Sum / (float)Count : 0.f;
}
