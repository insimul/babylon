#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "OnboardingManager.generated.h"

USTRUCT(BlueprintType)
struct FTutorialStep
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString StepId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Title;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString Description;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FString HighlightWidget;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bComplete = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStepCompleted, const FTutorialStep&, Step);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnTutorialCompleted);

/**
 * Tutorial/onboarding manager that guides players through game mechanics
 * with step-by-step instructions and UI widget highlighting.
 */
UCLASS()
class INSIMULEXPORT_API UOnboardingManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Start the tutorial from the beginning */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Onboarding")
    void StartTutorial();

    /** Advance to the next tutorial step */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Onboarding")
    void AdvanceStep();

    /** Skip the entire tutorial */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Onboarding")
    void SkipTutorial();

    /** Get the current tutorial step */
    UFUNCTION(BlueprintPure, Category = "Insimul|Onboarding")
    FTutorialStep GetCurrentStep() const;

    /** Check if the tutorial is complete */
    UFUNCTION(BlueprintPure, Category = "Insimul|Onboarding")
    bool IsComplete() const;

    /** Whether the tutorial is currently active */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Onboarding")
    bool bTutorialActive = false;

    /** All tutorial steps */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Onboarding")
    TArray<FTutorialStep> TutorialSteps;

    /** Index of the current step */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Onboarding")
    int32 CurrentStepIndex = 0;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Onboarding")
    FOnStepCompleted OnStepCompleted;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Onboarding")
    FOnTutorialCompleted OnTutorialCompleted;

private:
    /** Load default tutorial step definitions */
    void LoadDefaultSteps();

    /** Highlight the widget specified by the current step */
    void HighlightCurrentWidget();
};
