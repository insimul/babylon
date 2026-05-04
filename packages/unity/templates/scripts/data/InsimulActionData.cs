using System;

namespace Insimul.Data
{
    /// <summary>
    /// An effect entry within an action definition (from IR data).
    /// </summary>
    [Serializable]
    public class InsimulActionEffectEntry
    {
        public string category;
        public string type;
        public string first;
        public string operatorStr;
        public float value;
    }

    [Serializable]
    public class InsimulActionData
    {
        public string id;
        public string name;
        public string description;
        public string content; // Prolog content — single source of truth
        public string actionType;
        public string category;
        public float duration = 1f;
        public float difficulty = 0.5f;
        public int energyCost = 1;
        public bool requiresTarget;
        public float range;
        public float cooldown;
        public bool isActive = true;
        public string[] tags;
        public string verbPast;
        public string verbPresent;
        public string[] narrativeTemplates;
        public string targetType;
        public bool isBase;
        public string customData; // JSON string
        public InsimulActionEffectEntry[] effects;
    }
}
