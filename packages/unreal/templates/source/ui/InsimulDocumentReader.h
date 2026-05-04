#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/TextBlock.h"
#include "Components/Button.h"
#include "InsimulDocumentReader.generated.h"

/**
 * Document data for the reader panel.
 */
USTRUCT(BlueprintType)
struct FDocumentData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Document")
    FString Title;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Document")
    FString Content;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Document")
    int32 CurrentPage = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Document")
    int32 TotalPages = 1;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnDocumentClosed);

/**
 * Document reading panel widget matching DocumentReadingPanel.ts and BabylonRulesPanel.ts.
 *
 * Displays paginated text content with a title, page navigation,
 * and close functionality. Used for in-game books, notes, rules, and lore.
 */
UCLASS()
class INSIMULEXPORT_API UInsimulDocumentReader : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Open a document with the given title, content, and total pages */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Document")
    void OpenDocument(const FString& Title, const FString& Content, int32 TotalPages);

    /** Navigate to the next page */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Document")
    void NextPage();

    /** Navigate to the previous page */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Document")
    void PrevPage();

    /** Close the document reader */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Document")
    void CloseDocument();

    /** Get the current page index (0-based) */
    UFUNCTION(BlueprintPure, Category = "Insimul|Document")
    int32 GetCurrentPage() const { return DocumentData.CurrentPage; }

    /** Get the total number of pages */
    UFUNCTION(BlueprintPure, Category = "Insimul|Document")
    int32 GetTotalPages() const { return DocumentData.TotalPages; }

    /** Whether the reader is currently open */
    UFUNCTION(BlueprintPure, Category = "Insimul|Document")
    bool IsDocumentOpen() const { return bIsOpen; }

    /** Get the full document data */
    UFUNCTION(BlueprintPure, Category = "Insimul|Document")
    const FDocumentData& GetDocumentData() const { return DocumentData; }

    /** Fired when the document is closed */
    UPROPERTY(BlueprintAssignable, Category = "Insimul|Document")
    FOnDocumentClosed OnDocumentClosed;

    /** Maximum characters per page for content splitting */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Document")
    int32 CharsPerPage = 800;

protected:
    virtual void NativeConstruct() override;

    /** Document title display */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Document")
    TObjectPtr<UTextBlock> TitleText;

    /** Document content display */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Document")
    TObjectPtr<UTextBlock> ContentText;

    /** Page counter display (e.g., "Page 1/5") */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Document")
    TObjectPtr<UTextBlock> PageCounterText;

    /** Next page button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Document")
    TObjectPtr<UButton> NextPageButton;

    /** Previous page button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Document")
    TObjectPtr<UButton> PrevPageButton;

    /** Close button */
    UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "Insimul|Document")
    TObjectPtr<UButton> CloseButton;

private:
    UPROPERTY()
    FDocumentData DocumentData;

    UPROPERTY()
    bool bIsOpen = false;

    /** Pages of content split from the full text */
    TArray<FString> Pages;

    UFUNCTION()
    void OnNextPageClicked();

    UFUNCTION()
    void OnPrevPageClicked();

    UFUNCTION()
    void OnCloseClicked();

    /** Split content into pages based on CharsPerPage */
    void SplitContentIntoPages(const FString& Content, int32 RequestedPages);

    /** Update the displayed page content and navigation buttons */
    void UpdatePageDisplay();
};
