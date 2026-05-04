using System;
using System.Collections.Generic;
using UnityEngine;
using Insimul.Data;

namespace Insimul.Systems
{
    /// <summary>
    /// Animation data attached to an action result.
    /// Matches ActionAnimationData from shared/game-engine/types.ts.
    /// </summary>
    [System.Serializable]
    public class ActionAnimationData
    {
        /// <summary>Primary animation clip name.</summary>
        public string clip;
        /// <summary>Alternate animation clip name (optional).</summary>
        public string clipAlt;
        /// <summary>Animation library: "UAL1" or "UAL2".</summary>
        public string library;
        /// <summary>Whether the animation should loop.</summary>
        public bool loop;
        /// <summary>Playback speed multiplier.</summary>
        public float speed = 1.0f;
        /// <summary>Blend-in duration in seconds.</summary>
        public float blendIn = 0.2f;
    }

    /// <summary>
    /// Effect produced by an action execution.
    /// </summary>
    [System.Serializable]
    public class ActionEffect
    {
        /// <summary>Effect type: relationship, attribute, status, event, item, knowledge, gold</summary>
        public string type;
        public string target;
        public string description;
        public float value;
        /// <summary>For item effects: the item identifier.</summary>
        public string itemId;
        /// <summary>For item effects: quantity to give/take.</summary>
        public int quantity;
    }

    /// <summary>
    /// Result of executing an action.
    /// </summary>
    public class ActionResult
    {
        public bool success;
        public string message;
        public int energyUsed;
        public List<ActionEffect> effects = new();
        public string narrativeText;
        /// <summary>Animation to play for this action (may be null).</summary>
        public ActionAnimationData animation;
    }

    /// <summary>
    /// Big Five personality profile for personality-based action ranking.
    /// Each trait ranges from -1.0 to 1.0.
    /// </summary>
    [System.Serializable]
    public class PersonalityProfile
    {
        public float openness;
        public float conscientiousness;
        public float extroversion;
        public float agreeableness;
        public float neuroticism;
    }

    /// <summary>
    /// An action paired with its softmax probability from personality ranking.
    /// </summary>
    public struct RankedAction
    {
        public InsimulActionData action;
        public float probability;
    }

    /// <summary>
    /// Tracks per-action cooldown and usage state.
    /// </summary>
    [System.Serializable]
    public class ActionState
    {
        public string actionId;
        public float lastUsed;
        public float cooldownRemaining;
        public int timesUsed;
    }

    /// <summary>
    /// Manages available actions and their execution.
    /// Ported from Insimul's Babylon.js ActionManager.
    /// </summary>
    public class ActionSystem : MonoBehaviour
    {
        private List<InsimulActionData> _actions = new();
        private Dictionary<string, ActionState> _actionStates = new();

        public int ActionCount => _actions.Count;

        /// <summary>Fired when an action produces a gold effect.</summary>
        public event Action<int> OnGoldEffect;
        /// <summary>Fired when an action produces an item effect.</summary>
        public event Action<string, int> OnItemEffect;

        public void LoadFromData(InsimulWorldIR worldData)
        {
            if (worldData?.systems?.actions != null)
                _actions.AddRange(worldData.systems.actions);
            if (worldData?.systems?.baseActions != null)
                _actions.AddRange(worldData.systems.baseActions);
            Debug.Log($"[Insimul] ActionSystem loaded {_actions.Count} actions");
        }

        public InsimulActionData GetAction(string id)
        {
            return _actions.Find(a => a.id == id);
        }

        /// <summary>Get all action IDs matching a category (social, combat, mental, etc.).</summary>
        public List<string> GetActionsByCategory(string category)
        {
            var result = new List<string>();
            foreach (var action in _actions)
            {
                if (action.actionType == category)
                    result.Add(action.id);
            }
            return result;
        }

