#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "PuzzleGameSystem.generated.h"

UENUM(BlueprintType)
enum class EPuzzleType : uint8
{
    Matching  UMETA(DisplayName = "Matching"),
    Sequence  UMETA(DisplayName = "Sequence"),
    Riddle    UMETA(DisplayName = "Riddle"),
    Lockpick  UMETA(DisplayName = "Lockpick"),
    Cipher    UMETA(DisplayName = "Cipher")
};

USTRUCT(BlueprintType)
struct FPuzzleData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString PuzzleId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EPuzzleType Type = EPuzzleType::Matching;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Difficulty = 1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 Seed = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bSolved = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPuzzleStarted, const FPuzzleData&, PuzzleData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPuzzleSolved, const FString&, PuzzleId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPuzzleFailed, const FString&, PuzzleId);

/**
 * Manages puzzle mini-games including matching, sequence, riddle, lockpick, and cipher puzzles.
 * Uses seeded PRNG for deterministic puzzle generation.
 */
UCLASS()
class INSIMULEXPORT_API UPuzzleGameSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Start a puzzle with the given data */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Puzzle")
    void StartPuzzle(const FPuzzleData& PuzzleData);

    /** Mark the active puzzle as solved */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Puzzle")
    void SolvePuzzle(const FString& PuzzleId);

    /** Mark the active puzzle as failed (allows retry) */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Puzzle")
    void FailPuzzle(const FString& PuzzleId);

    /** Get the currently active puzzle data */
    UFUNCTION(BlueprintPure, Category = "Insimul|Puzzle")
    FPuzzleData GetActivePuzzle() const;

    /** Whether a puzzle is currently active */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Puzzle")
    bool bPuzzleActive = false;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Puzzle")
    FOnPuzzleStarted OnPuzzleStarted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Puzzle")
    FOnPuzzleSolved OnPuzzleSolved;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Puzzle")
    FOnPuzzleFailed OnPuzzleFailed;

private:
    /** The currently active puzzle */
    FPuzzleData ActivePuzzle;

    /** Seeded random stream for deterministic puzzle generation */
    FRandomStream PuzzleRandom;

    /** Track solved puzzles */
    TSet<FString> SolvedPuzzles;
};
