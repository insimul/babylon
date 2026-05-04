#include "InsimulSkillTreePanel.h"
#include "Blueprint/WidgetTree.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/TextBlock.h"
#include "Components/Button.h"
#include "Components/ScrollBox.h"
#include "Components/Border.h"

void UInsimulSkillTreePanel::NativeConstruct()
{
    Super::NativeConstruct();
    PopulateSkills();
    BuildLayout();
    SetVisibility(ESlateVisibility::Collapsed);
}

void UInsimulSkillTreePanel::TogglePanel()
{
    bIsOpen = !bIsOpen;
    SetVisibility(bIsOpen ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
    if (bIsOpen) RefreshTree();
}

void UInsimulSkillTreePanel::PopulateSkills()
{
    AllSkills.Empty();

    // Tier 1: Novice (0 XP)
    AllSkills.Add({ TEXT("Basic Greetings"),    TEXT("Learn hello/goodbye in target language"),           1, 0,    true });
    AllSkills.Add({ TEXT("Number Basics"),       TEXT("Count 1-10"),                                      1, 0,    true });
    AllSkills.Add({ TEXT("Simple Questions"),    TEXT("Ask yes/no questions"),                             1, 50,   false });

    // Tier 2: Beginner (100 XP)
    AllSkills.Add({ TEXT("Food Vocabulary"),     TEXT("Name common foods and drinks"),                    2, 100,  false });
    AllSkills.Add({ TEXT("Direction Words"),     TEXT("Left, right, straight, turn"),                     2, 150,  false });
    AllSkills.Add({ TEXT("Past Tense"),          TEXT("Describe things that happened"),                   2, 200,  false });

    // Tier 3: Intermediate (400 XP)
    AllSkills.Add({ TEXT("Complex Sentences"),   TEXT("Connect ideas with conjunctions"),                 3, 400,  false });
    AllSkills.Add({ TEXT("Storytelling"),        TEXT("Narrate events in sequence"),                      3, 500,  false });
    AllSkills.Add({ TEXT("Formal Speech"),       TEXT("Use polite forms and honorifics"),                 3, 600,  false });

    // Tier 4: Advanced (1000 XP)
    AllSkills.Add({ TEXT("Idiomatic Expressions"), TEXT("Use natural colloquial phrases"),                4, 1000, false });
    AllSkills.Add({ TEXT("Debate Skills"),       TEXT("Present and defend arguments"),                    4, 1200, false });

    // Tier 5: Mastery (2500 XP)
    AllSkills.Add({ TEXT("Cultural Fluency"),    TEXT("Understand cultural nuances and humor"),           5, 2500, false });
}

void UInsimulSkillTreePanel::BuildLayout()
{
    if (!WidgetTree) return;

    UScrollBox* Scroll = WidgetTree->ConstructWidget<UScrollBox>(UScrollBox::StaticClass());
    WidgetTree->RootWidget = Scroll;

    // Title
    UTextBlock* Title = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
    Title->SetText(FText::FromString(TEXT("SKILL TREE")));
    FSlateFontInfo TitleFont = Title->GetFont();
    TitleFont.Size = 28;
    Title->SetFont(TitleFont);
    Title->SetColorAndOpacity(FSlateColor(FLinearColor(0.9f, 0.85f, 0.5f)));
    Scroll->AddChild(Title);

    // Tier colors
    static const FLinearColor TierColors[] = {
        FLinearColor(0.3f, 0.6f, 0.3f),  // Tier 1: Green
        FLinearColor(0.3f, 0.5f, 0.7f),  // Tier 2: Blue
        FLinearColor(0.6f, 0.4f, 0.7f),  // Tier 3: Purple
        FLinearColor(0.7f, 0.5f, 0.2f),  // Tier 4: Gold
        FLinearColor(0.8f, 0.3f, 0.3f),  // Tier 5: Red
    };

    static const FString TierNames[] = {
        TEXT("Novice"), TEXT("Beginner"), TEXT("Intermediate"), TEXT("Advanced"), TEXT("Mastery")
    };

    for (int32 Tier = 1; Tier <= 5; Tier++)
    {
        TArray<SkillNode> TierSkills = GetSkillsForTier(Tier);
        if (TierSkills.Num() == 0) continue;

        // Tier header
        UTextBlock* TierHeader = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
        TierHeader->SetText(FText::FromString(FString::Printf(TEXT("── Tier %d: %s ──"), Tier, *TierNames[Tier - 1])));
        FSlateFontInfo HeaderFont = TierHeader->GetFont();
        HeaderFont.Size = 20;
        TierHeader->SetFont(HeaderFont);
        TierHeader->SetColorAndOpacity(FSlateColor(TierColors[Tier - 1]));
        Scroll->AddChild(TierHeader);

        // Skill nodes
        for (const SkillNode& Skill : TierSkills)
        {
            UHorizontalBox* Row = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass());
            Scroll->AddChild(Row);

            // Status indicator
            UTextBlock* Status = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
            Status->SetText(FText::FromString(Skill.bUnlocked ? TEXT("[*]") : TEXT("[ ]")));
            Status->SetColorAndOpacity(FSlateColor(Skill.bUnlocked ? FLinearColor::Green : FLinearColor(0.4f, 0.4f, 0.4f)));
            Row->AddChildToHorizontalBox(Status);

            // Skill name
            UTextBlock* NameText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
            NameText->SetText(FText::FromString(FString::Printf(TEXT("  %s (%d XP)"), *Skill.Name, Skill.XPRequired)));
            NameText->SetColorAndOpacity(FSlateColor(Skill.bUnlocked ? FLinearColor::White : FLinearColor(0.5f, 0.5f, 0.5f)));
            Row->AddChildToHorizontalBox(NameText);
        }
    }
}

void UInsimulSkillTreePanel::RefreshTree()
{
    // Re-build layout to reflect any XP changes
    if (WidgetTree && WidgetTree->RootWidget)
    {
        WidgetTree->RootWidget = nullptr;
    }
    BuildLayout();
}

TArray<UInsimulSkillTreePanel::SkillNode> UInsimulSkillTreePanel::GetSkillsForTier(int32 Tier) const
{
    TArray<SkillNode> Result;
    for (const SkillNode& S : AllSkills)
    {
        if (S.Tier == Tier) Result.Add(S);
    }
    return Result;
}
