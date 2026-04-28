// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulDebugComponent.h"
#include "Engine/Engine.h"
#include "DrawDebugHelpers.h"
#include "InsimulConversationComponent.h"
#include "GameFramework/Character.h"

UInsimulDebugComponent::UInsimulDebugComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UInsimulDebugComponent::BeginPlay()
{
	Super::BeginPlay();

	UE_LOG(LogTemp, Warning, TEXT("=== INSIMUL DEBUG START ==="));

	// Check if owner has conversation component
	UInsimulConversationComponent* ConvComp = GetOwner()->FindComponentByClass<UInsimulConversationComponent>();
	if (ConvComp)
	{
		UE_LOG(LogTemp, Warning, TEXT("Found InsimulConversationComponent on %s"), *GetOwner()->GetName());
		UE_LOG(LogTemp, Warning, TEXT("  - Character ID: %s"), *ConvComp->Config.CharacterID);
		UE_LOG(LogTemp, Warning, TEXT("  - World ID: %s"), *ConvComp->Config.WorldID);
		UE_LOG(LogTemp, Warning, TEXT("  - API URL: %s"), *ConvComp->Config.APIBaseUrl);
		UE_LOG(LogTemp, Warning, TEXT("  - Conversation Radius: %f"), ConvComp->Config.ConversationRadius);
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("No InsimulConversationComponent found on %s"), *GetOwner()->GetName());
	}

	// Test API connection
	TestAPIConnection();
}

void UInsimulDebugComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	DrawDebugInfo();
}

void UInsimulDebugComponent::DrawDebugInfo()
{
	if (!GetOwner())
		return;

	// Draw conversation radius
	UInsimulConversationComponent* ConvComp = GetOwner()->FindComponentByClass<UInsimulConversationComponent>();
	if (ConvComp)
	{
		DrawDebugSphere(
			GetWorld(),
			GetOwner()->GetActorLocation(),
			ConvComp->Config.ConversationRadius,
			16,
			FColor::Green,
			false,
			0.0f,
			0,
			1.0f
		);

		// Draw character ID above head
		if (GEngine)
		{
			FVector ScreenPos = GetOwner()->GetActorLocation() + FVector(0, 0, 100);
			GEngine->AddOnScreenDebugMessage(
				-1,
				0.0f,
				FColor::Yellow,
				FString::Printf(TEXT("%s\nID: %s"), *GetOwner()->GetName(), *ConvComp->Config.CharacterID)
			);
		}
	}
}

void UInsimulDebugComponent::TestAPIConnection()
{
	// Simple test to see if we can reach the API
	UE_LOG(LogTemp, Warning, TEXT("Testing API connection to http://localhost:3000..."));

	// This would require HTTP module, but for now just log
	UE_LOG(LogTemp, Warning, TEXT("  - Make sure Insimul server is running: cd /Users/danieldekerlegand/Development/school/insimul && npm run dev"));
	UE_LOG(LogTemp, Warning, TEXT("  - Default port should be 3000"));
	UE_LOG(LogTemp, Warning, TEXT("  - Check browser at http://localhost:3000"));
}