        /// <summary>Check whether an action can be performed given current context.</summary>
        public bool CanPerformAction(string actionId, float playerEnergy, bool hasTarget, out string reason)
        {
            var action = GetAction(actionId);
            if (action == null)
            {
                reason = "Action not found";
                return false;
            }

            if (!action.isActive)
            {
                reason = "Action not available";
                return false;
            }

            if (_actionStates.TryGetValue(actionId, out var state) && state.cooldownRemaining > 0f)
            {
                reason = $"On cooldown ({state.cooldownRemaining:F1}s remaining)";
                return false;
            }

            if (action.energyCost > 0 && action.energyCost > playerEnergy)
            {
                reason = $"Not enough energy (need {action.energyCost})";
                return false;
            }

            if (action.requiresTarget && !hasTarget)
            {
                reason = "Requires a target";
                return false;
            }

            reason = "";
            return true;
        }

        /// <summary>Tick cooldowns -- call once per frame with Time.deltaTime.</summary>
        public void UpdateCooldowns(float deltaTime)
        {
            foreach (var kvp in _actionStates)
            {
                if (kvp.Value.cooldownRemaining > 0f)
                    kvp.Value.cooldownRemaining = Mathf.Max(0f, kvp.Value.cooldownRemaining - deltaTime);
            }
        }

        /// <summary>Get remaining cooldown for an action (0 if ready).</summary>
        public float GetCooldown(string actionId)
        {
            if (_actionStates.TryGetValue(actionId, out var state))
                return state.cooldownRemaining;
            return 0f;
        }

        /// <summary>Standard personality affinities for common action types.</summary>
        private static readonly Dictionary<string, Dictionary<string, float>> StandardAffinities = new()
        {
            // Social actions
            ["greet"] = new() { ["extroversion"] = 0.4f, ["agreeableness"] = 0.3f },
            ["compliment"] = new() { ["agreeableness"] = 0.5f, ["extroversion"] = 0.2f },
            ["gossip"] = new() { ["extroversion"] = 0.3f, ["agreeableness"] = -0.3f, ["openness"] = 0.1f },
            ["argue"] = new() { ["extroversion"] = 0.2f, ["agreeableness"] = -0.5f, ["neuroticism"] = 0.3f },
            ["comfort"] = new() { ["agreeableness"] = 0.6f, ["extroversion"] = 0.1f },
            ["apologize"] = new() { ["agreeableness"] = 0.4f, ["conscientiousness"] = 0.3f },
            // Physical actions
            ["fight"] = new() { ["agreeableness"] = -0.5f, ["extroversion"] = 0.3f, ["neuroticism"] = 0.2f },
            ["flee"] = new() { ["neuroticism"] = 0.5f, ["agreeableness"] = 0.2f },
            ["explore"] = new() { ["openness"] = 0.6f, ["extroversion"] = 0.2f },
            ["rest"] = new() { ["conscientiousness"] = -0.2f, ["neuroticism"] = 0.1f },
            // Economic actions
            ["trade"] = new() { ["conscientiousness"] = 0.4f, ["agreeableness"] = 0.1f },
            ["steal"] = new() { ["agreeableness"] = -0.6f, ["conscientiousness"] = -0.4f, ["neuroticism"] = 0.2f },
            ["craft"] = new() { ["conscientiousness"] = 0.5f, ["openness"] = 0.3f },
            ["mine"] = new() { ["conscientiousness"] = 0.4f, ["openness"] = 0.2f },
            ["work"] = new() { ["conscientiousness"] = 0.6f },
            // Romance actions
            ["flirt"] = new() { ["extroversion"] = 0.4f, ["openness"] = 0.3f, ["agreeableness"] = 0.1f },
            ["express_love"] = new() { ["agreeableness"] = 0.4f, ["extroversion"] = 0.2f, ["openness"] = 0.3f },
            // Mental actions
            ["study"] = new() { ["openness"] = 0.5f, ["conscientiousness"] = 0.4f },
            ["meditate"] = new() { ["openness"] = 0.4f, ["neuroticism"] = -0.3f },
            ["plan"] = new() { ["conscientiousness"] = 0.6f, ["openness"] = 0.2f },
        };

