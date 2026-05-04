using System;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulDialogueTruth
    {
        public string title;
        public string content;
    }

    [Serializable]
    public class InsimulDialogueContext
    {
        public string characterId;
        public string characterName;
        public string systemPrompt;
        public string greeting;
        public string voice;
        public InsimulDialogueTruth[] truths;
    }

    [Serializable]
    public class InsimulDialogueContextList
    {
        public InsimulDialogueContext[] items;
    }
}
