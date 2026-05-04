#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "InsimulMeshActor.generated.h"

class UStaticMeshComponent;

UCLASS()
class INSIMULEXPORT_API AInsimulMeshActor : public AActor
{
    GENERATED_BODY()

public:
    AInsimulMeshActor();

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    UStaticMeshComponent* MeshComponent;
};
