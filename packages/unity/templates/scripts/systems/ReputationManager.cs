using System;
using System.Collections.Generic;
using UnityEngine;
using Insimul.Data;

namespace Insimul.Systems
{
    public enum StandingLevel { Hostile, Unfriendly, Neutral, Friendly, Honored, Revered }
    public enum RelationshipTier { Stranger, Acquaintance, Friend, CloseFriend, BestFriend, Rival, Enemy }

    public class ReputationManager : MonoBehaviour
    {
        private Dictionary<string, float> _npcDisposition = new Dictionary<string, float>();
        private Dictionary<string, float> _settlementReputation = new Dictionary<string, float>();
        private Dictionary<string, int> _interactionCount = new Dictionary<string, int>();

        public event Action<string, StandingLevel> OnStandingChanged;
        public event Action<string, RelationshipTier> OnRelationshipChanged;
        public event Action<string, float> OnReputationChanged;

        private static readonly Dictionary<string, (float npcDelta, float settlementDelta)> ActionEffects =
            new Dictionary<string, (float, float)>
        {
            { "compliment",  ( 5f,   1f) },
            { "give_gift",   (10f,   2f) },
            { "help",        ( 8f,   3f) },
            { "heal",        ( 8f,   3f) },
            { "trade",       ( 3f,   1f) },
            { "steal",       (-15f, -10f) },
            { "attack",      (-25f, -15f) },
            { "fight",       (-25f, -15f) },
            { "intimidate",  (-10f,  -5f) },
            { "gossip",      (-3f,  -1f) },
            { "greet",       ( 2f,   0f) },
            { "apologize",   ( 7f,   2f) },
        };

        public void Initialize(InsimulWorldIR worldData)
        {
            if (worldData?.entities?.npcs != null)
            {
                foreach (var npc in worldData.entities.npcs)
                {
                    _npcDisposition[npc.characterId] = npc.disposition;
                    _interactionCount[npc.characterId] = 0;
                }
            }

            if (worldData?.geography?.settlements != null)
            {
                foreach (var s in worldData.geography.settlements)
                    _settlementReputation[s.id] = 0f;
            }
        }

        // --- Disposition ---

        public void ModifyNPCDisposition(string characterId, float delta)
        {
            if (string.IsNullOrEmpty(characterId)) return;
            var prev = GetNPCStanding(characterId);
            var prevTier = GetRelationshipTier(characterId);

            float current = _npcDisposition.ContainsKey(characterId) ? _npcDisposition[characterId] : 50f;
            _npcDisposition[characterId] = Mathf.Clamp(current + delta, -100f, 100f);

            var next = GetNPCStanding(characterId);
            var nextTier = GetRelationshipTier(characterId);
            if (next != prev) OnStandingChanged?.Invoke(characterId, next);
            if (nextTier != prevTier) OnRelationshipChanged?.Invoke(characterId, nextTier);
        }

        public float GetNPCDisposition(string characterId)
        {
            return _npcDisposition.TryGetValue(characterId, out var v) ? v : 50f;
        }

        public StandingLevel GetNPCStanding(string characterId)
        {
            return ToStanding(GetNPCDisposition(characterId));
        }

        // --- Settlement Reputation ---

        public void ModifySettlementReputation(string settlementId, float delta)
        {
            if (string.IsNullOrEmpty(settlementId)) return;
            float current = _settlementReputation.ContainsKey(settlementId) ? _settlementReputation[settlementId] : 0f;
            _settlementReputation[settlementId] = Mathf.Clamp(current + delta, -100f, 100f);
            OnReputationChanged?.Invoke(settlementId, _settlementReputation[settlementId]);
        }

        public float GetSettlementReputation(string settlementId)
        {
            return _settlementReputation.TryGetValue(settlementId, out var v) ? v : 0f;
        }

        public StandingLevel GetSettlementStanding(string settlementId)
        {
            return ToStanding(GetSettlementReputation(settlementId));
        }

        // --- Interactions & Relationships ---

        public void RecordInteraction(string characterId)
        {
            if (string.IsNullOrEmpty(characterId)) return;
            var prevTier = GetRelationshipTier(characterId);
            _interactionCount[characterId] = GetInteractionCount(characterId) + 1;
            var nextTier = GetRelationshipTier(characterId);
            if (nextTier != prevTier) OnRelationshipChanged?.Invoke(characterId, nextTier);
        }

        public int GetInteractionCount(string characterId)
        {
            return _interactionCount.TryGetValue(characterId, out var c) ? c : 0;
        }

        public RelationshipTier GetRelationshipTier(string characterId)
        {
            float d = GetNPCDisposition(characterId);
            int count = GetInteractionCount(characterId);

            if (d < -50f) return RelationshipTier.Enemy;
            if (d < -10f) return RelationshipTier.Rival;
            if (d > 85f && count >= 25) return RelationshipTier.BestFriend;
            if (d > 65f && count >= 15) return RelationshipTier.CloseFriend;
            if (d > 40f && count >= 8) return RelationshipTier.Friend;
            if (d > 15f && count >= 3) return RelationshipTier.Acquaintance;
            return RelationshipTier.Stranger;
        }

        public string GetRelationshipLabel(string characterId)
        {
            return GetRelationshipTier(characterId).ToString();
        }

        // --- Action Effects ---

        public void ApplyActionEffect(string actionType, string targetNPCId, string settlementId)
        {
            if (string.IsNullOrEmpty(actionType)) return;
            if (!ActionEffects.TryGetValue(actionType.ToLowerInvariant(), out var fx)) return;

            if (!string.IsNullOrEmpty(targetNPCId))
                ModifyNPCDisposition(targetNPCId, fx.npcDelta);
            if (!string.IsNullOrEmpty(settlementId) && fx.settlementDelta != 0f)
                ModifySettlementReputation(settlementId, fx.settlementDelta);
        }

        // --- Helpers ---

        private static StandingLevel ToStanding(float value)
        {
            if (value < -60f) return StandingLevel.Hostile;
            if (value < -20f) return StandingLevel.Unfriendly;
            if (value < 20f) return StandingLevel.Neutral;
            if (value < 60f) return StandingLevel.Friendly;
            if (value < 85f) return StandingLevel.Honored;
            return StandingLevel.Revered;
        }
    }
}
