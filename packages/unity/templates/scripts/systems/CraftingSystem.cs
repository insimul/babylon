using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul.Systems
{
    public enum CraftingStation { None, KitchenStove, AlchemyTable, Workbench, Forge, Loom }

    [System.Serializable]
    public class RecipeLanguageData
    {
        public string targetWord;    // e.g. "pain" (French for bread)
        public string nativeWord;    // e.g. "bread"
        public string pronunciation; // e.g. "pɛ̃"
        public string category;      // e.g. "food"
    }

    [System.Serializable]
    public class CraftingRecipe
    {
        public string id;
        public string name;
        public string[] inputItemIds;
        public int[] inputCounts;
        public string outputItemId;
        public int outputCount = 1;
        public CraftingStation station = CraftingStation.None;
        public int difficulty = 0;
        public int minLevel = 0;
        public RecipeLanguageData languageData = null;
    }

    public class CraftingSystem : MonoBehaviour
    {
        private List<CraftingRecipe> _recipes = new();

        // Crafting station
        private CraftingStation _currentStation = CraftingStation.None;

        // Skill progression
        private int _craftingXP = 0;
        private int _craftingLevel = 0;
        private static readonly int[] LevelThresholds = { 0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3200, 4200 };

        // Events
        public event Action<int> OnLevelUp;
        public event Action<int, int> OnXPGained;
        public event Action<RecipeLanguageData> OnVocabularyEncountered;

        // Public properties
        public int CraftingLevel => _craftingLevel;
        public int CraftingXP => _craftingXP;
        public int XPToNextLevel => _craftingLevel < LevelThresholds.Length - 1
            ? LevelThresholds[_craftingLevel + 1] - _craftingXP
            : 0;

        public void SetCurrentStation(CraftingStation station)
        {
            _currentStation = station;
        }

        public bool CanCraftAtStation(string recipeId)
        {
            var recipe = _recipes.Find(r => r.id == recipeId);
            if (recipe == null) return false;
            return recipe.station == CraftingStation.None || recipe.station == _currentStation;
        }

        public string GetDisplayName(string recipeId, bool showTargetLanguage = true)
        {
            var recipe = _recipes.Find(r => r.id == recipeId);
            if (recipe == null) return recipeId;
            if (showTargetLanguage && recipe.languageData != null && !string.IsNullOrEmpty(recipe.languageData.targetWord))
                return recipe.languageData.targetWord;
            return recipe.name;
        }

        public bool CanCraft(string recipeId)
        {
            var recipe = _recipes.Find(r => r.id == recipeId);
            if (recipe == null) return false;
            if (recipe.minLevel > _craftingLevel) return false;
            if (!CanCraftAtStation(recipeId)) return false;
            var inv = FindFirstObjectByType<InventorySystem>();
            if (inv == null) return false;
            for (int i = 0; i < recipe.inputItemIds.Length; i++)
            {
                if (inv.GetItemCount(recipe.inputItemIds[i]) < recipe.inputCounts[i])
                    return false;
            }
            return true;
        }

        public bool Craft(string recipeId)
        {
            if (!CanCraft(recipeId)) return false;
            var recipe = _recipes.Find(r => r.id == recipeId);
            var inv = FindFirstObjectByType<InventorySystem>();
            for (int i = 0; i < recipe.inputItemIds.Length; i++)
                inv.RemoveItem(recipe.inputItemIds[i], recipe.inputCounts[i]);
            inv.AddItem(recipe.outputItemId, recipe.outputCount);
            Debug.Log($"[Insimul] Crafted: {recipe.name}");

            // Skill progression
            int xpGained = 10 + recipe.difficulty * 5;
            _craftingXP += xpGained;
            OnXPGained?.Invoke(xpGained, _craftingXP);
            while (_craftingLevel < LevelThresholds.Length - 1 && _craftingXP >= LevelThresholds[_craftingLevel + 1])
            {
                _craftingLevel++;
                Debug.Log($"[Insimul] Crafting level up! Now level {_craftingLevel}");
                OnLevelUp?.Invoke(_craftingLevel);
            }

            // Language learning integration
            if (recipe.languageData != null && !string.IsNullOrEmpty(recipe.languageData.targetWord))
            {
                OnVocabularyEncountered?.Invoke(recipe.languageData);
            }

            // Audio feedback
            var audio = FindFirstObjectByType<AudioManager>();
            audio?.PlaySFX("pickup");

            return true;
        }
    }
}
