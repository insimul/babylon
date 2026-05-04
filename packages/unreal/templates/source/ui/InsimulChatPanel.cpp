#include "InsimulChatPanel.h"
#include "Components/TextBlock.h"
#include "Components/ScrollBox.h"
#include "Components/EditableTextBox.h"
#include "Components/Image.h"
#include "Components/Button.h"
#include "Components/VerticalBox.h"
#include "Components/Spacer.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "TimerManager.h"

void UInsimulChatPanel::NativeConstruct()
{
    Super::NativeConstruct();

    if (SendButton)
    {
        SendButton->OnClicked.AddDynamic(this, &UInsimulChatPanel::OnSendClicked);
    }

    if (MessageInputBox)
    {
        MessageInputBox->OnTextCommitted.AddDynamic(this, &UInsimulChatPanel::OnInputCommitted);
    }

    if (AskAboutQuestButton)
    {
        AskAboutQuestButton->OnClicked.AddDynamic(this, &UInsimulChatPanel::OnAskAboutQuestClicked);
    }

    if (TradeButton)
    {
        TradeButton->OnClicked.AddDynamic(this, &UInsimulChatPanel::OnTradeClicked);
    }

    if (RequestHelpButton)
    {
        RequestHelpButton->OnClicked.AddDynamic(this, &UInsimulChatPanel::OnRequestHelpClicked);
    }

    if (SayGoodbyeButton)
    {
        SayGoodbyeButton->OnClicked.AddDynamic(this, &UInsimulChatPanel::OnSayGoodbyeClicked);
    }

    // Start hidden
    SetVisibility(ESlateVisibility::Collapsed);
    HideTypingIndicator();
}

void UInsimulChatPanel::AddMessage(const FString& Speaker, const FString& Text, bool bIsPlayer)
{
    FDialogueMessage NewMessage;
    NewMessage.Speaker = Speaker;
    NewMessage.Text = Text;
    NewMessage.bIsPlayer = bIsPlayer;
    NewMessage.Timestamp = FDateTime::Now();

    MessageHistory.Add(NewMessage);

    if (ConversationScrollBox)
    {
        UWidget* MessageWidget = CreateMessageWidget(NewMessage);
        if (MessageWidget)
        {
            ConversationScrollBox->AddChild(MessageWidget);

            // Add spacing between messages
            USpacer* Spacer = NewObject<USpacer>(ConversationScrollBox);
            Spacer->SetSize(FVector2D(0.0f, 4.0f));
            ConversationScrollBox->AddChild(Spacer);

            // Auto-scroll to bottom
            ConversationScrollBox->ScrollToEnd();
        }
    }
}

void UInsimulChatPanel::ClearHistory()
{
    MessageHistory.Empty();

    if (ConversationScrollBox)
    {
        ConversationScrollBox->ClearChildren();
    }
}

TArray<FInsimulConversationTurn> UInsimulChatPanel::GetTranscriptForGrading() const
{
    TArray<FInsimulConversationTurn> Turns;
    Turns.Reserve(MessageHistory.Num());
    for (const FDialogueMessage& Msg : MessageHistory)
    {
        FInsimulConversationTurn Turn;
        Turn.Role = Msg.bIsPlayer ? TEXT("user") : TEXT("assistant");
        Turn.Content = Msg.Text;
        Turns.Add(Turn);
    }
    return Turns;
}

void UInsimulChatPanel::SetNPCInfo(const FString& Name, UTexture2D* Portrait, const FString& WorldId, const FString& Gender)
{
    CurrentNPCId = Name; // Use name as ID for NPC conversation tracking
    CurrentWorldId = WorldId;
    CurrentCharacterGender = Gender;

    if (NPCNameText)
    {
        NPCNameText->SetText(FText::FromString(Name));
    }

    if (NPCPortraitImage && Portrait)
    {
        NPCPortraitImage->SetBrushFromTexture(Portrait);
        NPCPortraitImage->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
    }
    else if (NPCPortraitImage)
    {
        NPCPortraitImage->SetVisibility(ESlateVisibility::Collapsed);
    }
}

void UInsimulChatPanel::ShowTypingIndicator()
{
    bTypingIndicatorVisible = true;
    TypingDotCount = 0;

    if (TypingIndicatorText)
    {
        TypingIndicatorText->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
        TypingIndicatorText->SetText(FText::FromString(TEXT("...")));
    }

    // Start animation timer
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().SetTimer(
            TypingAnimTimerHandle,
            FTimerDelegate::CreateUObject(this, &UInsimulChatPanel::AnimateTypingDots),
            0.4f,
            true
        );
    }
}

void UInsimulChatPanel::HideTypingIndicator()
{
    bTypingIndicatorVisible = false;

    if (TypingIndicatorText)
    {
        TypingIndicatorText->SetVisibility(ESlateVisibility::Collapsed);
    }

    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(TypingAnimTimerHandle);
    }
}

void UInsimulChatPanel::SetQuestBridge(UObject* Bridge)
{
    QuestBridge = Bridge;
}

