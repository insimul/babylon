#include "NPCGreetingSystem.h"
#include "Components/WidgetComponent.h"
#include "Kismet/GameplayStatics.h"

void UNPCGreetingSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCGreetingSystem initialized (Range: %.0f, Cooldown: %.1fs)"),
           InteractionRange, GreetingCooldown);
}

void UNPCGreetingSystem::RegisterNPC(const FString& CharacterId, AActor* NPCActor)
{
    if (!NPCActor)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot register NPC '%s' — actor is null"), *CharacterId);
        return;
    }
    RegisteredNPCs.Add(CharacterId, NPCActor);
    LastGreetingTime.Add(CharacterId, -GreetingCooldown); // Allow immediate first greeting
}

void UNPCGreetingSystem::UnregisterNPC(const FString& CharacterId)
{
    RegisteredNPCs.Remove(CharacterId);
    LastGreetingTime.Remove(CharacterId);
}

float UNPCGreetingSystem::GetGameTimeSeconds() const
{
    UWorld* World = GetWorld();
    return World ? World->GetTimeSeconds() : 0.0f;
}

void UNPCGreetingSystem::CheckPlayerProximity(FVector PlayerLocation)
{
    float CurrentTime = GetGameTimeSeconds();

    AActor* ClosestNPC = nullptr;
    FString ClosestId;
    float ClosestDist = InteractionRange;

    for (const auto& Pair : RegisteredNPCs)
    {
        const FString& CharacterId = Pair.Key;
        AActor* NPCActor = Pair.Value;
        if (!NPCActor) continue;

        float Dist = FVector::Dist(PlayerLocation, NPCActor->GetActorLocation());
        if (Dist > InteractionRange) continue;

        // Check cooldown
        const float* LastTime = LastGreetingTime.Find(CharacterId);
        if (LastTime && (CurrentTime - *LastTime) < GreetingCooldown) continue;

        // Track closest eligible NPC
        if (Dist < ClosestDist)
        {
            ClosestDist = Dist;
            ClosestNPC = NPCActor;
            ClosestId = CharacterId;
        }
    }

    if (ClosestNPC)
    {
        // Trigger greeting for closest NPC
        // Default to Stranger tier and noon — callers should provide actual values
        FString Greeting = GetGreeting(ClosestId, ENPCRelationshipTier::Stranger, 12.0f, TEXT("idle"));

        LastGreetingTime.Add(ClosestId, CurrentTime);
        ShowInteractionPrompt(ClosestNPC);

        OnNPCGreeted.Broadcast(ClosestId, Greeting);
        UE_LOG(LogTemp, Log, TEXT("[Insimul] NPC '%s' greets player: %s"), *ClosestId, *Greeting);
    }
    else
    {
        // No NPC in range — hide prompt
        HideInteractionPrompt();
    }
}

FString UNPCGreetingSystem::GetGreeting(const FString& CharacterId, ENPCRelationshipTier RelationshipTier,
                                         float TimeOfDay, const FString& CurrentActivity)
{
    // Determine time-of-day greeting prefix
    FString TimeGreeting;
    if (TimeOfDay < 6.0f)
    {
        TimeGreeting = TEXT("*yawns* Oh, hello...");
    }
    else if (TimeOfDay < 12.0f)
    {
        TimeGreeting = TEXT("Good morning");
    }
    else if (TimeOfDay < 18.0f)
    {
        TimeGreeting = TEXT("Good afternoon");
    }
    else
    {
        TimeGreeting = TEXT("Good evening");
    }

    // Adjust based on relationship
    switch (RelationshipTier)
    {
    case ENPCRelationshipTier::Stranger:
        return FString::Printf(TEXT("%s, traveler."), *TimeGreeting);

    case ENPCRelationshipTier::Acquaintance:
        return FString::Printf(TEXT("%s! I've seen you around."), *TimeGreeting);

    case ENPCRelationshipTier::Friend:
        return FString::Printf(TEXT("%s, friend! Good to see you."), *TimeGreeting);

    case ENPCRelationshipTier::CloseFriend:
        return FString::Printf(TEXT("Ah, there you are! %s!"), *TimeGreeting);

    case ENPCRelationshipTier::Rival:
        return FString::Printf(TEXT("Hmph. %s."), *TimeGreeting);

    default:
        return TimeGreeting;
    }
}

void UNPCGreetingSystem::ShowInteractionPrompt(AActor* NPCActor)
{
    if (!NPCActor) return;

    // Hide existing prompt if showing on a different actor
    if (PromptActor && PromptActor != NPCActor)
    {
        HideInteractionPrompt();
    }

    if (ActivePromptWidget) return; // Already showing on this actor

    // Create a widget component for the interaction prompt
    ActivePromptWidget = NewObject<UWidgetComponent>(NPCActor);
    if (ActivePromptWidget)
    {
        ActivePromptWidget->SetWidgetSpace(EWidgetSpace::Screen);
        ActivePromptWidget->SetDrawAtDesiredSize(true);
        ActivePromptWidget->RegisterComponent();

        USceneComponent* RootComp = NPCActor->GetRootComponent();
        if (RootComp)
        {
            ActivePromptWidget->AttachToComponent(RootComp, FAttachmentTransformRules::KeepRelativeTransform);
            ActivePromptWidget->SetRelativeLocation(FVector(0.0f, 0.0f, 120.0f)); // Above head
        }

        PromptActor = NPCActor;
    }
}

void UNPCGreetingSystem::HideInteractionPrompt()
{
    if (ActivePromptWidget)
    {
        ActivePromptWidget->DestroyComponent();
        ActivePromptWidget = nullptr;
        PromptActor = nullptr;
    }
}
