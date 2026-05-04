#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "AnimationData.generated.h"

/**
 * Animation reference data matching AnimationReferenceIR from ir-types.ts.
 */
USTRUCT(BlueprintType)
struct INSIMULEXPORT_API FInsimulAnimationData : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AnimationType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString AssetPath;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 FrameStart = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 FrameEnd = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bLoop = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float SpeedRatio = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString Format;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString SkeletonType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bIsMixamo = false;
};
