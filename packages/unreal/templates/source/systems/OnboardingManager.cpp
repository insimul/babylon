#include "OnboardingManager.h"

void UOnboardingManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LoadDefaultSteps();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] OnboardingManager initialized with %d steps"), TutorialSteps.Num());
}

void UOnboardingManager::Deinitialize()
{
    Super::Deinitialize();
}

void UOnboardingManager::LoadDefaultSteps()
{
    auto AddStep = [this](const FString& Id, const FString& Title, const FString& Desc, const FString& Widget)
    {
        FTutorialStep Step;
        Step.StepId = Id;
        Step.Title = Title;
        Step.Description = Desc;
        Step.HighlightWidget = Widget;
        Step.bComplete = false;
        TutorialSteps.Add(Step);
    };

    AddStep(TEXT("movement"), TEXT("Movement"),
            TEXT("Use WASD to move your character around the world."),
            TEXT("HUD_MovementIndicator"));

    AddStep(TEXT("camera"), TEXT("Camera Control"),
            TEXT("Move the mouse to look around. Use the scroll wheel to zoom."),
            TEXT("HUD_CameraIndicator"));

    AddStep(TEXT("interaction"), TEXT("Interacting with NPCs"),
            TEXT("Approach an NPC and press E to start a conversation."),
            TEXT("HUD_InteractionPrompt"));

    AddStep(TEXT("inventory"), TEXT("Your Inventory"),
            TEXT("Press I to open your inventory. Items you collect will appear here."),
            TEXT("HUD_InventoryButton"));

    AddStep(TEXT("quests"), TEXT("Quest Journal"),
            TEXT("Press J to open your quest journal and track your objectives."),
            TEXT("HUD_QuestButton"));

    AddStep(TEXT("map"), TEXT("World Map"),
            TEXT("Press M to open the world map and see discovered locations."),
            TEXT("HUD_MapButton"));
}

void UOnboardingManager::StartTutorial()
{
    if (bTutorialActive) return;

    CurrentStepIndex = 0;
    bTutorialActive = true;

    // Reset all steps
    for (FTutorialStep& Step : TutorialSteps)
    {
        Step.bComplete = false;
    }

    HighlightCurrentWidget();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Tutorial started"));
}

void UOnboardingManager::AdvanceStep()
{
    if (!bTutorialActive || TutorialSteps.Num() == 0) return;

    // Mark current step complete
    if (CurrentStepIndex < TutorialSteps.Num())
    {
        TutorialSteps[CurrentStepIndex].bComplete = true;
        OnStepCompleted.Broadcast(TutorialSteps[CurrentStepIndex]);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Tutorial step completed: %s"), *TutorialSteps[CurrentStepIndex].StepId);
    }

    CurrentStepIndex++;

    if (CurrentStepIndex >= TutorialSteps.Num())
    {
        // Tutorial complete
        bTutorialActive = false;
        OnTutorialCompleted.Broadcast();
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Tutorial completed!"));
        return;
    }

    HighlightCurrentWidget();
}

void UOnboardingManager::SkipTutorial()
{
    if (!bTutorialActive) return;

    // Mark all steps complete
    for (FTutorialStep& Step : TutorialSteps)
    {
        Step.bComplete = true;
    }

    bTutorialActive = false;
    CurrentStepIndex = TutorialSteps.Num();

    OnTutorialCompleted.Broadcast();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Tutorial skipped"));
}

FTutorialStep UOnboardingManager::GetCurrentStep() const
{
    if (CurrentStepIndex < TutorialSteps.Num())
    {
        return TutorialSteps[CurrentStepIndex];
    }

    return FTutorialStep();
}

bool UOnboardingManager::IsComplete() const
{
    if (TutorialSteps.Num() == 0) return true;

    for (const FTutorialStep& Step : TutorialSteps)
    {
        if (!Step.bComplete) return false;
    }
    return true;
}

void UOnboardingManager::HighlightCurrentWidget()
{
    if (CurrentStepIndex >= TutorialSteps.Num()) return;

    const FTutorialStep& Step = TutorialSteps[CurrentStepIndex];

    // TODO: Find the UMG widget by name and apply a highlight effect
    // This would typically involve:
    // 1. Finding the widget in the HUD by HighlightWidget name
    // 2. Adding a pulsing border/glow effect
    // 3. Showing a tooltip with Title and Description

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Highlighting widget: %s for step: %s"),
           *Step.HighlightWidget, *Step.Title);
}
