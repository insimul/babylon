#include "CraftingSystem.h"
#include "ResourceSystem.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UCraftingSystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] CraftingSystem initialized"));
}

void UCraftingSystem::Deinitialize()
{
    Recipes.Empty();
    Super::Deinitialize();
}

void UCraftingSystem::LoadFromIR(const FString& JsonString)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    const TArray<TSharedPtr<FJsonValue>>* RecipesArr;
    if (!Root->TryGetArrayField(TEXT("craftingRecipes"), RecipesArr)) return;

    for (const auto& Val : *RecipesArr)
    {
        const TSharedPtr<FJsonObject>& Obj = Val->AsObject();
        if (!Obj.IsValid()) continue;

        FCraftingRecipe Recipe;
        Recipe.RecipeId = Obj->GetStringField(TEXT("id"));
        Recipe.ResultItemId = Obj->GetStringField(TEXT("resultItemId"));
        Recipe.ResultItemName = Obj->GetStringField(TEXT("resultItemName"));
        Recipe.ResultQuantity = Obj->GetIntegerField(TEXT("resultQuantity"));
        Recipe.CraftTime = Obj->GetNumberField(TEXT("craftTime"));
        Recipe.Category = Obj->GetStringField(TEXT("category"));

        const TArray<TSharedPtr<FJsonValue>>* IngrArr;
        if (Obj->TryGetArrayField(TEXT("ingredients"), IngrArr))
        {
            for (const auto& IngrVal : *IngrArr)
            {
                const TSharedPtr<FJsonObject>& IngrObj = IngrVal->AsObject();
                if (!IngrObj.IsValid()) continue;
                FCraftingIngredient Ingr;
                Ingr.ResourceType = IngrObj->GetStringField(TEXT("resourceType"));
                Ingr.Amount = IngrObj->GetIntegerField(TEXT("amount"));
                Recipe.Ingredients.Add(Ingr);
            }
        }

        Recipes.Add(Recipe.RecipeId, Recipe);
    }

    UE_LOG(LogTemp, Log, TEXT("[Insimul] CraftingSystem loaded %d recipes"), Recipes.Num());
}

bool UCraftingSystem::CanCraft(const FString& RecipeId) const
{
    const FCraftingRecipe* Recipe = Recipes.Find(RecipeId);
    if (!Recipe) return false;

    UResourceSystem* ResSys = GetGameInstance()->GetSubsystem<UResourceSystem>();
    if (!ResSys) return false;

    for (const auto& Ingr : Recipe->Ingredients)
    {
        if (!ResSys->HasResources(Ingr.ResourceType, Ingr.Amount))
            return false;
    }
    return true;
}

bool UCraftingSystem::Craft(const FString& RecipeId)
{
    if (!CanCraft(RecipeId)) return false;

    const FCraftingRecipe* Recipe = Recipes.Find(RecipeId);
    UResourceSystem* ResSys = GetGameInstance()->GetSubsystem<UResourceSystem>();

    // Consume ingredients
    for (const auto& Ingr : Recipe->Ingredients)
    {
        ResSys->ConsumeResources(Ingr.ResourceType, Ingr.Amount);
    }

    OnItemCrafted.Broadcast(RecipeId, Recipe->ResultQuantity);
    UE_LOG(LogTemp, Log, TEXT("[Insimul] Crafted %s x%d"), *Recipe->ResultItemName, Recipe->ResultQuantity);
    return true;
}

float UCraftingSystem::GetCraftTime(const FString& RecipeId) const
{
    const FCraftingRecipe* Recipe = Recipes.Find(RecipeId);
    return Recipe ? Recipe->CraftTime : 2.f;
}

TArray<FCraftingRecipe> UCraftingSystem::GetAllRecipes() const
{
    TArray<FCraftingRecipe> Result;
    for (const auto& Pair : Recipes)
    {
        Result.Add(Pair.Value);
    }
    return Result;
}

TArray<FCraftingRecipe> UCraftingSystem::GetRecipesByCategory(const FString& Category) const
{
    TArray<FCraftingRecipe> Result;
    for (const auto& Pair : Recipes)
    {
        if (Pair.Value.Category == Category)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}
