using System;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulRuleData
    {
        public string id;
        public string name;
        public string description;
        public string content;
        public string ruleType;
        public string category;
        public int priority = 5;
        public float likelihood = 1f;
        public bool isBase;
        public bool isActive = true;
        public string[] tags;
    }
}
