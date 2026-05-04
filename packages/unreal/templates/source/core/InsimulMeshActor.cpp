#include "InsimulMeshActor.h"
#include "Components/StaticMeshComponent.h"

AInsimulMeshActor::AInsimulMeshActor()
{
    MeshComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
    RootComponent = MeshComponent;
}
