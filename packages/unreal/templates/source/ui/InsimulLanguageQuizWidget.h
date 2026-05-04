#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "InsimulLanguageQuizWidget.generated.h"

/**
 * Language quiz question type.
 */
UENUM(BlueprintType)
enum class ELanguageQuizType : uint8
{
    VocabularyTranslation  UMETA(DisplayName = "Vocabulary Translation"),
    VocabularyListening    UMETA(DisplayName = "Vocabulary Listening"),
    GrammarFillBlank       UMETA(DisplayName = "Grammar Fill-in-the-Blank"),
    GrammarReorder         UMETA(DisplayName = "Grammar Word Reorder"),
    MultipleChoice         UMETA(DisplayName = "Multiple Choice"),
};

/**
 * Proficiency level — matches IR ProficiencyLevel.
 */
UENUM(BlueprintType)
enum class EProficiencyLevel : uint8
{
    Novice       UMETA(DisplayName = "Novice"),
    Beginner     UMETA(DisplayName = "Beginner"),
    Intermediate UMETA(DisplayName = "Intermediate"),
    Advanced     UMETA(DisplayName = "Advanced"),
};

/**
 * A vocabulary item for use in language quizzes.
 */
USTRUCT(BlueprintType)
struct FVocabularyItem
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString ItemId;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Word;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Translation;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Category;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    EProficiencyLevel ProficiencyLevel = EProficiencyLevel::Novice;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Pronunciation;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString AudioAssetKey;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString ExampleSentence;
};

/**
 * A grammar pattern for use in language quizzes.
 */
USTRUCT(BlueprintType)
struct FGrammarPattern
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString PatternId;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Name;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Description;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Pattern;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Example;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString ExampleTranslation;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    EProficiencyLevel ProficiencyLevel = EProficiencyLevel::Novice;
};

/**
 * A single quiz question presented to the player.
 */
USTRUCT(BlueprintType)
struct FLanguageQuizQuestion
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString QuestionId;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    ELanguageQuizType QuizType = ELanguageQuizType::VocabularyTranslation;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Prompt;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString CorrectAnswer;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    TArray<FString> Choices;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString Hint;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    EProficiencyLevel Difficulty = EProficiencyLevel::Novice;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString SourceVocabId;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString SourcePatternId;
};

/**
 * Result of a single quiz answer.
 */
USTRUCT(BlueprintType)
struct FQuizAnswerResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString QuestionId;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    FString PlayerAnswer;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    bool bCorrect = false;

    UPROPERTY(BlueprintReadWrite, Category = "LanguageQuiz")
    int32 XPAwarded = 0;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnQuizCompleted, int32, TotalXP);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAnswerSubmitted, const FQuizAnswerResult&, Result);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnProficiencyChanged, EProficiencyLevel, NewLevel);

/**
 * Language quiz widget — generates and presents vocabulary and grammar
 * quizzes that adapt to the player's proficiency level.
 * Integrates with the language learning system for XP and progression.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulLanguageQuizWidget : public UUserWidget
{
    GENERATED_BODY()

public:
    virtual void NativeConstruct() override;

    /** Load language learning configuration from WorldIR JSON. */
    UFUNCTION(BlueprintCallable, Category = "LanguageQuiz")
    void LoadConfig(const FString& JsonString);

    /** Start a new quiz session with the given number of questions. */
    UFUNCTION(BlueprintCallable, Category = "LanguageQuiz")
    void StartQuiz(int32 QuestionCount);

    /** Submit the player's answer for the current question. */
    UFUNCTION(BlueprintCallable, Category = "LanguageQuiz")
    FQuizAnswerResult SubmitAnswer(const FString& Answer);

    /** Get the current quiz question. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    FLanguageQuizQuestion GetCurrentQuestion() const;

    /** Get current question index (0-based). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    int32 GetCurrentQuestionIndex() const;

    /** Get total questions in the current quiz session. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    int32 GetQuizQuestionCount() const;

    /** Get progress as a fraction 0.0 – 1.0. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    float GetProgress() const;

    /** Whether a quiz is currently in progress. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    bool IsQuizActive() const;

    /** Get the player's current proficiency level. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    EProficiencyLevel GetCurrentProficiency() const;

    /** Get total XP earned in the current session. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    int32 GetSessionXP() const;

    /** Get the number of correct answers in the current session. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    int32 GetCorrectCount() const;

    /** Get vocabulary items filtered by proficiency level. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "LanguageQuiz")
    TArray<FVocabularyItem> GetVocabularyForLevel(EProficiencyLevel Level) const;

    /** Fired when a quiz session is completed. */
    UPROPERTY(BlueprintAssignable, Category = "LanguageQuiz")
    FOnQuizCompleted OnQuizCompleted;

    /** Fired after each answer is submitted. */
    UPROPERTY(BlueprintAssignable, Category = "LanguageQuiz")
    FOnAnswerSubmitted OnAnswerSubmitted;

    /** Fired when the player's proficiency level changes. */
    UPROPERTY(BlueprintAssignable, Category = "LanguageQuiz")
    FOnProficiencyChanged OnProficiencyChanged;

    // ─── Config ───────────────────────────────

    UPROPERTY(BlueprintReadOnly, Category = "LanguageQuiz|Config")
    int32 VocabularyCount = {{VOCABULARY_COUNT}};

    UPROPERTY(BlueprintReadOnly, Category = "LanguageQuiz|Config")
    int32 GrammarPatternCount = {{GRAMMAR_PATTERN_COUNT}};

    UPROPERTY(BlueprintReadOnly, Category = "LanguageQuiz|Config")
    int32 XPPerVocabularyUse = {{XP_PER_VOCABULARY_USE}};

    UPROPERTY(BlueprintReadOnly, Category = "LanguageQuiz|Config")
    int32 XPPerGrammarUse = {{XP_PER_GRAMMAR_USE}};

    UPROPERTY(BlueprintReadOnly, Category = "LanguageQuiz|Config")
    bool bAdaptiveDifficulty = {{ADAPTIVE_DIFFICULTY}};

private:
    UPROPERTY()
    TArray<FVocabularyItem> Vocabulary;

    UPROPERTY()
    TArray<FGrammarPattern> GrammarPatterns;

    UPROPERTY()
    TArray<FLanguageQuizQuestion> QuizQuestions;

    UPROPERTY()
    TArray<FQuizAnswerResult> SessionResults;

    UPROPERTY()
    int32 CurrentQuestionIndex = 0;

    UPROPERTY()
    int32 SessionXP = 0;

    UPROPERTY()
    int32 TotalXP = 0;

    UPROPERTY()
    bool bQuizActive = false;

    UPROPERTY()
    EProficiencyLevel CurrentProficiency = EProficiencyLevel::Novice;

    void GenerateQuestions(int32 Count);
    FLanguageQuizQuestion MakeVocabQuestion(const FVocabularyItem& Item) const;
    FLanguageQuizQuestion MakeGrammarQuestion(const FGrammarPattern& Pattern) const;
    void CheckProficiencyAdvance();
};
