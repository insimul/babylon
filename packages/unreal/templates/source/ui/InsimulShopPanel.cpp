#include "InsimulShopPanel.h"
#include "Blueprint/WidgetTree.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/TextBlock.h"
#include "Components/Button.h"
#include "Components/ScrollBox.h"
#include "Components/Border.h"

void UInsimulShopPanel::NativeConstruct()
{
    Super::NativeConstruct();
    BuildLayout();
    SetVisibility(ESlateVisibility::Collapsed);
}

void UInsimulShopPanel::BuildLayout()
{
    if (!WidgetTree) return;

    // Root horizontal box: merchant | controls | player
    UHorizontalBox* Root = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
    WidgetTree->RootWidget = Root;

    // ── Merchant side ──
    UVerticalBox* MerchantPanel = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
    UHorizontalBoxSlot* MerchSlot = Root->AddChildToHorizontalBox(MerchantPanel);
    MerchSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));

    MerchantNameText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    MerchantNameText->SetText(FText::FromString(TEXT("Merchant")));
    FSlateFontInfo MerchFont = MerchantNameText->GetFont();
    MerchFont.Size = 22;
    MerchantNameText->SetFont(MerchFont);
    MerchantPanel->AddChildToVerticalBox(MerchantNameText);

    UScrollBox* MerchScroll = WidgetTree->ConstructWidget<UScrollBox>(UScrollBox::StaticClass());
    MerchantPanel->AddChildToVerticalBox(MerchScroll);

    MerchantList = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
    MerchScroll->AddChild(MerchantList);

    // ── Center controls ──
    UVerticalBox* Controls = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
    UHorizontalBoxSlot* CtrlSlot = Root->AddChildToHorizontalBox(Controls);
    CtrlSlot->SetPadding(FMargin(20.f));

    BuyButton = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass());
    BuyButton->SetBackgroundColor(FLinearColor(0.2f, 0.5f, 0.3f));
    UTextBlock* BuyText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    BuyText->SetText(FText::FromString(TEXT("Buy <<")));
    BuyButton->AddChild(BuyText);
    Controls->AddChildToVerticalBox(BuyButton);
    BuyButton->OnClicked.AddDynamic(this, &UInsimulShopPanel::OnBuyClicked);

    SellButton = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass());
    SellButton->SetBackgroundColor(FLinearColor(0.5f, 0.3f, 0.2f));
    UTextBlock* SellText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    SellText->SetText(FText::FromString(TEXT(">> Sell")));
    SellButton->AddChild(SellText);
    Controls->AddChildToVerticalBox(SellButton);
    SellButton->OnClicked.AddDynamic(this, &UInsimulShopPanel::OnSellClicked);

    GoldText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    GoldText->SetText(FText::FromString(TEXT("Gold: 0")));
    GoldText->SetColorAndOpacity(FSlateColor(FLinearColor(0.9f, 0.8f, 0.2f)));
    Controls->AddChildToVerticalBox(GoldText);

    // ── Player side ──
    UVerticalBox* PlayerPanel = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
    UHorizontalBoxSlot* PlayerSlot = Root->AddChildToHorizontalBox(PlayerPanel);
    PlayerSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));

    UTextBlock* PlayerTitle = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    PlayerTitle->SetText(FText::FromString(TEXT("Your Inventory")));
    FSlateFontInfo PlayerFont = PlayerTitle->GetFont();
    PlayerFont.Size = 22;
    PlayerTitle->SetFont(PlayerFont);
    PlayerPanel->AddChildToVerticalBox(PlayerTitle);

    UScrollBox* PlayerScroll = WidgetTree->ConstructWidget<UScrollBox>(UScrollBox::StaticClass());
    PlayerPanel->AddChildToVerticalBox(PlayerScroll);

    PlayerList = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass());
    PlayerScroll->AddChild(PlayerList);
}

void UInsimulShopPanel::OpenShop(const FString& MerchantId, const FString& MerchantName)
{
    CurrentMerchantId = MerchantId;
    CurrentMerchantName = MerchantName;
    bIsOpen = true;

    if (MerchantNameText)
    {
        MerchantNameText->SetText(FText::FromString(MerchantName));
    }

    RefreshMerchantItems();
    RefreshPlayerItems();
    UpdateGoldDisplay();
    SetVisibility(ESlateVisibility::Visible);
}

void UInsimulShopPanel::CloseShop()
{
    bIsOpen = false;
    SetVisibility(ESlateVisibility::Collapsed);
}

void UInsimulShopPanel::RefreshMerchantItems()
{
    if (!MerchantList) return;
    MerchantList->ClearChildren();

    // Placeholder merchant items — in production, load from MerchantInventory system
    TArray<FString> DemoItems = { TEXT("Bread (5g)"), TEXT("Sword (50g)"), TEXT("Potion (15g)"), TEXT("Map (10g)") };
    for (const FString& Item : DemoItems)
    {
        UTextBlock* ItemText = NewObject<UTextBlock>(MerchantList);
        ItemText->SetText(FText::FromString(Item));
        MerchantList->AddChildToVerticalBox(ItemText);
    }
}

void UInsimulShopPanel::RefreshPlayerItems()
{
    if (!PlayerList) return;
    PlayerList->ClearChildren();

    // Placeholder — bind to InventorySystem in production
    UTextBlock* Empty = NewObject<UTextBlock>(PlayerList);
    Empty->SetText(FText::FromString(TEXT("(inventory items appear here)")));
    Empty->SetColorAndOpacity(FSlateColor(FLinearColor(0.5f, 0.5f, 0.5f)));
    PlayerList->AddChildToVerticalBox(Empty);
}

void UInsimulShopPanel::UpdateGoldDisplay()
{
    if (GoldText)
    {
        GoldText->SetText(FText::FromString(TEXT("Gold: 100"))); // Placeholder
    }
}

void UInsimulShopPanel::OnBuyClicked()
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Buy clicked — merchant: %s"), *CurrentMerchantId);
    RefreshMerchantItems();
    RefreshPlayerItems();
    UpdateGoldDisplay();
}

void UInsimulShopPanel::OnSellClicked()
{
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Sell clicked — merchant: %s"), *CurrentMerchantId);
    RefreshMerchantItems();
    RefreshPlayerItems();
    UpdateGoldDisplay();
}