void UInsimulChatPanel::SetGameEventBus(UObject* EventBus)
{
    GameEventBus = EventBus;
}

void UInsimulChatPanel::SetAppearanceProvider(const FInsimulAppearanceProvider& Provider)
{
    AppearanceProvider = Provider;
}

void UInsimulChatPanel::SetPronunciationQuestActive(bool bActive)
{
    bPronunciationQuestActive = bActive;
    UE_LOG(LogTemp, Log, TEXT("[InsimulChatPanel] Pronunciation quest active: %s"), bActive ? TEXT("true") : TEXT("false"));
}

void UInsimulChatPanel::UpdateDialogueActions(float PlayerEnergy)
{
    // Re-evaluate action availability based on updated energy
    // Implementation depends on the action button widgets created by SetDialogueActions
    UE_LOG(LogTemp, Verbose, TEXT("[InsimulChatPanel] Updating dialogue actions with energy: %.1f"), PlayerEnergy);
}

void UInsimulChatPanel::SetQuestOfferingContext(UObject* Context)
{
    QuestOfferingContext = Context;
}

void UInsimulChatPanel::SetActiveQuestFromNPC(UObject* Context)
{
    ActiveQuestFromNPC = Context;
}

void UInsimulChatPanel::SetQuestGuidancePrompt(const FString& Prompt)
{
    QuestGuidancePromptText = Prompt;
}

void UInsimulChatPanel::TriggerQuestGuidanceGreeting()
{
    if (!QuestGuidancePromptText.IsEmpty())
    {
        AddMessage(TEXT("NPC"), QuestGuidancePromptText, false);
    }
}

void UInsimulChatPanel::OnResponseChunk(const FString& Chunk)
{
    FullResponse += Chunk;
    OnNPCSpeechUpdate.Broadcast(FullResponse);
}

void UInsimulChatPanel::StartTypewriterEffect(const FString& Text, float CharsPerSecond)
{
    TypewriterFullText = Text;
    TypewriterCharIndex = 0;
    TypewriterSpeed = FMath::Max(CharsPerSecond, 1.f);

    // Clear any existing typewriter timer
    if (UWorld* World = GetWorld())
    {
        World->GetTimerManager().ClearTimer(TypewriterTimerHandle);

        float Interval = 1.f / TypewriterSpeed;
        World->GetTimerManager().SetTimer(
            TypewriterTimerHandle,
            FTimerDelegate::CreateUObject(this, &UInsimulChatPanel::AdvanceTypewriter),
            Interval,
            true
        );
    }
}

void UInsimulChatPanel::AdvanceTypewriter()
{
    if (TypewriterCharIndex >= TypewriterFullText.Len())
    {
        // Typewriter complete
        if (UWorld* World = GetWorld())
        {
            World->GetTimerManager().ClearTimer(TypewriterTimerHandle);
        }
        return;
    }

    TypewriterCharIndex++;
    FString VisibleText = TypewriterFullText.Left(TypewriterCharIndex);
    OnNPCSpeechUpdate.Broadcast(VisibleText);
}

void UInsimulChatPanel::SetVoiceInputEnabled(bool bEnabled)
{
    bVoiceInputEnabled = bEnabled;
    UE_LOG(LogTemp, Log, TEXT("[InsimulChatPanel] Voice input enabled: %s"), bEnabled ? TEXT("true") : TEXT("false"));
}

void UInsimulChatPanel::OnWorldDataLoaded()
{
    // Re-set character on the AI service so the system prompt is rebuilt with
    // world language context that may not have been available at SetNPCInfo time.
    if (CurrentNPCId.IsEmpty()) return;

    UE_LOG(LogTemp, Log, TEXT("[InsimulChatPanel] World data loaded — re-initializing character '%s' with gender '%s'"),
        *CurrentNPCId, *CurrentCharacterGender);

    // Notify the AI service to rebuild its system prompt with the new world context.
    // The AI service should implement SetCharacter(NPCId, WorldId, Gender).
}

void UInsimulChatPanel::ShowPanel()
{
    bPanelVisible = true;
    SetVisibility(ESlateVisibility::SelfHitTestInvisible);

    // Track per-NPC conversation count for friendship/rapport objectives
    if (!CurrentNPCId.IsEmpty())
    {
        int32& Count = NPCConversationCounts.FindOrAdd(CurrentNPCId, 0);
        Count++;

        // Normalize: 5 conversations = max rapport (1.0)
        const float NewStrength = FMath::Min(static_cast<float>(Count) / 5.0f, 1.0f);
        OnNPCRelationshipChanged.Broadcast(CurrentNPCId, NewStrength);

        UE_LOG(LogTemp, Verbose, TEXT("[InsimulChatPanel] NPC '%s' conversation count: %d, rapport: %.2f"),
            *CurrentNPCId, Count, NewStrength);
    }

    // Play fade-in animation if available
    if (UWidgetAnimation* FadeIn = nullptr; false)
    {
        PlayAnimation(FadeIn);
    }
    else
    {
        SetRenderOpacity(1.0f);
    }

    UE_LOG(LogTemp, Log, TEXT("[InsimulChatPanel] Panel shown"));
}

