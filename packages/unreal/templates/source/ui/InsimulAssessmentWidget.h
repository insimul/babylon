#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulAssessmentWidget.generated.h"

/**
 * Assessment instrument type — maps to standardised research instruments.
 */
UENUM(BlueprintType)
enum class EAssessmentInstrument : uint8
{
    ACTFL_OPI  UMETA(DisplayName = "ACTFL OPI"),
    SUS        UMETA(DisplayName = "System Usability Scale"),
    SSQ        UMETA(DisplayName = "Simulator Sickness Questionnaire"),
    IPQ        UMETA(DisplayName = "Igroup Presence Questionnaire"),
};

/**
 * Assessment phase — when the instrument is administered.
 */
UENUM(BlueprintType)
enum class EAssessmentPhase : uint8
{
    Pre     UMETA(DisplayName = "Pre-test"),
    Post    UMETA(DisplayName = "Post-test"),
    Delayed UMETA(DisplayName = "Delayed Post-test"),
};

/**
 * Question response type.
 */
UENUM(BlueprintType)
enum class EQuestionType : uint8
{
    Likert5         UMETA(DisplayName = "5-Point Likert"),
    Likert7         UMETA(DisplayName = "7-Point Likert"),
    OpenEnded       UMETA(DisplayName = "Open-Ended"),
    MultipleChoice  UMETA(DisplayName = "Multiple Choice"),
    RatingScale     UMETA(DisplayName = "Rating Scale"),
};

/**
 * A single assessment question.
 */
USTRUCT(BlueprintType)
struct FAssessmentQuestion
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString QuestionId;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString Text;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    EQuestionType Type = EQuestionType::Likert5;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    TArray<FString> Options;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString ScaleAnchorLow;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString ScaleAnchorHigh;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    bool bReverseScored = false;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    bool bRequired = true;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString Subscale;
};

/**
 * Player response to a single question.
 */
USTRUCT(BlueprintType)
struct FAssessmentResponse
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString QuestionId;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    int32 NumericValue = -1;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString TextValue;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString SelectedOption;
};

/**
 * Results of a completed assessment instrument.
 */
USTRUCT(BlueprintType)
struct FAssessmentResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString InstrumentId;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    EAssessmentPhase Phase = EAssessmentPhase::Pre;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    float TotalScore = 0.f;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    TMap<FString, float> SubscaleScores;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    TArray<FAssessmentResponse> Responses;

    UPROPERTY(BlueprintReadWrite, Category = "Assessment")
    FString CompletedTimestamp;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAssessmentCompleted, const FAssessmentResult&, Result);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnQuestionAnswered, const FString&, QuestionId, int32, QuestionIndex);

/**
 * Assessment widget — presents standardised research instruments
 * (ACTFL OPI, SUS, SSQ, IPQ) with configurable question flow and scoring.
 * Loads instrument definitions from exported DataTable JSON.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulAssessmentWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    virtual void NativeConstruct() override;

    /** Load assessment configuration from WorldIR JSON. */
    UFUNCTION(BlueprintCallable, Category = "Assessment")
    void LoadConfig(const FString& JsonString);

    /** Begin an assessment instrument for the given phase. */
    UFUNCTION(BlueprintCallable, Category = "Assessment")
    void StartAssessment(EAssessmentInstrument Instrument, EAssessmentPhase Phase);

    /** Submit the response for the current question and advance. */
    UFUNCTION(BlueprintCallable, Category = "Assessment")
    void SubmitAnswer(const FAssessmentResponse& Response);

    /** Skip the current question (only if not required). */
    UFUNCTION(BlueprintCallable, Category = "Assessment")
    bool SkipQuestion();

    /** Go back to the previous question. */
    UFUNCTION(BlueprintCallable, Category = "Assessment")
    void GoBack();

    /** Get the current question being displayed. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Assessment")
    FAssessmentQuestion GetCurrentQuestion() const;

    /** Get the current question index (0-based). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Assessment")
    int32 GetCurrentQuestionIndex() const;

    /** Get total question count for the active instrument. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Assessment")
    int32 GetTotalQuestionCount() const;

    /** Get progress as a fraction 0.0 – 1.0. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Assessment")
    float GetProgress() const;

    /** Check whether the assessment is currently active. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Assessment")
    bool IsAssessmentActive() const;

    /** Get results for all completed assessments. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Assessment")
    TArray<FAssessmentResult> GetCompletedResults() const;

    /** Fired when an assessment instrument is fully completed. */
    UPROPERTY(BlueprintAssignable, Category = "Assessment")
    FOnAssessmentCompleted OnAssessmentCompleted;

    /** Fired after each question is answered. */
    UPROPERTY(BlueprintAssignable, Category = "Assessment")
    FOnQuestionAnswered OnQuestionAnswered;

    // ─── Config ───────────────────────────────

    UPROPERTY(BlueprintReadOnly, Category = "Assessment|Config")
    int32 InstrumentCount = {{INSTRUMENT_COUNT}};

    UPROPERTY(BlueprintReadOnly, Category = "Assessment|Config")
    int32 TotalQuestionCount = {{TOTAL_QUESTION_COUNT}};

    UPROPERTY(BlueprintReadOnly, Category = "Assessment|Config")
    bool bHasPrePhase = {{HAS_PRE_PHASE}};

    UPROPERTY(BlueprintReadOnly, Category = "Assessment|Config")
    bool bHasPostPhase = {{HAS_POST_PHASE}};

    UPROPERTY(BlueprintReadOnly, Category = "Assessment|Config")
    bool bHasDelayedPhase = {{HAS_DELAYED_PHASE}};

private:
    UPROPERTY()
    TArray<FAssessmentQuestion> CurrentQuestions;

    UPROPERTY()
    TArray<FAssessmentResponse> CurrentResponses;

    UPROPERTY()
    TArray<FAssessmentResult> CompletedResults;

    UPROPERTY()
    int32 CurrentQuestionIndex = 0;

    UPROPERTY()
    bool bActive = false;

    UPROPERTY()
    EAssessmentInstrument ActiveInstrument;

    UPROPERTY()
    EAssessmentPhase ActivePhase;

    FString ActiveInstrumentId;
    FString ActiveScoringMethod;

    float ComputeScore() const;
};
