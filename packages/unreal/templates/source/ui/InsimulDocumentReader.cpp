#include "InsimulDocumentReader.h"
#include "Components/TextBlock.h"
#include "Components/Button.h"

void UInsimulDocumentReader::NativeConstruct()
{
    Super::NativeConstruct();

    if (NextPageButton)
    {
        NextPageButton->OnClicked.AddDynamic(this, &UInsimulDocumentReader::OnNextPageClicked);
    }

    if (PrevPageButton)
    {
        PrevPageButton->OnClicked.AddDynamic(this, &UInsimulDocumentReader::OnPrevPageClicked);
    }

    if (CloseButton)
    {
        CloseButton->OnClicked.AddDynamic(this, &UInsimulDocumentReader::OnCloseClicked);
    }

    // Start hidden
    SetVisibility(ESlateVisibility::Collapsed);
}

void UInsimulDocumentReader::OpenDocument(const FString& Title, const FString& Content, int32 TotalPages)
{
    bIsOpen = true;

    DocumentData.Title = Title;
    DocumentData.Content = Content;
    DocumentData.CurrentPage = 0;
    DocumentData.TotalPages = FMath::Max(TotalPages, 1);

    // Set title
    if (TitleText)
    {
        TitleText->SetText(FText::FromString(Title));
    }

    // Split content into pages
    SplitContentIntoPages(Content, TotalPages);

    // Update actual total pages based on split result
    DocumentData.TotalPages = Pages.Num();

    // Show first page
    UpdatePageDisplay();

    SetVisibility(ESlateVisibility::SelfHitTestInvisible);

    UE_LOG(LogTemp, Log, TEXT("[InsimulDocumentReader] Opened document: '%s' (%d pages)"), *Title, DocumentData.TotalPages);
}

void UInsimulDocumentReader::NextPage()
{
    if (!bIsOpen) return;
    if (DocumentData.CurrentPage >= DocumentData.TotalPages - 1) return;

    DocumentData.CurrentPage++;
    UpdatePageDisplay();
}

void UInsimulDocumentReader::PrevPage()
{
    if (!bIsOpen) return;
    if (DocumentData.CurrentPage <= 0) return;

    DocumentData.CurrentPage--;
    UpdatePageDisplay();
}

void UInsimulDocumentReader::CloseDocument()
{
    if (!bIsOpen) return;

    bIsOpen = false;
    Pages.Empty();

    SetVisibility(ESlateVisibility::Collapsed);

    OnDocumentClosed.Broadcast();

    UE_LOG(LogTemp, Log, TEXT("[InsimulDocumentReader] Document closed"));
}

void UInsimulDocumentReader::OnNextPageClicked()
{
    NextPage();
}

void UInsimulDocumentReader::OnPrevPageClicked()
{
    PrevPage();
}

void UInsimulDocumentReader::OnCloseClicked()
{
    CloseDocument();
}

void UInsimulDocumentReader::SplitContentIntoPages(const FString& Content, int32 RequestedPages)
{
    Pages.Empty();

    if (Content.IsEmpty())
    {
        Pages.Add(TEXT(""));
        return;
    }

    // If the content is short enough for the requested pages, split evenly
    int32 ContentLen = Content.Len();
    int32 EffectiveCharsPerPage = CharsPerPage;

    if (RequestedPages > 1)
    {
        EffectiveCharsPerPage = FMath::CeilToInt(static_cast<float>(ContentLen) / static_cast<float>(RequestedPages));
    }

    int32 StartIndex = 0;
    while (StartIndex < ContentLen)
    {
        int32 EndIndex = FMath::Min(StartIndex + EffectiveCharsPerPage, ContentLen);

        // Try to break at a word boundary (space or newline) if not at the end
        if (EndIndex < ContentLen)
        {
            int32 SearchStart = EndIndex;
            int32 SearchEnd = FMath::Max(StartIndex + (EffectiveCharsPerPage / 2), StartIndex);

            for (int32 j = SearchStart; j >= SearchEnd; --j)
            {
                TCHAR Ch = Content[j];
                if (Ch == TEXT(' ') || Ch == TEXT('\n'))
                {
                    EndIndex = j + 1;
                    break;
                }
            }
        }

        FString PageContent = Content.Mid(StartIndex, EndIndex - StartIndex).TrimStartAndEnd();
        Pages.Add(PageContent);

        StartIndex = EndIndex;
    }

    // Ensure at least one page
    if (Pages.Num() == 0)
    {
        Pages.Add(TEXT(""));
    }
}

void UInsimulDocumentReader::UpdatePageDisplay()
{
    // Update content text
    if (ContentText && Pages.IsValidIndex(DocumentData.CurrentPage))
    {
        ContentText->SetText(FText::FromString(Pages[DocumentData.CurrentPage]));
    }

    // Update page counter
    if (PageCounterText)
    {
        FString PageStr = FString::Printf(TEXT("Page %d / %d"),
            DocumentData.CurrentPage + 1, DocumentData.TotalPages);
        PageCounterText->SetText(FText::FromString(PageStr));
    }

    // Update navigation button visibility
    if (PrevPageButton)
    {
        PrevPageButton->SetIsEnabled(DocumentData.CurrentPage > 0);
    }

    if (NextPageButton)
    {
        NextPageButton->SetIsEnabled(DocumentData.CurrentPage < DocumentData.TotalPages - 1);
    }
}
