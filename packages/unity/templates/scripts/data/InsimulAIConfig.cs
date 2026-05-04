using System;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulAIConfig
    {
        public string apiMode = "insimul";
        public string insimulEndpoint = "/api/gemini/chat";
        public string geminiModel = "gemini-3.1-flash";
        public string geminiApiKeyPlaceholder = "YOUR_GEMINI_API_KEY";
        public bool voiceEnabled = true;
        public string defaultVoice = "Kore";
        public string localModelPath = "";
        public string localModelName = "";
    }
}
