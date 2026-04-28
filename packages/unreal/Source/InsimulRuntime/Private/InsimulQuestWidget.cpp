// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulQuestWidget.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UInsimulQuestWidget::NativeConstruct()
{
	Super::NativeConstruct();

	UE_LOG(LogTemp, Log, TEXT("InsimulQuestWidget constructed"));
}

void UInsimulQuestWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);

	// Auto-refresh if enabled
	if (bAutoRefresh && !bIsLoadingQuests)
	{
		TimeSinceLastRefresh += InDeltaTime;

		if (TimeSinceLastRefresh >= RefreshInterval)
		{
			TimeSinceLastRefresh = 0.0f;
			RefreshQuests();
		}
	}
}

void UInsimulQuestWidget::LoadQuestsForCharacter(const FString& CharacterId)
{
	if (CharacterId.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("Cannot load quests: Character ID is empty"));
		return;
	}

	CurrentCharacterId = CharacterId;
	CurrentPlayerName.Empty();

	UE_LOG(LogTemp, Log, TEXT("Loading quests for character: %s"), *CharacterId);

	FHttpModule* Http = &FHttpModule::Get();
	TSharedRef<IHttpRequest> Request = Http->CreateRequest();

	FString URL = FString::Printf(TEXT("%s/api/quests/character/%s"), *InsimulServerURL, *CharacterId);
	Request->SetURL(URL);
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	Request->OnProcessRequestComplete().BindUObject(this, &UInsimulQuestWidget::OnQuestsLoadedInternal);

	bIsLoadingQuests = true;
	Request->ProcessRequest();
}

void UInsimulQuestWidget::LoadQuestsForPlayer(const FString& PlayerName)
{
	if (PlayerName.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("Cannot load quests: Player name is empty"));
		return;
	}

	CurrentPlayerName = PlayerName;
	CurrentCharacterId.Empty();

	UE_LOG(LogTemp, Log, TEXT("Loading quests for player: %s"), *PlayerName);

	FHttpModule* Http = &FHttpModule::Get();
	TSharedRef<IHttpRequest> Request = Http->CreateRequest();

	FString URL = FString::Printf(TEXT("%s/api/quests/player/%s"), *InsimulServerURL, *PlayerName);
	Request->SetURL(URL);
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	Request->OnProcessRequestComplete().BindUObject(this, &UInsimulQuestWidget::OnQuestsLoadedInternal);

	bIsLoadingQuests = true;
	Request->ProcessRequest();
}

void UInsimulQuestWidget::RefreshQuests()
{
	if (bIsLoadingQuests)
	{
		return;
	}

	if (!CurrentCharacterId.IsEmpty())
	{
		LoadQuestsForCharacter(CurrentCharacterId);
	}
	else if (!CurrentPlayerName.IsEmpty())
	{
		LoadQuestsForPlayer(CurrentPlayerName);
	}
}

void UInsimulQuestWidget::SetServerURL(const FString& URL)
{
	InsimulServerURL = URL;
	UE_LOG(LogTemp, Log, TEXT("Quest widget server URL set to: %s"), *InsimulServerURL);
}

void UInsimulQuestWidget::OnQuestsLoadedInternal(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	bIsLoadingQuests = false;

	if (!bWasSuccessful || !Response.IsValid())
	{
		FString ErrorMsg = TEXT("Failed to load quests: Network error");
		UE_LOG(LogTemp, Error, TEXT("%s"), *ErrorMsg);
		OnQuestLoadFailed(ErrorMsg);
		return;
	}

	if (Response->GetResponseCode() != 200)
	{
		FString ErrorMsg = FString::Printf(TEXT("Failed to load quests: HTTP %d"), Response->GetResponseCode());
		UE_LOG(LogTemp, Error, TEXT("%s"), *ErrorMsg);
		OnQuestLoadFailed(ErrorMsg);
		return;
	}

	FString ResponseString = Response->GetContentAsString();
	ParseQuestsFromJSON(ResponseString);
}

