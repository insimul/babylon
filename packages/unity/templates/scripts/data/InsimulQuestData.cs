using System;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulQuestData
    {
        public string id;
        public string title;
        public string description;
        public string questType;
        public string difficulty;
        public int experienceReward;
        public string assignedByCharacterId;
        public string locationId;
        public string locationName;
        public Vec3Data locationPosition;
        public string status;
        public string[] tags;
        public string[] prerequisiteQuestIds;
        public InsimulQuestObjective[] objectives;
        public string content; // Prolog content
        public string gameType;
        public string questChainId;
        public int questChainOrder;
        public string[] itemRewards;
        public string[] skillRewards;
        public string[] unlocks;
        public string[] failureConditions;
    }

    [Serializable]
    public class InsimulQuestObjective
    {
        public string id;
        public string description;
        public string objectiveType;
        public bool isOptional;
        public int currentProgress;
        public int targetProgress = 1;
    }
}
