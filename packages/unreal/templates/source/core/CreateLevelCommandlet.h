#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "CreateLevelCommandlet.generated.h"

UCLASS()
class UCreateLevelCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    UCreateLevelCommandlet();
    virtual int32 Main(const FString& Params) override;
};
