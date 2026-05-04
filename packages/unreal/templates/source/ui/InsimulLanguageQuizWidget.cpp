#include "InsimulLanguageQuizWidget.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Math/UnrealMathUtility.h"

void UInsimulLanguageQuizWidget::NativeConstruct()
{
    Super::NativeConstruct();
    CurrentProficiency = EProficiencyLevel::Novice;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] LanguageQuizWidget constructed — %d vocab, %d patterns"),
        VocabularyCount, GrammarPatternCount);
}

void UInsimulLanguageQuizWidget::LoadConfig(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TSharedPtr<FJsonObject>* LangObj;
    if (!Root->TryGetObjectField(TEXT("languageLearning"), LangObj)) return;

    int32 VocabXP = 0, GrammarXP = 0;
    (*LangObj)->TryGetNumberField(TEXT("xpPerVocabularyUse"), VocabXP);
    (*LangObj)->TryGetNumberField(TEXT("xpPerGrammarUse"), GrammarXP);
    XPPerVocabularyUse = VocabXP;
    XPPerGrammarUse = GrammarXP;
    (*LangObj)->TryGetBoolField(TEXT("adaptiveDifficulty"), bAdaptiveDifficulty);

    // Load vocabulary items
    const TArray<TSharedPtr<FJsonValue>>* VocabArr;
    if ((*LangObj)->TryGetArrayField(TEXT("vocabulary"), VocabArr))
    {
        Vocabulary.Empty();
        for (const auto& Val : *VocabArr)
        {
            const TSharedPtr<FJsonObject>* ItemObj;
            if (!Val->TryGetObject(ItemObj)) continue;

            FVocabularyItem Item;
            (*ItemObj)->TryGetStringField(TEXT("id"), Item.ItemId);
            (*ItemObj)->TryGetStringField(TEXT("word"), Item.Word);
            (*ItemObj)->TryGetStringField(TEXT("translation"), Item.Translation);
            (*ItemObj)->TryGetStringField(TEXT("category"), Item.Category);
            (*ItemObj)->TryGetStringField(TEXT("pronunciation"), Item.Pronunciation);
            (*ItemObj)->TryGetStringField(TEXT("audioAssetKey"), Item.AudioAssetKey);
            (*ItemObj)->TryGetStringField(TEXT("exampleSentence"), Item.ExampleSentence);

            FString LevelStr;
            if ((*ItemObj)->TryGetStringField(TEXT("proficiencyLevel"), LevelStr))
            {
                if (LevelStr == TEXT("beginner")) Item.ProficiencyLevel = EProficiencyLevel::Beginner;
                else if (LevelStr == TEXT("intermediate")) Item.ProficiencyLevel = EProficiencyLevel::Intermediate;
                else if (LevelStr == TEXT("advanced")) Item.ProficiencyLevel = EProficiencyLevel::Advanced;
                else Item.ProficiencyLevel = EProficiencyLevel::Novice;
            }

            Vocabulary.Add(Item);
        }
        VocabularyCount = Vocabulary.Num();
    }

    // Load grammar patterns
    const TArray<TSharedPtr<FJsonValue>>* GramArr;
    if ((*LangObj)->TryGetArrayField(TEXT("grammarPatterns"), GramArr))
    {
        GrammarPatterns.Empty();
        for (const auto& Val : *GramArr)
        {
            const TSharedPtr<FJsonObject>* PatObj;
            if (!Val->TryGetObject(PatObj)) continue;

            FGrammarPattern Pat;
            (*PatObj)->TryGetStringField(TEXT("id"), Pat.PatternId);
            (*PatObj)->TryGetStringField(TEXT("name"), Pat.Name);
            (*PatObj)->TryGetStringField(TEXT("description"), Pat.Description);
            (*PatObj)->TryGetStringField(TEXT("pattern"), Pat.Pattern);
            (*PatObj)->TryGetStringField(TEXT("example"), Pat.Example);
            (*PatObj)->TryGetStringField(TEXT("exampleTranslation"), Pat.ExampleTranslation);

            FString LevelStr;
            if ((*PatObj)->TryGetStringField(TEXT("proficiencyLevel"), LevelStr))
            {
                if (LevelStr == TEXT("beginner")) Pat.ProficiencyLevel = EProficiencyLevel::Beginner;
                else if (LevelStr == TEXT("intermediate")) Pat.ProficiencyLevel = EProficiencyLevel::Intermediate;
                else if (LevelStr == TEXT("advanced")) Pat.ProficiencyLevel = EProficiencyLevel::Advanced;
                else Pat.ProficiencyLevel = EProficiencyLevel::Novice;
            }

            GrammarPatterns.Add(Pat);
        }
        GrammarPatternCount = GrammarPatterns.Num();
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] LanguageQuiz config loaded: %d vocab, %d patterns, adaptive=%d"),
        VocabularyCount, GrammarPatternCount, bAdaptiveDifficulty);
}

