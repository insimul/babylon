#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "PhotographySystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPhotoCaptured, const FString&, FilePath);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnPhotoModeEntered);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnPhotoModeExited);

/**
 * Photography system allowing players to enter a free-camera photo mode,
 * apply filters, and capture screenshots.
 */
UCLASS()
class INSIMULEXPORT_API UPhotographySystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Enter photo mode — freezes game and spawns free camera */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Photography")
    void EnterPhotoMode();

    /** Exit photo mode — restores normal camera */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Photography")
    void ExitPhotoMode();

    /** Capture a screenshot and return the file path */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Photography")
    FString CapturePhoto();

    /** Apply a named post-process filter */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Photography")
    void SetFilter(const FString& FilterName);

    /** Get total number of captured photos */
    UFUNCTION(BlueprintPure, Category = "Insimul|Photography")
    int32 GetPhotoCount() const;

    /** Whether photo mode is currently active */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Photography")
    bool bInPhotoMode = false;

    /** Free camera movement speed in photo mode */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Photography")
    float FreeCameraSpeed = 500.0f;

    /** List of available filter names */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Photography")
    TArray<FString> AvailableFilters;

    /** Paths to all captured photos */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul|Photography")
    TArray<FString> CapturedPhotos;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Photography")
    FOnPhotoCaptured OnPhotoCaptured;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Photography")
    FOnPhotoModeEntered OnPhotoModeEntered;

    UPROPERTY(BlueprintAssignable, Category = "Insimul|Photography")
    FOnPhotoModeExited OnPhotoModeExited;

private:
    /** Currently applied filter name */
    FString CurrentFilter;

    /** Saved game time dilation before entering photo mode */
    float SavedTimeDilation = 1.0f;
};
