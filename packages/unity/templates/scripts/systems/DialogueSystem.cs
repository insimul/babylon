using UnityEngine;
using Insimul.Data;
using Insimul.Services;
using Insimul.UI;

namespace Insimul.Systems
{
    public class DialogueSystem : MonoBehaviour
    {
        public bool IsInDialogue { get; private set; }
        public string CurrentNPCId { get; private set; }

        public System.Action<string> OnDialogueStarted;
        public System.Action OnDialogueEnded;
        public System.Action<string> OnActionSelected;

        public float PlayerEnergy { get; private set; } = 100f;

        private ChatPanel _chatPanel;
        private InsimulAIConfig _aiConfig;
        private InsimulDialogueContext[] _contexts;
        private SocialActionData[] _socialActions = new SocialActionData[0];

        private void Start()
        {
            LoadDialogueData();
            LoadSocialActions();

            _chatPanel = FindFirstObjectByType<ChatPanel>();
            if (_chatPanel == null)
            {
                var panelObj = new GameObject("InsimulChatPanel");
                _chatPanel = panelObj.AddComponent<ChatPanel>();
            }

            if (InsimulAIService.Instance == null)
            {
                var serviceObj = new GameObject("InsimulAIService");
                serviceObj.AddComponent<InsimulAIService>();
            }

            if (_aiConfig != null)
            {
                InsimulAIService.Instance.Initialize(_aiConfig, _contexts);
            }
        }

        private void LoadDialogueData()
        {
            var configAsset = Resources.Load<TextAsset>("Data/AIConfig");
            if (configAsset != null)
            {
                _aiConfig = JsonUtility.FromJson<InsimulAIConfig>(configAsset.text);
                Debug.Log($"[Insimul] AI config loaded: mode={_aiConfig.apiMode}");
            }
            else
            {
                _aiConfig = new InsimulAIConfig();
                Debug.LogWarning("[Insimul] AIConfig.json not found, using defaults");
            }

            var contextAsset = Resources.Load<TextAsset>("Data/DialogueContexts");
            if (contextAsset != null)
            {
                string wrappedJson = "{\"items\":" + contextAsset.text + "}";
                var list = JsonUtility.FromJson<InsimulDialogueContextList>(wrappedJson);
                _contexts = list?.items ?? new InsimulDialogueContext[0];
                Debug.Log($"[Insimul] Loaded {_contexts.Length} dialogue contexts");
            }
            else
            {
                _contexts = new InsimulDialogueContext[0];
                Debug.LogWarning("[Insimul] DialogueContexts.json not found");
            }
        }

        public void StartDialogue(string npcCharacterId)
        {
            if (IsInDialogue) EndDialogue();

            IsInDialogue = true;
            CurrentNPCId = npcCharacterId;
            OnDialogueStarted?.Invoke(npcCharacterId);

            _chatPanel?.Open(npcCharacterId);
            Debug.Log($"[Insimul] Dialogue started with NPC: {npcCharacterId}");
        }

        public void EndDialogue()
        {
            var npcId = CurrentNPCId;
            IsInDialogue = false;
            CurrentNPCId = null;
            OnDialogueEnded?.Invoke();

            _chatPanel?.Close();
            Debug.Log($"[Insimul] Dialogue ended with NPC: {npcId}");
        }

        public void SetPlayerEnergy(float energy)
        {
            PlayerEnergy = Mathf.Max(0f, energy);
        }

        /// <summary>
        /// Get available social actions filtered by player energy affordability.
        /// Returns action IDs that the player can currently afford.
        /// </summary>
        public string[] GetAvailableActions()
        {
            if (!IsInDialogue) return new string[0];

            var available = new System.Collections.Generic.List<string>();
            foreach (var action in _socialActions)
            {
                if (action.energyCost <= 0f || action.energyCost <= PlayerEnergy)
                {
                    available.Add(action.id);
                }
            }
            return available.ToArray();
        }

        /// <summary>
        /// Select an action during dialogue. Checks affordability and broadcasts OnActionSelected.
        /// </summary>
        public void SelectAction(string actionId)
        {
            if (!IsInDialogue)
            {
                Debug.LogWarning("[Insimul] Cannot select action - not in dialogue");
                return;
            }

            foreach (var action in _socialActions)
            {
                if (action.id == actionId)
                {
                    if (action.energyCost > 0f && action.energyCost > PlayerEnergy)
                    {
                        Debug.LogWarning($"[Insimul] Not enough energy for action: {actionId} (cost={action.energyCost}, energy={PlayerEnergy})");
                        return;
                    }

                    OnActionSelected?.Invoke(actionId);
                    Debug.Log($"[Insimul] Action selected: {actionId}");
                    return;
                }
            }

            Debug.LogWarning($"[Insimul] Action not found: {actionId}");
        }

        /// <summary>
        /// Show dialogue with romance actions merged alongside base actions.
        /// Converts romance actions to standard SocialActionData and appends them.
        /// </summary>
        public void ShowWithRomanceActions(SocialActionData[] baseActions, RomanceActionData[] romanceActions, float energy)
        {
            SetPlayerEnergy(energy);

            var combined = new System.Collections.Generic.List<SocialActionData>(baseActions);
            foreach (var ra in romanceActions)
            {
                combined.Add(new SocialActionData
                {
                    id = $"romance_{ra.id}",
                    name = $"\U0001F495 {ra.name}",
                    description = string.IsNullOrEmpty(ra.description)
                        ? $"Romance action (requires {ra.requiredStage} stage)"
                        : ra.description,
                    energyCost = ra.energyCost > 0f ? ra.energyCost : 5f
                });
            }
            _socialActions = combined.ToArray();

            Debug.Log($"[Insimul] ShowWithRomanceActions: added {romanceActions.Length} romance actions (total={_socialActions.Length})");
        }

        [System.Serializable]
        public class RomanceActionData
        {
            public string id;
            public string name;
            public string requiredStage;
            public float sparkGain;
            public string description;
            public float energyCost = 5f;
        }

        private void LoadSocialActions()
        {
            var actionsAsset = Resources.Load<TextAsset>("Data/SocialActions");
            if (actionsAsset != null)
            {
                string wrappedJson = "{\"items\":" + actionsAsset.text + "}";
                var list = JsonUtility.FromJson<SocialActionDataList>(wrappedJson);
                _socialActions = list?.items ?? new SocialActionData[0];
                Debug.Log($"[Insimul] Loaded {_socialActions.Length} social actions");
            }
            else
            {
                Debug.LogWarning("[Insimul] SocialActions.json not found");
            }
        }

        [System.Serializable]
        public class SocialActionData
        {
            public string id;
            public string name;
            public string description;
            public float energyCost;
        }

        [System.Serializable]
        private class SocialActionDataList
        {
            public SocialActionData[] items;
        }
    }
}