void UInsimulLanguageQuizWidget::StartQuiz(int32 QuestionCount)
{
    QuizQuestions.Empty();
    SessionResults.Empty();
    CurrentQuestionIndex = 0;
    SessionXP = 0;
    bQuizActive = true;

    GenerateQuestions(QuestionCount);

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Quiz started with %d questions at level %d"),
        QuizQuestions.Num(), (int32)CurrentProficiency);
}

FQuizAnswerResult UInsimulLanguageQuizWidget::SubmitAnswer(const FString& Answer)
{
    FQuizAnswerResult Result;
    if (!bQuizActive || CurrentQuestionIndex >= QuizQuestions.Num()) return Result;

    const FLanguageQuizQuestion& Q = QuizQuestions[CurrentQuestionIndex];
    Result.QuestionId = Q.QuestionId;
    Result.PlayerAnswer = Answer;
    Result.bCorrect = Answer.Equals(Q.CorrectAnswer, ESearchCase::IgnoreCase);

    if (Result.bCorrect)
    {
        int32 XP = (Q.QuizType == ELanguageQuizType::GrammarFillBlank || Q.QuizType == ELanguageQuizType::GrammarReorder)
            ? XPPerGrammarUse
            : XPPerVocabularyUse;
        Result.XPAwarded = XP;
        SessionXP += XP;
        TotalXP += XP;
    }

    SessionResults.Add(Result);
    OnAnswerSubmitted.Broadcast(Result);

    CurrentQuestionIndex++;

    if (CurrentQuestionIndex >= QuizQuestions.Num())
    {
        bQuizActive = false;
        CheckProficiencyAdvance();
        OnQuizCompleted.Broadcast(SessionXP);
    }

    return Result;
}

FLanguageQuizQuestion UInsimulLanguageQuizWidget::GetCurrentQuestion() const
{
    if (bQuizActive && CurrentQuestionIndex < QuizQuestions.Num())
    {
        return QuizQuestions[CurrentQuestionIndex];
    }
    return FLanguageQuizQuestion();
}

int32 UInsimulLanguageQuizWidget::GetCurrentQuestionIndex() const
{
    return CurrentQuestionIndex;
}

int32 UInsimulLanguageQuizWidget::GetQuizQuestionCount() const
{
    return QuizQuestions.Num();
}

float UInsimulLanguageQuizWidget::GetProgress() const
{
    if (QuizQuestions.Num() == 0) return 0.f;
    return (float)CurrentQuestionIndex / (float)QuizQuestions.Num();
}

bool UInsimulLanguageQuizWidget::IsQuizActive() const
{
    return bQuizActive;
}

EProficiencyLevel UInsimulLanguageQuizWidget::GetCurrentProficiency() const
{
    return CurrentProficiency;
}

int32 UInsimulLanguageQuizWidget::GetSessionXP() const
{
    return SessionXP;
}

int32 UInsimulLanguageQuizWidget::GetCorrectCount() const
{
    int32 Count = 0;
    for (const auto& R : SessionResults)
    {
        if (R.bCorrect) Count++;
    }
    return Count;
}

TArray<FVocabularyItem> UInsimulLanguageQuizWidget::GetVocabularyForLevel(EProficiencyLevel Level) const
{
    TArray<FVocabularyItem> Result;
    for (const auto& Item : Vocabulary)
    {
        if (Item.ProficiencyLevel <= Level)
        {
            Result.Add(Item);
        }
    }
    return Result;
}

