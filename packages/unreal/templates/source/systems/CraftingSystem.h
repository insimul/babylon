#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "CraftingSystem.generated.h"

/** A single ingredient in a crafting recipe */
USTRUCT(BlueprintType)
struct FCraftingIngredient
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ResourceType;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 Amount = 1;
};

/** A crafting recipe loaded from IR */
USTRUCT(BlueprintType)
struct FCraftingRecipe
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString RecipeId;
    UPROPERTY(BlueprintReadOnly) FString ResultItemId;
    UPROPERTY(BlueprintReadOnly) FString ResultItemName;
    UPROPERTY(BlueprintReadOnly) int32 ResultQuantity = 1;
    UPROPERTY(BlueprintReadOnly) TArray<FCraftingIngredient> Ingredients;
    UPROPERTY(BlueprintReadOnly) float CraftTime = 2.f;
    UPROPERTY(BlueprintReadOnly) FString Category;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnItemCrafted, const FString&, RecipeId, int32, Quantity);

/**
 * Recipe-based crafting system.
 * Checks resource availability via ResourceSystem and produces items
 * that integrate with InventorySystem.
 */
UCLASS()
class INSIMULEXPORT_API UCraftingSystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Load recipes from WorldIR JSON */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Crafting")
    void LoadFromIR(const FString& JsonString);

    /** Check if the player has materials to craft this recipe */
    UFUNCTION(BlueprintPure, Category = "Insimul|Crafting")
    bool CanCraft(const FString& RecipeId) const;

    /** Consume materials and produce the result item. Returns true on success. */
    UFUNCTION(BlueprintCallable, Category = "Insimul|Crafting")
    bool Craft(const FString& RecipeId);

    /** Get craft time in seconds for a recipe */
    UFUNCTION(BlueprintPure, Category = "Insimul|Crafting")
    float GetCraftTime(const FString& RecipeId) const;

    /** Get all available recipes */
    UFUNCTION(BlueprintPure, Category = "Insimul|Crafting")
    TArray<FCraftingRecipe> GetAllRecipes() const;

    /** Get recipes filtered by category */
    UFUNCTION(BlueprintPure, Category = "Insimul|Crafting")
    TArray<FCraftingRecipe> GetRecipesByCategory(const FString& Category) const;

    UPROPERTY(BlueprintAssignable, Category = "Crafting")
    FOnItemCrafted OnItemCrafted;

private:
    UPROPERTY() TMap<FString, FCraftingRecipe> Recipes;
};
