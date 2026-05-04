#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NPCGreetingSystem.generated.h"

class UWidgetComponent;

/**
 * NPC greeting and interaction prompt subsystem.
 * Detects player proximity to NPCs, generates contextual greetings based on
 * relationship, time of day, and current activity, and shows interaction prompts.
 */
UENUM(BlueprintType)
enum class ENPCRelationshipTier : uint8
{
    Stranger     UMETA(DisplayName = "Stranger"),
    Acquaintance UMETA(DisplayName = "Acquaintance"),
    Friend       UMETA(DisplayName = "Friend"),
    CloseFriend  UMETA(DisplayName = "Close Friend"),
    Rival        UMETA(DisplayName = "Rival")
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnNPCGreeted, const FString&, CharacterId, const FString&, Greeting);

UCLASS()
class INSIMULEXPORT_API UNPCGreetingSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Check for NPCs near the player and trigger greetings */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Greeting")
    void CheckPlayerProximity(FVector PlayerLocation);

    /** Get a contextual greeting for an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Greeting")
    FString GetGreeting(const FString& CharacterId, ENPCRelationshipTier RelationshipTier,
                        float TimeOfDay, const FString& CurrentActivity);

    /** Show an interaction prompt above an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Greeting")
    void ShowInteractionPrompt(AActor* NPCActor);

    /** Hide the currently shown interaction prompt */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Greeting")
    void HideInteractionPrompt();

    /** Register an NPC with its actor and location for proximity checks */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Greeting")
    void RegisterNPC(const FString& CharacterId, AActor* NPCActor);

    /** Unregister an NPC */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Greeting")
    void UnregisterNPC(const FString& CharacterId);

    /** Interaction range (cm) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Greeting")
    float InteractionRange = 300.0f;

    /** Cooldown between greetings from the same NPC (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Greeting")
    float GreetingCooldown = 30.0f;

    /** Fired when an NPC greets the player */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Greeting")
    FOnNPCGreeted OnNPCGreeted;

private:
    /** Last greeting time per NPC (game time seconds) */
    TMap<FString, float> LastGreetingTime;

    /** Registered NPC actors */
    TMap<FString, AActor*> RegisteredNPCs;

    /** Currently displayed prompt widget */
    UPROPERTY()
    UWidgetComponent* ActivePromptWidget = nullptr;

    /** Actor currently showing a prompt */
    UPROPERTY()
    AActor* PromptActor = nullptr;

    /** Get the current game time in seconds */
    float GetGameTimeSeconds() const;
};
