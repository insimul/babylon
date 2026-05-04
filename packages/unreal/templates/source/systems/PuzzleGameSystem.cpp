#include "PuzzleGameSystem.h"

void UPuzzleGameSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PuzzleGameSystem initialized"));
}

void UPuzzleGameSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UPuzzleGameSystem::StartPuzzle(const FPuzzleData& PuzzleData)
{
    if (bPuzzleActive)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot start puzzle %s — another puzzle is active"), *PuzzleData.PuzzleId);
        return;
    }

    ActivePuzzle = PuzzleData;
    ActivePuzzle.bSolved = false;
    bPuzzleActive = true;

    // Initialize seeded PRNG for deterministic puzzle generation
    PuzzleRandom.Initialize(PuzzleData.Seed != 0 ? PuzzleData.Seed : FMath::Rand());

    // TODO: Open puzzle UI overlay based on puzzle type
    // Each type would generate its content using PuzzleRandom:
    //   Matching  - Generate pairs of cards to match
    //   Sequence  - Generate a pattern sequence to repeat
    //   Riddle    - Select a riddle from a pool using seed
    //   Lockpick  - Generate pin positions for lockpick minigame
    //   Cipher    - Generate a substitution cipher to decode

    OnPuzzleStarted.Broadcast(ActivePuzzle);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Puzzle started: %s (type: %d, difficulty: %d, seed: %d)"),
           *PuzzleData.PuzzleId, static_cast<int32>(PuzzleData.Type), PuzzleData.Difficulty, PuzzleData.Seed);
}

void UPuzzleGameSystem::SolvePuzzle(const FString& PuzzleId)
{
    if (!bPuzzleActive || ActivePuzzle.PuzzleId != PuzzleId)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot solve puzzle %s — not the active puzzle"), *PuzzleId);
        return;
    }

    ActivePuzzle.bSolved = true;
    bPuzzleActive = false;
    SolvedPuzzles.Add(PuzzleId);

    // TODO: Award rewards through EventBus based on difficulty
    // Suggested: XP = Difficulty * 25, possible item drops
    int32 XPReward = ActivePuzzle.Difficulty * 25;
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Puzzle solved: %s — awarding %d XP"), *PuzzleId, XPReward);

    OnPuzzleSolved.Broadcast(PuzzleId);
}

void UPuzzleGameSystem::FailPuzzle(const FString& PuzzleId)
{
    if (!bPuzzleActive || ActivePuzzle.PuzzleId != PuzzleId)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot fail puzzle %s — not the active puzzle"), *PuzzleId);
        return;
    }

    bPuzzleActive = false;

    // Puzzle can be retried — not added to SolvedPuzzles
    OnPuzzleFailed.Broadcast(PuzzleId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Puzzle failed: %s (retry allowed)"), *PuzzleId);
}

FPuzzleData UPuzzleGameSystem::GetActivePuzzle() const
{
    return ActivePuzzle;
}
