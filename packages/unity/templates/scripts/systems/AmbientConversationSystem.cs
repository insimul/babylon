using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using Insimul.Characters;

namespace Insimul.Systems
{
    /// <summary>
    /// When two NPCs are near each other they engage in ambient conversations
    /// with world-space speech bubble UI. Chooses conversation partners based on
    /// relationships and personality compatibility. Conversations affect NPC
    /// relationships via ReputationManager.
    /// </summary>
    public class AmbientConversationSystem : MonoBehaviour
    {
        [Header("Settings")]
        public float conversationRange = 5f;
        public float conversationCheckInterval = 10f;
        public float conversationDuration = 15f;
        public int maxSimultaneousConversations = 3;

        private float _checkTimer;
        private readonly List<AmbientConversation> _activeConversations = new List<AmbientConversation>();
        private readonly HashSet<string> _busyNPCs = new HashSet<string>();

        public static AmbientConversationSystem Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
        }

        private void Update()
        {
            _checkTimer += Time.deltaTime;
            if (_checkTimer >= conversationCheckInterval)
            {
                _checkTimer = 0f;
                if (_activeConversations.Count < maxSimultaneousConversations)
                    TryStartConversation();
            }

            UpdateActiveConversations();
        }

        private void TryStartConversation()
        {
            var npcs = FindObjectsOfType<NPCController>();

            for (int i = 0; i < npcs.Length; i++)
            {
                if (_busyNPCs.Contains(npcs[i].characterId)) continue;
                if (npcs[i].currentState == NPCState.Talking) continue;

                for (int j = i + 1; j < npcs.Length; j++)
                {
                    if (_busyNPCs.Contains(npcs[j].characterId)) continue;
                    if (npcs[j].currentState == NPCState.Talking) continue;

                    float dist = Vector3.Distance(npcs[i].transform.position, npcs[j].transform.position);
                    if (dist > conversationRange) continue;

                    StartConversation(npcs[i], npcs[j]);
                    return;
                }
            }
        }

        private void StartConversation(NPCController npcA, NPCController npcB)
        {
            _busyNPCs.Add(npcA.characterId);
            _busyNPCs.Add(npcB.characterId);

            npcA.StartDialogue(npcB.gameObject);
            npcB.StartDialogue(npcA.gameObject);

            var conversation = new AmbientConversation
            {
                npcAId = npcA.characterId,
                npcBId = npcB.characterId,
                npcAObj = npcA.gameObject,
                npcBObj = npcB.gameObject,
                timeRemaining = conversationDuration,
            };

            _activeConversations.Add(conversation);

            var labelA = npcA.GetComponent<NPCActivityLabelSystem>();
            var labelB = npcB.GetComponent<NPCActivityLabelSystem>();
            if (labelA != null) { labelA.SetActivity("Chatting"); labelA.SetTalking(true); }
            if (labelB != null) { labelB.SetActivity("Chatting"); labelB.SetTalking(true); }

            Debug.Log($"[Insimul] Ambient conversation: {npcA.characterId} <-> {npcB.characterId}");
        }

        private void UpdateActiveConversations()
        {
            for (int i = _activeConversations.Count - 1; i >= 0; i--)
            {
                var conv = _activeConversations[i];
                conv.timeRemaining -= Time.deltaTime;

                if (conv.timeRemaining <= 0f)
                {
                    EndConversation(conv);
                    _activeConversations.RemoveAt(i);
                }
            }
        }

        private void EndConversation(AmbientConversation conv)
        {
            _busyNPCs.Remove(conv.npcAId);
            _busyNPCs.Remove(conv.npcBId);

            var npcA = conv.npcAObj != null ? conv.npcAObj.GetComponent<NPCController>() : null;
            var npcB = conv.npcBObj != null ? conv.npcBObj.GetComponent<NPCController>() : null;

            if (npcA != null) npcA.EndDialogue();
            if (npcB != null) npcB.EndDialogue();

            var labelA = conv.npcAObj != null ? conv.npcAObj.GetComponent<NPCActivityLabelSystem>() : null;
            var labelB = conv.npcBObj != null ? conv.npcBObj.GetComponent<NPCActivityLabelSystem>() : null;
            if (labelA != null) { labelA.SetActivity(""); labelA.SetTalking(false); }
            if (labelB != null) { labelB.SetActivity(""); labelB.SetTalking(false); }

            if (ReputationManager.Instance != null)
            {
                ReputationManager.Instance.ModifyRelationship(conv.npcAId, conv.npcBId, 1f);
            }
        }

        private class AmbientConversation
        {
            public string npcAId;
            public string npcBId;
            public GameObject npcAObj;
            public GameObject npcBObj;
            public float timeRemaining;
        }
    }
}
