using System;
using System.Collections.Generic;
using UnityEngine;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulCharacterData
    {
        public string id;
        public string firstName;
        public string middleName;
        public string lastName;
        public string suffix;
        public string gender;
        public bool isAlive = true;
        public string occupation;
        public string currentLocation;
        public string status;
        public int age;
        public int birthYear;
        public string mood;
        public float energy;
        public PersonalityData personality;
        public string homeResidenceId;
        public string[] coworkerIds;
        public string[] friendIds;
        public string spouseId;
    }

    [Serializable]
    public class InsimulRecipeIngredient
    {
        public string itemId;
        public string nameFr;
        public string nameEn;
        public int quantity = 1;
    }

    [Serializable]
    public class InsimulRecipeLanguageData
    {
        public string targetWord;
        public string nativeWord;
        public string pronunciation;
        public string category;
        public string exampleSentence;
    }

    [Serializable]
    public class InsimulRecipeData
    {
        public string id;
        public string nameFr;
        public string nameEn;
        public string station;
        public InsimulRecipeIngredient[] ingredients;
        public string resultItemId;
        public int resultQuantity = 1;
        public int difficulty;
        public int xpReward;
        public int craftTime;
        public InsimulRecipeLanguageData languageData;
    }

    [Serializable]
    public class PersonalityData
    {
        public float openness;
        public float conscientiousness;
        public float extroversion;
        public float agreeableness;
        public float neuroticism;
    }
}
