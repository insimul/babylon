#include "NPCActivityLabelSystem.h"
#include "Components/WidgetComponent.h"

void UNPCActivityLabelSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] NPCActivityLabelSystem initialized (MaxDist: %.0f, FadeStart: %.0f)"),
           MaxLabelDistance, FadeStartDistance);
}

void UNPCActivityLabelSystem::RegisterNPC(const FString& CharacterId, AActor* NPCActor)
{
    if (!NPCActor)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Cannot register label for NPC '%s' — actor is null"), *CharacterId);
        return;
    }

    RegisteredActors.Add(CharacterId, NPCActor);
    ActivityLabels.Add(CharacterId, TEXT(""));
    TalkingStates.Add(CharacterId, false);

    // Create widget component for the label
    UWidgetComponent* Widget = NewObject<UWidgetComponent>(NPCActor);
    if (Widget)
    {
        Widget->SetWidgetSpace(EWidgetSpace::Screen);
        Widget->SetDrawAtDesiredSize(true);
        Widget->RegisterComponent();

        USceneComponent* RootComp = NPCActor->GetRootComponent();
        if (RootComp)
        {
            Widget->AttachToComponent(RootComp, FAttachmentTransformRules::KeepRelativeTransform);
            Widget->SetRelativeLocation(FVector(0.0f, 0.0f, 150.0f)); // Above head
        }

        Widget->SetVisibility(false); // Hidden until activity is set
        LabelWidgets.Add(CharacterId, Widget);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Registered activity label for NPC: %s"), *CharacterId);
}

void UNPCActivityLabelSystem::UnregisterNPC(const FString& CharacterId)
{
    // Destroy widget component
    UWidgetComponent** Widget = LabelWidgets.Find(CharacterId);
    if (Widget && *Widget)
    {
        (*Widget)->DestroyComponent();
    }

    LabelWidgets.Remove(CharacterId);
    RegisteredActors.Remove(CharacterId);
    ActivityLabels.Remove(CharacterId);
    TalkingStates.Remove(CharacterId);
}

void UNPCActivityLabelSystem::SetActivity(const FString& CharacterId, const FString& ActivityText)
{
    FString* Current = ActivityLabels.Find(CharacterId);
    if (Current)
    {
        *Current = ActivityText;
    }
    else
    {
        ActivityLabels.Add(CharacterId, ActivityText);
    }

    UE_LOG(LogTemp, Verbose, TEXT("[Insimul] Activity label for '%s': %s"), *CharacterId, *ActivityText);
}

void UNPCActivityLabelSystem::SetTalking(const FString& CharacterId, bool bIsTalking)
{
    bool* Current = TalkingStates.Find(CharacterId);
    if (Current)
    {
        *Current = bIsTalking;
    }
    else
    {
        TalkingStates.Add(CharacterId, bIsTalking);
    }
}

void UNPCActivityLabelSystem::UpdateLabels(FVector CameraLocation, FVector CameraForward)
{
    for (auto& Pair : LabelWidgets)
    {
        const FString& CharacterId = Pair.Key;
        UWidgetComponent* Widget = Pair.Value;
        if (!Widget) continue;

        AActor** ActorPtr = RegisteredActors.Find(CharacterId);
        if (!ActorPtr || !*ActorPtr) continue;

        AActor* NPCActor = *ActorPtr;
        FVector NPCLocation = NPCActor->GetActorLocation();
        float Distance = FVector::Dist(CameraLocation, NPCLocation);

        // Check if activity text is set
        const FString* ActivityText = ActivityLabels.Find(CharacterId);
        bool bHasActivity = ActivityText && !ActivityText->IsEmpty();

        // Check talking state
        const bool* bTalking = TalkingStates.Find(CharacterId);
        bool bIsTalking = bTalking && *bTalking;

        // Show label if NPC has activity or is talking and within range
        bool bShouldShow = (bHasActivity || bIsTalking) && Distance <= MaxLabelDistance;

        if (!bShouldShow)
        {
            Widget->SetVisibility(false);
            continue;
        }

        Widget->SetVisibility(true);

        // Calculate opacity based on distance (fade between FadeStartDistance and MaxLabelDistance)
        float Opacity = 1.0f;
        if (Distance > FadeStartDistance)
        {
            float FadeRange = MaxLabelDistance - FadeStartDistance;
            if (FadeRange > KINDA_SMALL_NUMBER)
            {
                Opacity = 1.0f - ((Distance - FadeStartDistance) / FadeRange);
                Opacity = FMath::Clamp(Opacity, 0.0f, 1.0f);
            }
        }

        // Apply opacity to the widget's render opacity
        Widget->SetTintColorAndOpacity(FLinearColor(1.0f, 1.0f, 1.0f, Opacity));

        // Labels use Screen space so they automatically billboard toward camera
    }
}