void UInsimulLanguageQuizWidget::GenerateQuestions(int32 Count)
{
    // Filter vocabulary and patterns to current proficiency
    TArray<FVocabularyItem> EligibleVocab;
    for (const auto& V : Vocabulary)
    {
        if (!bAdaptiveDifficulty || V.ProficiencyLevel <= CurrentProficiency)
        {
            EligibleVocab.Add(V);
        }
    }

    TArray<FGrammarPattern> EligiblePatterns;
    for (const auto& P : GrammarPatterns)
    {
        if (!bAdaptiveDifficulty || P.ProficiencyLevel <= CurrentProficiency)
        {
            EligiblePatterns.Add(P);
        }
    }

    // Generate a mix of vocab and grammar questions
    int32 Generated = 0;
    int32 VocabTarget = FMath::Max(1, Count * 2 / 3);

    for (int32 i = 0; i < VocabTarget && i < EligibleVocab.Num() && Generated < Count; i++)
    {
        int32 Idx = FMath::RandRange(0, EligibleVocab.Num() - 1);
        QuizQuestions.Add(MakeVocabQuestion(EligibleVocab[Idx]));
        Generated++;
    }

    for (int32 i = 0; Generated < Count && i < EligiblePatterns.Num(); i++)
    {
        int32 Idx = FMath::RandRange(0, EligiblePatterns.Num() - 1);
        QuizQuestions.Add(MakeGrammarQuestion(EligiblePatterns[Idx]));
        Generated++;
    }
}

FLanguageQuizQuestion UInsimulLanguageQuizWidget::MakeVocabQuestion(const FVocabularyItem& Item) const
{
    FLanguageQuizQuestion Q;
    Q.QuestionId = FString::Printf(TEXT("vocab_%s"), *Item.ItemId);
    Q.QuizType = ELanguageQuizType::VocabularyTranslation;
    Q.Prompt = FString::Printf(TEXT("What does \"%s\" mean?"), *Item.Word);
    Q.CorrectAnswer = Item.Translation;
    Q.Difficulty = Item.ProficiencyLevel;
    Q.SourceVocabId = Item.ItemId;

    if (!Item.ExampleSentence.IsEmpty())
    {
        Q.Hint = Item.ExampleSentence;
    }

    // Generate distractors from other vocabulary
    Q.Choices.Add(Item.Translation);
    int32 DistractorsAdded = 0;
    for (const auto& Other : Vocabulary)
    {
        if (Other.ItemId != Item.ItemId && Other.Category == Item.Category && DistractorsAdded < 3)
        {
            Q.Choices.Add(Other.Translation);
            DistractorsAdded++;
        }
    }
    // Fill remaining slots from any vocab
    for (const auto& Other : Vocabulary)
    {
        if (DistractorsAdded >= 3) break;
        if (Other.ItemId != Item.ItemId && !Q.Choices.Contains(Other.Translation))
        {
            Q.Choices.Add(Other.Translation);
            DistractorsAdded++;
        }
    }

    return Q;
}

FLanguageQuizQuestion UInsimulLanguageQuizWidget::MakeGrammarQuestion(const FGrammarPattern& Pattern) const
{
    FLanguageQuizQuestion Q;
    Q.QuestionId = FString::Printf(TEXT("grammar_%s"), *Pattern.PatternId);
    Q.QuizType = ELanguageQuizType::GrammarFillBlank;
    Q.Prompt = FString::Printf(TEXT("Translate: \"%s\""), *Pattern.ExampleTranslation);
    Q.CorrectAnswer = Pattern.Example;
    Q.Difficulty = Pattern.ProficiencyLevel;
    Q.SourcePatternId = Pattern.PatternId;
    Q.Hint = Pattern.Description;

    return Q;
}

void UInsimulLanguageQuizWidget::CheckProficiencyAdvance()
{
    // Simple threshold-based advancement
    // In production, this would check against ProficiencyTierIR thresholds
    EProficiencyLevel OldLevel = CurrentProficiency;

    if (TotalXP >= 1000 && CurrentProficiency < EProficiencyLevel::Advanced)
    {
        CurrentProficiency = EProficiencyLevel::Advanced;
    }
    else if (TotalXP >= 400 && CurrentProficiency < EProficiencyLevel::Intermediate)
    {
        CurrentProficiency = EProficiencyLevel::Intermediate;
    }
    else if (TotalXP >= 100 && CurrentProficiency < EProficiencyLevel::Beginner)
    {
        CurrentProficiency = EProficiencyLevel::Beginner;
    }

    if (CurrentProficiency != OldLevel)
    {
        OnProficiencyChanged.Broadcast(CurrentProficiency);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Proficiency advanced to level %d (XP: %d)"),
            (int32)CurrentProficiency, TotalXP);
    }
}