void UInsimulQuestWidget::ParseQuestsFromJSON(const FString& JSONString)
{
	TSharedPtr<FJsonValue> JsonValue;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JSONString);

	if (!FJsonSerializer::Deserialize(Reader, JsonValue) || !JsonValue.IsValid())
	{
		FString ErrorMsg = TEXT("Failed to parse quest JSON");
		UE_LOG(LogTemp, Error, TEXT("%s"), *ErrorMsg);
		OnQuestLoadFailed(ErrorMsg);
		return;
	}

	LoadedQuests.Empty();

	const TArray<TSharedPtr<FJsonValue>>* QuestsArray;
	if (JsonValue->TryGetArray(QuestsArray))
	{
		for (const TSharedPtr<FJsonValue>& QuestValue : *QuestsArray)
		{
			if (QuestValue->Type == EJson::Object)
			{
				TSharedPtr<FJsonObject> QuestObj = QuestValue->AsObject();

				FInsimulQuest Quest;
				Quest.Id = QuestObj->GetStringField(TEXT("id"));
				Quest.Title = QuestObj->GetStringField(TEXT("title"));
				Quest.Description = QuestObj->GetStringField(TEXT("description"));
				Quest.QuestType = QuestObj->GetStringField(TEXT("questType"));
				Quest.Difficulty = QuestObj->GetStringField(TEXT("difficulty"));
				Quest.Status = QuestObj->GetStringField(TEXT("status"));
				Quest.TargetLanguage = QuestObj->GetStringField(TEXT("targetLanguage"));
				Quest.AssignedBy = QuestObj->HasField(TEXT("assignedBy")) ? QuestObj->GetStringField(TEXT("assignedBy")) : TEXT("Unknown");
				Quest.ExperienceReward = QuestObj->HasField(TEXT("experienceReward")) ? (int32)QuestObj->GetNumberField(TEXT("experienceReward")) : 0;
				Quest.AssignedAt = QuestObj->HasField(TEXT("assignedAt")) ? QuestObj->GetStringField(TEXT("assignedAt")) : TEXT("");
				Quest.CompletedAt = QuestObj->HasField(TEXT("completedAt")) ? QuestObj->GetStringField(TEXT("completedAt")) : TEXT("");

				LoadedQuests.Add(Quest);
			}
		}

		UE_LOG(LogTemp, Log, TEXT("Loaded %d quests"), LoadedQuests.Num());
		OnQuestsLoaded(LoadedQuests);
	}
	else
	{
		FString ErrorMsg = TEXT("Invalid quest JSON format");
		UE_LOG(LogTemp, Error, TEXT("%s"), *ErrorMsg);
		OnQuestLoadFailed(ErrorMsg);
	}
}

TArray<FInsimulQuest> UInsimulQuestWidget::GetActiveQuests() const
{
	TArray<FInsimulQuest> ActiveQuests;

	for (const FInsimulQuest& Quest : LoadedQuests)
	{
		if (Quest.Status.Equals(TEXT("active"), ESearchCase::IgnoreCase))
		{
			ActiveQuests.Add(Quest);
		}
	}

	return ActiveQuests;
}

TArray<FInsimulQuest> UInsimulQuestWidget::GetCompletedQuests() const
{
	TArray<FInsimulQuest> CompletedQuests;

	for (const FInsimulQuest& Quest : LoadedQuests)
	{
		if (Quest.Status.Equals(TEXT("completed"), ESearchCase::IgnoreCase))
		{
			CompletedQuests.Add(Quest);
		}
	}

	return CompletedQuests;
}

// ============================================================================
// UInsimulQuestBlueprintLibrary Implementation
// ============================================================================

FLinearColor UInsimulQuestBlueprintLibrary::GetQuestStatusColor(const FString& Status)
{
	if (Status.Equals(TEXT("active"), ESearchCase::IgnoreCase))
	{
		return FLinearColor::Yellow;
	}
	else if (Status.Equals(TEXT("completed"), ESearchCase::IgnoreCase))
	{
		return FLinearColor::Green;
	}
	else if (Status.Equals(TEXT("failed"), ESearchCase::IgnoreCase))
	{
		return FLinearColor::Red;
	}
	else if (Status.Equals(TEXT("abandoned"), ESearchCase::IgnoreCase))
	{
		return FLinearColor::Gray;
	}

	return FLinearColor::White;
}

FLinearColor UInsimulQuestBlueprintLibrary::GetQuestDifficultyColor(const FString& Difficulty)
{
	if (Difficulty.Equals(TEXT("beginner"), ESearchCase::IgnoreCase))
	{
		return FLinearColor(0.0f, 1.0f, 0.0f); // Green
	}
	else if (Difficulty.Equals(TEXT("intermediate"), ESearchCase::IgnoreCase))
	{
		return FLinearColor(1.0f, 1.0f, 0.0f); // Yellow
	}
	else if (Difficulty.Equals(TEXT("advanced"), ESearchCase::IgnoreCase))
	{
		return FLinearColor(1.0f, 0.5f, 0.0f); // Orange
	}
	else if (Difficulty.Equals(TEXT("expert"), ESearchCase::IgnoreCase))
	{
		return FLinearColor(1.0f, 0.0f, 0.0f); // Red
	}

	return FLinearColor::White;
}

FString UInsimulQuestBlueprintLibrary::GetQuestTypeIcon(const FString& QuestType)
{
	if (QuestType.Equals(TEXT("conversation"), ESearchCase::IgnoreCase))
	{
		return TEXT("\xF0\x9F\x92\xAC");
	}
	else if (QuestType.Equals(TEXT("translation"), ESearchCase::IgnoreCase))
	{
		return TEXT("\xF0\x9F\x93\x9D");
	}
	else if (QuestType.Equals(TEXT("vocabulary"), ESearchCase::IgnoreCase))
	{
		return TEXT("\xF0\x9F\x93\x96");
	}
	else if (QuestType.Equals(TEXT("grammar"), ESearchCase::IgnoreCase))
	{
		return TEXT("\xF0\x9F\x93\x90");
	}
	else if (QuestType.Equals(TEXT("cultural"), ESearchCase::IgnoreCase))
	{
		return TEXT("\xF0\x9F\x8C\x8D");
	}

	return TEXT("\xF0\x9F\x93\x9C");
}

FString UInsimulQuestBlueprintLibrary::FormatQuestDescription(const FString& Description, int32 MaxLength)
{
	if (Description.Len() <= MaxLength)
	{
		return Description;
	}

	return Description.Left(MaxLength - 3) + TEXT("...");
}