void UInsimulChatPanel::HidePanel()
{
    bPanelVisible = false;

    // Play fade-out then collapse
    SetRenderOpacity(0.0f);
    SetVisibility(ESlateVisibility::Collapsed);

    HideTypingIndicator();

    UE_LOG(LogTemp, Log, TEXT("[InsimulChatPanel] Panel hidden"));
}

void UInsimulChatPanel::OnSendClicked()
{
    SendCurrentMessage();
}

void UInsimulChatPanel::OnInputCommitted(const FText& Text, ETextCommit::Type CommitMethod)
{
    if (CommitMethod != ETextCommit::OnEnter) return;
    SendCurrentMessage();
}

void UInsimulChatPanel::OnAskAboutQuestClicked()
{
    OnPlayerMessageSent.Broadcast(TEXT("/ask_quest"));
}

void UInsimulChatPanel::OnTradeClicked()
{
    OnPlayerMessageSent.Broadcast(TEXT("/trade"));
}

void UInsimulChatPanel::OnRequestHelpClicked()
{
    OnPlayerMessageSent.Broadcast(TEXT("/request_help"));
}

void UInsimulChatPanel::OnSayGoodbyeClicked()
{
    OnPlayerMessageSent.Broadcast(TEXT("/goodbye"));
    HidePanel();
}

void UInsimulChatPanel::SendCurrentMessage()
{
    if (!MessageInputBox) return;

    FString Message = MessageInputBox->GetText().ToString().TrimStartAndEnd();
    if (Message.IsEmpty()) return;

    // Increment conversation turn counter
    ConversationTurnCount++;

    // Reset streaming accumulator for new response
    FullResponse = TEXT("");

    // Add player message to history
    AddMessage(TEXT("You"), Message, true);

    // Resolve NPC visible-appearance description via the registered provider
    // (if any). Empty string when unbound — UInsimulAIService treats that as
    // "no appearance attached" and omits it from the outgoing request.
    FString Appearance;
    if (AppearanceProvider.IsBound() && !CurrentNPCId.IsEmpty())
    {
        Appearance = AppearanceProvider.Execute(CurrentNPCId);
    }

    // Broadcast legacy single-param delegate for existing subscribers.
    OnPlayerMessageSent.Broadcast(Message);

    // Broadcast the appearance-aware variant so game code can forward it to
    // UInsimulAIService::SendMessageWithAppearance.
    OnPlayerMessageWithAppearance.Broadcast(Message, CurrentNPCId, Appearance);

    // Clear input field
    MessageInputBox->SetText(FText::GetEmpty());
}

void UInsimulChatPanel::AnimateTypingDots()
{
    if (!bTypingIndicatorVisible || !TypingIndicatorText) return;

    TypingDotCount = (TypingDotCount % 3) + 1;

    FString Dots;
    for (int32 i = 0; i < TypingDotCount; ++i)
    {
        Dots += TEXT(".");
    }

    TypingIndicatorText->SetText(FText::FromString(Dots));
}

UWidget* UInsimulChatPanel::CreateMessageWidget(const FDialogueMessage& Message)
{
    if (!ConversationScrollBox) return nullptr;

    UHorizontalBox* Row = NewObject<UHorizontalBox>(ConversationScrollBox);

    // Speaker label
    UTextBlock* SpeakerText = NewObject<UTextBlock>(Row);
    SpeakerText->SetText(FText::FromString(FString::Printf(TEXT("%s: "), *Message.Speaker)));
    FSlateFontInfo SpeakerFont = SpeakerText->GetFont();
    SpeakerFont.Size = 13;
    SpeakerText->SetFont(SpeakerFont);

    if (Message.bIsPlayer)
    {
        SpeakerText->SetColorAndOpacity(FSlateColor(FLinearColor(0.6f, 0.8f, 1.0f)));
    }
    else
    {
        SpeakerText->SetColorAndOpacity(FSlateColor(FLinearColor(1.0f, 0.85f, 0.4f)));
    }

    UHorizontalBoxSlot* SpeakerSlot = Row->AddChildToHorizontalBox(SpeakerText);
    SpeakerSlot->SetVerticalAlignment(VAlign_Top);
    SpeakerSlot->SetAutoSize(true);

    // Message text
    UTextBlock* MsgText = NewObject<UTextBlock>(Row);
    MsgText->SetText(FText::FromString(Message.Text));
    FSlateFontInfo MsgFont = MsgText->GetFont();
    MsgFont.Size = 13;
    MsgText->SetFont(MsgFont);
    MsgText->SetAutoWrapText(true);
    MsgText->SetColorAndOpacity(FSlateColor(FLinearColor::White));

    UHorizontalBoxSlot* MsgSlot = Row->AddChildToHorizontalBox(MsgText);
    MsgSlot->SetVerticalAlignment(VAlign_Top);
    MsgSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));

    return Row;
}
