// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulQuestManager.h"
#include "InsimulCharacterMappingComponent.h"
#include "Blueprint/UserWidget.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"

// ============================================================================
// UInsimulQuestManager Implementation
// ============================================================================

void UInsimulQuestManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	UE_LOG(LogTemp, Log, TEXT("InsimulQuestManager initialized"));
}

void UInsimulQuestManager::Deinitialize()
{
	if (QuestWidget && QuestWidget->IsInViewport())
	{
		QuestWidget->RemoveFromParent();
	}

	QuestWidget = nullptr;

	Super::Deinitialize();
}

void UInsimulQuestManager::ShowQuestPanel(const FString& CharacterId)
{
	if (CharacterId.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("Cannot show quest panel: Character ID is empty"));
		return;
	}

	CurrentCharacterId = CharacterId;

	// Create widget if it doesn't exist
	if (!QuestWidget)
	{
		CreateQuestWidget();
	}

	if (QuestWidget)
	{
		// Load quests for this character
		QuestWidget->LoadQuestsForCharacter(CharacterId);

		// Add to viewport if not already visible
		if (!QuestWidget->IsInViewport())
		{
			QuestWidget->AddToViewport(10); // High Z-order for UI overlay
		}

		bIsVisible = true;

		UE_LOG(LogTemp, Log, TEXT("Quest panel shown for character: %s"), *CharacterId);
	}
}

void UInsimulQuestManager::HideQuestPanel()
{
	if (QuestWidget && QuestWidget->IsInViewport())
	{
		QuestWidget->RemoveFromParent();
		bIsVisible = false;

		UE_LOG(LogTemp, Log, TEXT("Quest panel hidden"));
	}
}

void UInsimulQuestManager::ToggleQuestPanel()
{
	if (bIsVisible)
	{
		HideQuestPanel();
	}
	else if (!CurrentCharacterId.IsEmpty())
	{
		ShowQuestPanel(CurrentCharacterId);
	}
}

bool UInsimulQuestManager::IsQuestPanelVisible() const
{
	return bIsVisible && QuestWidget && QuestWidget->IsInViewport();
}

void UInsimulQuestManager::ConfigureQuestSystem(const FString& ServerURL, bool bAutoRefresh, float RefreshInterval)
{
	// Create widget if it doesn't exist
	if (!QuestWidget)
	{
		CreateQuestWidget();
	}

	if (QuestWidget)
	{
		QuestWidget->SetServerURL(ServerURL);
		QuestWidget->bAutoRefresh = bAutoRefresh;
		QuestWidget->RefreshInterval = RefreshInterval;

		UE_LOG(LogTemp, Log, TEXT("Quest system configured: Server=%s, AutoRefresh=%d, Interval=%.1f"),
			*ServerURL, bAutoRefresh, RefreshInterval);
	}
}

void UInsimulQuestManager::CreateQuestWidget()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		UE_LOG(LogTemp, Error, TEXT("Cannot create quest widget: No world"));
		return;
	}

	// Use specified widget class or default to base class
	TSubclassOf<UInsimulQuestWidget> WidgetClass = QuestWidgetClass;
	if (!WidgetClass)
	{
		WidgetClass = UInsimulQuestWidget::StaticClass();
		UE_LOG(LogTemp, Warning, TEXT("No QuestWidgetClass specified, using default UInsimulQuestWidget"));
	}

	QuestWidget = CreateWidget<UInsimulQuestWidget>(World, WidgetClass);

	if (QuestWidget)
	{
		// Default configuration
		QuestWidget->SetServerURL(TEXT("http://localhost:8080"));
		QuestWidget->bAutoRefresh = true;
		QuestWidget->RefreshInterval = 5.0f;

		UE_LOG(LogTemp, Log, TEXT("Quest widget created successfully"));
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("Failed to create quest widget"));
	}
}

// ============================================================================
// UInsimulQuestDisplayComponent Implementation
// ============================================================================

UInsimulQuestDisplayComponent::UInsimulQuestDisplayComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UInsimulQuestDisplayComponent::BeginPlay()
{
	Super::BeginPlay();

	if (bAutoShowOnBeginPlay)
	{
		// Get character ID
		FString CharacterId = CharacterIdOverride;

		if (bUseCharacterMapping && CharacterId.IsEmpty())
		{
			// Try to get from character mapping component
			if (UInsimulCharacterMappingComponent* MappingComp = GetOwner()->FindComponentByClass<UInsimulCharacterMappingComponent>())
			{
				CharacterId = MappingComp->InsimulCharacterId;
			}
		}

		if (!CharacterId.IsEmpty())
		{
			// Get quest manager and show panel
			if (UGameInstance* GI = GetWorld()->GetGameInstance())
			{
				if (UInsimulQuestManager* QuestManager = GI->GetSubsystem<UInsimulQuestManager>())
				{
					QuestManager->ShowQuestPanel(CharacterId);
					UE_LOG(LogTemp, Log, TEXT("Auto-showing quest panel for %s"), *GetOwner()->GetName());
				}
			}
		}
		else
		{
			UE_LOG(LogTemp, Warning, TEXT("Cannot auto-show quest panel: No character ID available"));
		}
	}
}

void UInsimulQuestDisplayComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (bAutoHideOnEndPlay)
	{
		if (UGameInstance* GI = GetWorld()->GetGameInstance())
		{
			if (UInsimulQuestManager* QuestManager = GI->GetSubsystem<UInsimulQuestManager>())
			{
				QuestManager->HideQuestPanel();
			}
		}
	}

	Super::EndPlay(EndPlayReason);
}

void UInsimulQuestDisplayComponent::SetQuestPanelVisible(bool bVisible)
{
	if (UGameInstance* GI = GetWorld()->GetGameInstance())
	{
		if (UInsimulQuestManager* QuestManager = GI->GetSubsystem<UInsimulQuestManager>())
		{
			if (bVisible)
			{
				// Get character ID
				FString CharacterId = CharacterIdOverride;
				if (bUseCharacterMapping && CharacterId.IsEmpty())
				{
					if (UInsimulCharacterMappingComponent* MappingComp = GetOwner()->FindComponentByClass<UInsimulCharacterMappingComponent>())
					{
						CharacterId = MappingComp->InsimulCharacterId;
					}
				}

				if (!CharacterId.IsEmpty())
				{
					QuestManager->ShowQuestPanel(CharacterId);
				}
			}
			else
			{
				QuestManager->HideQuestPanel();
			}
		}
	}
}

void UInsimulQuestDisplayComponent::RefreshQuests()
{
	if (UGameInstance* GI = GetWorld()->GetGameInstance())
	{
		if (UInsimulQuestManager* QuestManager = GI->GetSubsystem<UInsimulQuestManager>())
		{
			if (UInsimulQuestWidget* Widget = QuestManager->GetQuestWidget())
			{
				Widget->RefreshQuests();
			}
		}
	}
}

// ============================================================================
// UInsimulQuestHUDComponent Implementation
// ============================================================================

void UInsimulQuestHUDComponent::Initialize(UWorld* World, APlayerController* PlayerController)
{
	CachedWorld = World;
	CachedPlayerController = PlayerController;

	UE_LOG(LogTemp, Log, TEXT("InsimulQuestHUDComponent initialized"));
}

void UInsimulQuestHUDComponent::UpdateForPlayerCharacter()
{
	if (!CachedPlayerController)
	{
		return;
	}

	// Get player's pawn
	APawn* PlayerPawn = CachedPlayerController->GetPawn();
	if (!PlayerPawn)
	{
		return;
	}

	// Try to get character ID from mapping component
	if (UInsimulCharacterMappingComponent* MappingComp = PlayerPawn->FindComponentByClass<UInsimulCharacterMappingComponent>())
	{
		if (!MappingComp->InsimulCharacterId.IsEmpty())
		{
			ShowQuests(MappingComp->InsimulCharacterId);
		}
	}
}

void UInsimulQuestHUDComponent::ShowQuests(const FString& CharacterId)
{
	if (!CachedWorld)
	{
		return;
	}

	// Create widget if needed
	if (!QuestWidget && QuestWidgetClass)
	{
		QuestWidget = CreateWidget<UInsimulQuestWidget>(CachedWorld, QuestWidgetClass);

		if (QuestWidget)
		{
			QuestWidget->SetServerURL(TEXT("http://localhost:8080"));
			QuestWidget->bAutoRefresh = true;
			QuestWidget->RefreshInterval = 5.0f;
		}
	}

	if (QuestWidget)
	{
		QuestWidget->LoadQuestsForCharacter(CharacterId);

		if (!QuestWidget->IsInViewport())
		{
			QuestWidget->AddToViewport(10);
		}
	}
}

void UInsimulQuestHUDComponent::HideQuests()
{
	if (QuestWidget && QuestWidget->IsInViewport())
	{
		QuestWidget->RemoveFromParent();
	}
}

void UInsimulQuestHUDComponent::ToggleQuests()
{
	if (QuestWidget && QuestWidget->IsInViewport())
	{
		HideQuests();
	}
	else
	{
		UpdateForPlayerCharacter();
	}
}