        /// <summary>Get contextual actions ranked by personality match using softmax probability.
        /// If personality is null, returns uniform probability.</summary>
        public List<RankedAction> GetContextualActionsRanked(float playerEnergy, bool hasTarget, PersonalityProfile personality = null)
        {
            var result = new List<RankedAction>();
            var contextualActions = new List<InsimulActionData>();

            foreach (var action in _actions)
            {
                if (!action.isActive) continue;
                if (_actionStates.TryGetValue(action.id, out var state) && state.cooldownRemaining > 0f) continue;
                if (action.energyCost > 0 && action.energyCost > playerEnergy) continue;
                if (action.requiresTarget && !hasTarget) continue;
                contextualActions.Add(action);
            }

            if (contextualActions.Count == 0) return result;

            if (personality == null)
            {
                float uniform = 1f / contextualActions.Count;
                foreach (var action in contextualActions)
                    result.Add(new RankedAction { action = action, probability = uniform });
                return result;
            }

            // Build trait lookup
            var traitValues = new Dictionary<string, float>
            {
                ["openness"] = personality.openness,
                ["conscientiousness"] = personality.conscientiousness,
                ["extroversion"] = personality.extroversion,
                ["agreeableness"] = personality.agreeableness,
                ["neuroticism"] = personality.neuroticism,
            };

            // Compute raw scores
            float temperature = 1.0f;
            var scores = new float[contextualActions.Count];
            for (int i = 0; i < contextualActions.Count; i++)
            {
                float score = 0.5f; // base weight
                if (StandardAffinities.TryGetValue(contextualActions[i].actionType ?? "", out var affinities))
                {
                    foreach (var kvp in affinities)
                    {
                        if (traitValues.TryGetValue(kvp.Key, out float traitVal))
                            score += traitVal * kvp.Value;
                    }
                }
                scores[i] = score;
            }

            // Softmax with temperature
            float maxScore = scores[0];
            for (int i = 1; i < scores.Length; i++)
                maxScore = Mathf.Max(maxScore, scores[i]);

            float sumExp = 0f;
            var exps = new float[scores.Length];
            for (int i = 0; i < scores.Length; i++)
            {
                exps[i] = Mathf.Exp((scores[i] - maxScore) / Mathf.Max(0.01f, temperature));
                sumExp += exps[i];
            }

            if (sumExp <= 0f) sumExp = 1f;
            for (int i = 0; i < contextualActions.Count; i++)
            {
                result.Add(new RankedAction
                {
                    action = contextualActions[i],
                    probability = exps[i] / sumExp,
                });
            }

            // Sort descending by probability
            result.Sort((a, b) => b.probability.CompareTo(a.probability));
            return result;
        }

        public ActionResult ExecuteAction(string actionId, GameObject source, GameObject target = null)
        {
            var result = new ActionResult();
            var action = GetAction(actionId);

            // Validate via CanPerformAction
            if (!CanPerformAction(actionId, 100f, target != null, out string reason))
            {
                result.success = false;
                result.message = reason;
                return result;
            }

            // Process effects from action definition
            if (action.effects != null)
            {
                foreach (var effect in action.effects)
                {
                    var category = effect.category ?? "";
                    var ae = new ActionEffect
                    {
                        type = category,
                        target = effect.first == "initiator" ? "player" : (target?.name ?? ""),
                        value = effect.value,
                        description = $"{effect.type} {effect.operatorStr ?? ""} {effect.value}"
                    };

                    if (category == "item")
                    {
                        ae.itemId = effect.type;
                        ae.quantity = (int)effect.value;
                        OnItemEffect?.Invoke(ae.itemId, ae.quantity);
                    }
                    else if (category == "gold")
                    {
                        OnGoldEffect?.Invoke((int)effect.value);
                    }

                    result.effects.Add(ae);
                }
            }

            // Generate narrative text
            string targetName = target != null ? target.name : "someone";
            result.narrativeText = GenerateNarrativeText(action, "You", targetName);

            // Update action state and start cooldown
            if (!_actionStates.TryGetValue(actionId, out var state))
            {
                state = new ActionState { actionId = actionId };
                _actionStates[actionId] = state;
            }
            state.lastUsed = Time.time;
            state.timesUsed += 1;
            if (action.cooldown > 0)
                state.cooldownRemaining = action.cooldown;

            result.success = true;
            result.message = $"{action.name} performed successfully";
            result.energyUsed = action.energyCost;

            // Extract animation data from action's customData if present
            if (!string.IsNullOrEmpty(action.customData))
            {
                try
                {
                    var customObj = JsonUtility.FromJson<ActionCustomDataWrapper>(action.customData);
                    if (customObj?.animation != null && !string.IsNullOrEmpty(customObj.animation.clip))
                        result.animation = customObj.animation;
                }
                catch (System.Exception)
                {
                    // customData may not contain animation — ignore parse errors
                }
            }

            Debug.Log($"[Insimul] Executing action: {action.name} ({result.effects.Count} effects)");
            return result;
        }

