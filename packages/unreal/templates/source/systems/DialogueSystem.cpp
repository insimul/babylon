#include "DialogueSystem.h"
#include "InsimulConversationComponent.h"
#include "InsimulSettings.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

void UDialogueSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LoadDialogueData();
    LoadSocialActions();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] DialogueSystem initialized"));
}

void UDialogueSystem::Deinitialize()
{
    Super::Deinitialize();
}

void UDialogueSystem::LoadDialogueData()
{
    // Dialogue contexts and AI configuration are handled by the Insimul plugin.
    // The plugin reads from UInsimulSettings (Project Settings > Plugins > Insimul)
    // and loads world data from Content/InsimulData/world_export.json when using
    // local LLM mode, or fetches from the server in server mode.
    //
    // The old InsimulAIService is no longer used — the plugin's
    // UInsimulConversationComponent handles all conversation logic.

    // Load dialogue contexts for the game UI (greetings, available NPCs)
    FString ContextsPath = FPaths::ProjectContentDir() / TEXT("Data/DT_DialogueContexts.json");
    FString ContextsJson;
    if (FFileHelper::LoadFileToString(ContextsJson, *ContextsPath))
    {
        TArray<TSharedPtr<FJsonValue>> ContextsArray;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ContextsJson);
        if (FJsonSerializer::Deserialize(Reader, ContextsArray))
        {
            for (const auto& Val : ContextsArray)
            {
                auto Obj = Val->AsObject();
                if (!Obj) continue;

                FInsimulDialogueContext Ctx;
                Ctx.CharacterId = Obj->GetStringField(TEXT("characterId"));
                Ctx.CharacterName = Obj->GetStringField(TEXT("characterName"));
                Ctx.SystemPrompt = Obj->GetStringField(TEXT("systemPrompt"));
                Ctx.Greeting = Obj->GetStringField(TEXT("greeting"));
                Ctx.Voice = Obj->GetStringField(TEXT("voice"));

                const TArray<TSharedPtr<FJsonValue>>* TruthsArr;
                if (Obj->TryGetArrayField(TEXT("truths"), TruthsArr))
                {
                    for (const auto& TruthVal : *TruthsArr)
                    {
                        auto TruthObj = TruthVal->AsObject();
                        if (!TruthObj) continue;
                        FInsimulDialogueTruth Truth;
                        Truth.Title = TruthObj->GetStringField(TEXT("title"));
                        Truth.Content = TruthObj->GetStringField(TEXT("content"));
                        Ctx.Truths.Add(Truth);
                    }
                }

                DialogueContexts.Add(Ctx);
            }
            UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d dialogue contexts for UI"), DialogueContexts.Num());
        }
    }

    // The Insimul plugin handles actual conversation routing —
    // UInsimulConversationComponent is attached to each NPC via InsimulAICharacter/InsimulSpawner.
    const UInsimulSettings* Settings = UInsimulSettings::Get();
    if (Settings)
    {
        UE_LOG(LogTemp, Log, TEXT("[Insimul] Plugin configured — Chat: %s, World: %s"),
            Settings->IsOfflineMode() ? TEXT("Local") : TEXT("Server"),
            *Settings->DefaultWorldID);
    }
}

void UDialogueSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    UE_LOG(LogTemp, Log, TEXT("[Insimul] DialogueSystem loaded from IR"));
}

void UDialogueSystem::StartDialogue(const FString& NPCCharacterId)
{
    if (bIsInDialogue)
    {
        EndDialogue();
    }

    bIsInDialogue = true;
    CurrentNPCId = NPCCharacterId;
    OnDialogueStarted.Broadcast(NPCCharacterId);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] StartDialogue with NPC: %s"), *NPCCharacterId);
}

void UDialogueSystem::EndDialogue()
{
    FString PrevNPCId = CurrentNPCId;
    bIsInDialogue = false;
    CurrentNPCId = TEXT("");
    OnDialogueEnded.Broadcast();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] EndDialogue with NPC: %s"), *PrevNPCId);
}

void UDialogueSystem::SetPlayerEnergy(float Energy)
{
    PlayerEnergy = FMath::Max(0.0f, Energy);
}

TArray<FString> UDialogueSystem::GetAvailableActions()
{
    TArray<FString> AvailableActions;

    if (!bIsInDialogue)
    {
        return AvailableActions;
    }

    for (const auto& ActionObj : SocialActions)
    {
        if (!ActionObj.IsValid()) continue;

        float EnergyCost = 0.0f;
        if (ActionObj->HasField(TEXT("energyCost")))
        {
            EnergyCost = ActionObj->GetNumberField(TEXT("energyCost"));
        }

        // Filter by affordability — include actions with no cost or affordable cost
        if (EnergyCost <= 0.0f || EnergyCost <= PlayerEnergy)
        {
            FString ActionId = ActionObj->GetStringField(TEXT("id"));
            AvailableActions.Add(ActionId);
        }
    }

    return AvailableActions;
}

void UDialogueSystem::LoadSocialActions()
{
    FString ActionsPath = FPaths::ProjectContentDir() / TEXT("Data/actions.json");
    FString ActionsJson;
    if (!FFileHelper::LoadFileToString(ActionsJson, *ActionsPath))
    {
        return;
    }

    TArray<TSharedPtr<FJsonValue>> ActionsArray;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ActionsJson);
    if (!FJsonSerializer::Deserialize(Reader, ActionsArray))
    {
        return;
    }

    for (const auto& Val : ActionsArray)
    {
        auto Obj = Val->AsObject();
        if (!Obj) continue;

        FString Category = Obj->GetStringField(TEXT("category"));
        if (Category == TEXT("social") || Category == TEXT("dialogue"))
        {
            SocialActions.Add(Obj);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Loaded %d social/dialogue actions"), SocialActions.Num());
}

FInsimulDialogueContext UDialogueSystem::GetDialogueContext(const FString& CharacterId) const
{
    for (const auto& Ctx : DialogueContexts)
    {
        if (Ctx.CharacterId == CharacterId)
        {
            return Ctx;
        }
    }
    return FInsimulDialogueContext();
}

FString UDialogueSystem::GetNPCGreeting(const FString& CharacterId) const
{
    FInsimulDialogueContext Ctx = GetDialogueContext(CharacterId);
    return Ctx.Greeting.IsEmpty() ? TEXT("Hello there.") : Ctx.Greeting;
}

bool UDialogueSystem::IsRomanceAction(const FString& ActionId) const
{
    for (const auto& Obj : SocialActions)
    {
        if (!Obj.IsValid()) continue;
        if (Obj->GetStringField(TEXT("id")) == ActionId)
        {
            FString Category = Obj->GetStringField(TEXT("category"));
            return Category == TEXT("romance") || ActionId.Contains(TEXT("romance"));
        }
    }
    return false;
}
