#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "InsimulGameInstance.generated.h"

UCLASS()
class INSIMULEXPORT_API UInsimulGameInstance : public UGameInstance
{
    GENERATED_BODY()

public:
    virtual void Init() override;

    /** Load the WorldIR JSON from Content/Data */
    UFUNCTION(BlueprintCallable, Category = "Insimul")
    bool LoadWorldData();

    /** Parsed IR data accessible to all systems */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul")
    FString WorldName;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul")
    FString WorldType;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul")
    FString GenreId;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul")
    int32 TerrainSize = 512;

    UPROPERTY(BlueprintReadOnly, Category = "Insimul")
    FString Seed;

    /** Raw JSON string for sub-system parsing */
    UPROPERTY(BlueprintReadOnly, Category = "Insimul")
    FString RawWorldIRJson;

private:
    bool bDataLoaded = false;
};