        private string GenerateNarrativeText(InsimulActionData action, string actorName, string targetName)
        {
            if (action.narrativeTemplates != null && action.narrativeTemplates.Length > 0)
            {
                var template = action.narrativeTemplates[UnityEngine.Random.Range(0, action.narrativeTemplates.Length)];
                return template.Replace("{actor}", actorName).Replace("{target}", targetName);
            }

            // Fallback
            string verb = !string.IsNullOrEmpty(action.verbPast) ? action.verbPast : action.name.ToLower();
            return $"You {verb}.";
        }

        /// <summary>
        /// Maps quest objective types to the action names that can satisfy them.
        /// </summary>
        private static readonly Dictionary<string, string[]> ObjectiveToAction = new Dictionary<string, string[]>
        {
            { "visit_location", new[] { "travel_to_location", "enter_building" } },
            { "discover_location", new[] { "travel_to_location" } },
            { "talk_to_npc", new[] { "talk_to_npc" } },
            { "complete_conversation", new[] { "talk_to_npc" } },
            { "collect_item", new[] { "collect_item" } },
            { "deliver_item", new[] { "give_gift" } },
            { "craft_item", new[] { "craft_item", "craft", "cook" } },
            { "defeat_enemies", new[] { "attack_enemy" } },
            { "build_friendship", new[] { "talk_to_npc", "compliment_npc", "give_gift" } },
            { "give_gift", new[] { "give_gift" } },
            { "examine_object", new[] { "examine_object" } },
            { "read_sign", new[] { "read_sign" } },
            { "listen_and_repeat", new[] { "listen_and_repeat" } },
            { "point_and_name", new[] { "point_and_name" } },
            { "read_text", new[] { "read_book" } },
            { "comprehension_quiz", new[] { "answer_question" } },
            { "photograph_subject", new[] { "take_photo" } },
            { "photograph_activity", new[] { "take_photo" } },
            { "mine_mineral", new[] { "mine", "mine_ore" } },
        };

        /// <summary>
        /// Find actions that can satisfy a given quest objective type.
        /// </summary>
        public List<InsimulActionData> FindActionForObjective(string objectiveType)
        {
            var result = new List<InsimulActionData>();
            if (!ObjectiveToAction.TryGetValue(objectiveType, out var names)) return result;

            var nameSet = new HashSet<string>(names);
            foreach (var action in _actions)
            {
                if (nameSet.Contains(action.name))
                    result.Add(action);
            }
            return result;
        }

        /// <summary>
        /// Look up an action by its name (e.g., "fish", "cook", "attack_enemy").
        /// </summary>
        public InsimulActionData GetActionByName(string actionName)
        {
            foreach (var action in _actions)
            {
                if (action.name == actionName)
                    return action;
            }
            return null;
        }
    }

    /// <summary>
    /// Helper wrapper for deserializing the animation field from action customData JSON.
    /// </summary>
    [System.Serializable]
    internal class ActionCustomDataWrapper
    {
        public ActionAnimationData animation;
    }
}
