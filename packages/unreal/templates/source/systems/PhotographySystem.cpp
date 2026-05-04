#include "PhotographySystem.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/DateTime.h"
#include "HighResScreenshot.h"

void UPhotographySystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Register default filters
    AvailableFilters.Add(TEXT("None"));
    AvailableFilters.Add(TEXT("Sepia"));
    AvailableFilters.Add(TEXT("BlackAndWhite"));
    AvailableFilters.Add(TEXT("Vibrant"));
    AvailableFilters.Add(TEXT("Cinematic"));
    AvailableFilters.Add(TEXT("Noir"));

    CurrentFilter = TEXT("None");
    UE_LOG(LogTemp, Log, TEXT("[Insimul] PhotographySystem initialized with %d filters"), AvailableFilters.Num());
}

void UPhotographySystem::Deinitialize()
{
    if (bInPhotoMode)
    {
        ExitPhotoMode();
    }
    Super::Deinitialize();
}

void UPhotographySystem::EnterPhotoMode()
{
    if (bInPhotoMode) return;

    UWorld* World = GetGameInstance()->GetWorld();
    if (!World) return;

    // Save and freeze game time
    SavedTimeDilation = World->GetWorldSettings()->TimeDilation;
    World->GetWorldSettings()->SetTimeDilation(0.0001f); // Near-zero to freeze

    // TODO: Spawn a free-roam spectator pawn and possess it
    // The free camera would use FreeCameraSpeed for movement

    bInPhotoMode = true;
    OnPhotoModeEntered.Broadcast();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Photo mode entered"));
}

void UPhotographySystem::ExitPhotoMode()
{
    if (!bInPhotoMode) return;

    UWorld* World = GetGameInstance()->GetWorld();
    if (World)
    {
        // Restore game time
        World->GetWorldSettings()->SetTimeDilation(SavedTimeDilation);
    }

    // TODO: Destroy free camera pawn and re-possess player character

    // Remove filter
    CurrentFilter = TEXT("None");
    bInPhotoMode = false;

    OnPhotoModeExited.Broadcast();
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Photo mode exited"));
}

FString UPhotographySystem::CapturePhoto()
{
    // Generate a unique filename with timestamp
    FString Timestamp = FDateTime::Now().ToString(TEXT("%Y%m%d_%H%M%S"));
    FString ScreenshotDir = FPaths::ScreenShotDir();
    FString FileName = FString::Printf(TEXT("Insimul_Photo_%s.png"), *Timestamp);
    FString FullPath = ScreenshotDir / FileName;

    // Request high-res screenshot via UE5's built-in system
    FScreenshotRequest::RequestScreenshot(FullPath, false, false);

    CapturedPhotos.Add(FullPath);

    OnPhotoCaptured.Broadcast(FullPath);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Photo captured: %s (total: %d)"), *FullPath, CapturedPhotos.Num());

    return FullPath;
}

void UPhotographySystem::SetFilter(const FString& FilterName)
{
    if (!AvailableFilters.Contains(FilterName))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Insimul] Unknown filter: %s"), *FilterName);
        return;
    }

    CurrentFilter = FilterName;

    // TODO: Apply post-process material based on filter name
    // Typically this would modify a post-process volume's material array:
    //   - Sepia: warm color grading
    //   - BlackAndWhite: desaturation to 0
    //   - Vibrant: increased saturation
    //   - Cinematic: letterbox + film grain
    //   - Noir: high contrast B&W with vignette

    UE_LOG(LogTemp, Log, TEXT("[Insimul] Filter set: %s"), *FilterName);
}

int32 UPhotographySystem::GetPhotoCount() const
{
    return CapturedPhotos.Num();
}
