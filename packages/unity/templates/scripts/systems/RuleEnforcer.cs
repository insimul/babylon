using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Insimul.Data;

namespace Insimul.Systems
{
    [System.Serializable]
    public class InsimulRuleCondition
    {
        public string type;
        public string location;
        public string zone;
        public string action;
        public string op = ">=";
        public float value;
        public string itemId;
        public string itemName;
        public string itemType;
        public int quantity = 1;
        public string questId;
        public string cefrLevel;
    }

    [System.Serializable]
    public class InsimulRuleEffect
    {
        public string type;
        public string action;
        public string message;
    }

    [System.Serializable]
    public class InsimulRule
    {
        public string id;
        public string name;
        public string ruleType;
        public string category;
        public int priority = 5;
        public bool isActive = true;
        public List<InsimulRuleCondition> conditions = new();
        public List<InsimulRuleEffect> effects = new();
        public string prologContent;
    }

    [System.Serializable]
    public class RuleViolation
    {
        public string ruleId;
        public string ruleName;
        public float timestamp;
        public string severity;
        public string message;
    }

    [System.Serializable]
    public class SettlementZone
    {
        public string settlementId;
        public Vector3 position;
        public float radius;
    }

    public class InsimulGameContext
    {
        public string playerId;
        public string actionId;
        public string actionType;
        public Vector3 playerPosition;
        public float playerEnergy = -1f;
        public bool inSettlement;
        public bool nearNPC;
        public string targetNPCId;
        public List<InventoryItem> playerInventory;
    }

    public class RuleEnforcer : MonoBehaviour
    {
        private List<InsimulRule> _rules = new();
        private List<InsimulRuleData> _ruleData = new();
        private List<SettlementZone> _settlementZones = new();
        private List<RuleViolation> _violations = new();

        /// <summary>Fired when a rule violation is recorded.</summary>
        public event Action<RuleViolation> OnViolation;

        /// <summary>Fired when a restriction is applied.</summary>
        public event Action<string, string> OnRestriction;

        public int RuleCount => _ruleData.Count;

        public void LoadFromData(InsimulWorldIR worldData)
        {
            if (worldData?.systems?.rules != null)
                _ruleData.AddRange(worldData.systems.rules);
            if (worldData?.systems?.baseRules != null)
                _ruleData.AddRange(worldData.systems.baseRules);

            // Convert data to runtime rule objects
            foreach (var data in _ruleData)
            {
                _rules.Add(new InsimulRule
                {
                    id = data.id,
                    name = data.name,
                    ruleType = data.ruleType,
                    category = data.category,
                    priority = data.priority,
                    isActive = data.isActive,
                    prologContent = data.content,
                });
            }
            Debug.Log($"[Insimul] RuleEnforcer loaded {_rules.Count} rules");
        }

        /// <summary>Whether a Prolog knowledge base is attached for enhanced rule evaluation.</summary>
        public bool HasPrologKB { get; private set; }

        private string _prologContent;

        public List<string> EvaluateRules(InsimulGameContext context)
        {
            var violations = new List<string>();

            foreach (var rule in _rules)
            {
                if (!rule.isActive) continue;
                if (rule.ruleType != "trigger" && rule.ruleType != "volition") continue;

                if (CheckRuleConditions(rule, context))
                {
                    var restriction = FindRestriction(rule, context.actionType);
                    if (restriction != null)
                    {
                        var msg = string.IsNullOrEmpty(restriction.message)
                            ? $"Action violates rule: {rule.name}"
                            : restriction.message;
                        violations.Add(msg);
                    }
                }
            }

            return violations;
        }

        /// <summary>
        /// Check if an action is allowed, consulting Prolog KB when available.
        /// Mirrors RuleEnforcer.canPerformActionAsync from the Babylon.js source.
        /// </summary>
        public bool CanPerformAction(string actionId, string actionType, InsimulGameContext context)
        {
            if (HasPrologKB)
            {
                Debug.Log($"[Insimul] Consulting Prolog KB for action {actionId}");
            }

            context.actionId = actionId;
            context.actionType = actionType;

            var violations = EvaluateRules(context);
            return violations.Count == 0;
        }

        /// <summary>
        /// Attach a Prolog knowledge base string for logic-based rule evaluation.
        /// The KB content is stored and used for quest condition checks (quest_complete,
        /// quest_available, quest_cefr_level) via lightweight string search rather than
        /// requiring a full Prolog interpreter in the export.
        /// </summary>
        public void SetPrologKnowledgeBase(string prologContent)
        {
            _prologContent = prologContent;
            HasPrologKB = !string.IsNullOrEmpty(prologContent);
            Debug.Log($"[Insimul] Prolog KB {(HasPrologKB ? "attached" : "cleared")} ({(prologContent?.Length ?? 0)} chars)");
        }

        // --- Settlement zone registration ---

        /// <summary>Register a settlement zone for spatial in-settlement checks.</summary>
        public void RegisterSettlementZone(string settlementId, Vector3 position, float radius)
        {
            _settlementZones.Add(new SettlementZone
            {
                settlementId = settlementId,
                position = position,
                radius = radius
            });
            Debug.Log($"[Insimul] Registered settlement zone '{settlementId}' at {position} radius {radius}");
        }

        /// <summary>Check if a position is within any registered settlement zone.</summary>
        public bool IsInSettlement(Vector3 position, out string settlementId)
        {
            foreach (var zone in _settlementZones)
            {
                float distance = Vector3.Distance(position, zone.position);
                if (distance <= zone.radius)
                {
                    settlementId = zone.settlementId;
                    return true;
                }
            }
            settlementId = null;
            return false;
        }

        // --- Violation tracking ---

        /// <summary>Record a rule violation.</summary>
        public void RecordViolation(string ruleId, string ruleName, string severity, string message)
        {
            var violation = new RuleViolation
            {
                ruleId = ruleId,
                ruleName = ruleName,
                timestamp = Time.time,
                severity = severity,
                message = message
            };
            _violations.Add(violation);
            Debug.Log($"[Insimul] Violation recorded: {ruleName} — {message}");
            OnViolation?.Invoke(violation);
        }

        /// <summary>Get recent violations (up to limit).</summary>
        public List<RuleViolation> GetViolations(int limit = 10)
        {
            if (limit <= 0 || limit >= _violations.Count)
                return new List<RuleViolation>(_violations);

            return _violations.GetRange(_violations.Count - limit, limit);
        }

        /// <summary>Clear all recorded violations.</summary>
        public void ClearViolations()
        {
            _violations.Clear();
            Debug.Log("[Insimul] Violations cleared");
        }

        // --- Condition evaluation ---

        private bool CheckRuleConditions(InsimulRule rule, InsimulGameContext context)
        {
            if (rule.conditions == null || rule.conditions.Count == 0) return true;
            return rule.conditions.All(c => EvaluateCondition(c, context));
        }

        private bool EvaluateCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            return condition.type switch
            {
                "location" => CheckLocationCondition(condition, context),
                "zone" => CheckZoneCondition(condition, context),
                "action" => CheckActionCondition(condition, context),
                "energy" => CheckEnergyCondition(condition, context),
                "proximity" => context.nearNPC,
                "tag" => true,
                "has_item" => CheckHasItemCondition(condition, context),
                "item_count" => CheckItemCountCondition(condition, context),
                "item_type" => CheckItemTypeCondition(condition, context),
                "quest_complete" => CheckQuestCompleteCondition(condition, context),
                "quest_available" => CheckQuestAvailableCondition(condition, context),
                "cefr_level" => CheckCefrLevelCondition(condition, context),
                _ => true
            };
        }

        private bool CheckLocationCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (condition.location == "settlement") return context.inSettlement;
            if (condition.location == "wilderness") return !context.inSettlement;
            return true;
        }

        private bool CheckZoneCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (condition.zone == "safe" || condition.zone == "settlement") return context.inSettlement;
            if (condition.zone == "combat" || condition.zone == "wilderness") return !context.inSettlement;
            return true;
        }

        private bool CheckActionCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (!string.IsNullOrEmpty(condition.action))
            {
                return context.actionType == condition.action || context.actionId == condition.action;
            }
            return true;
        }

        private bool CheckEnergyCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (context.playerEnergy < 0f) return true;
            return CompareValue(context.playerEnergy, condition.value, string.IsNullOrEmpty(condition.op) ? ">=" : condition.op);
        }

        private bool CheckHasItemCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (context.playerInventory == null || context.playerInventory.Count == 0) return false;

            foreach (var item in context.playerInventory)
            {
                if (!string.IsNullOrEmpty(condition.itemId) && item.id == condition.itemId) return true;
                if (!string.IsNullOrEmpty(condition.itemName) &&
                    string.Equals(item.name, condition.itemName, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        private bool CheckItemCountCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (context.playerInventory == null || context.playerInventory.Count == 0) return false;

            var matchingItem = context.playerInventory.Find(item =>
                (!string.IsNullOrEmpty(condition.itemId) && item.id == condition.itemId) ||
                (!string.IsNullOrEmpty(condition.itemName) &&
                 string.Equals(item.name, condition.itemName, StringComparison.OrdinalIgnoreCase)));

            int qty = matchingItem?.quantity ?? 0;
            return CompareValue(qty, condition.quantity, string.IsNullOrEmpty(condition.op) ? ">=" : condition.op);
        }

        private bool CheckItemTypeCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (context.playerInventory == null || string.IsNullOrEmpty(condition.itemType)) return false;

            if (!Enum.TryParse<InsimulItemType>(condition.itemType, true, out var targetType)) return false;

            return context.playerInventory.Exists(item => item.type == targetType);
        }

        private bool CheckQuestCompleteCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (!HasPrologKB || string.IsNullOrEmpty(condition.questId)) return false;
            // Search the KB for quest_complete(player, "<questId>")
            return _prologContent.Contains($"quest_complete(player, \"{condition.questId}\")");
        }

        private bool CheckQuestAvailableCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (!HasPrologKB || string.IsNullOrEmpty(condition.questId)) return false;
            // Search the KB for quest_available(player, "<questId>")
            return _prologContent.Contains($"quest_available(player, \"{condition.questId}\")");
        }

        private bool CheckCefrLevelCondition(InsimulRuleCondition condition, InsimulGameContext context)
        {
            if (!HasPrologKB || string.IsNullOrEmpty(condition.questId) || string.IsNullOrEmpty(condition.cefrLevel)) return false;
            // Search the KB for quest_cefr_level("<questId>", "<level>")
            return _prologContent.Contains($"quest_cefr_level(\"{condition.questId}\", \"{condition.cefrLevel}\")");
        }

        private bool CompareValue(float actual, float expected, string op)
        {
            return op switch
            {
                ">" => actual > expected,
                ">=" => actual >= expected,
                "<" => actual < expected,
                "<=" => actual <= expected,
                "==" => Mathf.Approximately(actual, expected),
                _ => actual >= expected
            };
        }

        private InsimulRuleEffect FindRestriction(InsimulRule rule, string actionType)
        {
            if (rule.effects == null) return null;

            foreach (var effect in rule.effects)
            {
                if (effect.type == "restrict" || effect.type == "prevent" || effect.type == "block")
                {
                    if (string.IsNullOrEmpty(effect.action) || effect.action == actionType || effect.action == "all")
                    {
                        return effect;
                    }
                }
            }
            return null;
        }

        // --- Atom helpers (match ir-generator.ts sanitizeAtom / nameAtom) ---

        /// <summary>
        /// Convert a display name to the Prolog KB atom format used by the knowledge base.
        /// The KB uses human-readable atoms (e.g. "john_smith") rather than raw entity IDs.
        /// Use this to translate entity names when cross-referencing JSON data with KB facts.
        /// </summary>
        public static string SanitizeToAtom(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "unknown";

            var result = name.ToLowerInvariant();
            // Replace non-alphanumeric (except underscore) with underscore
            result = System.Text.RegularExpressions.Regex.Replace(result, @"[^a-z0-9_]", "_");
            // Prefix leading digit
            if (result.Length > 0 && char.IsDigit(result[0]))
                result = "_" + result;
            // Collapse multiple underscores
            result = System.Text.RegularExpressions.Regex.Replace(result, @"_+", "_");
            // Strip leading/trailing underscores
            result = result.Trim('_');

            return string.IsNullOrEmpty(result) ? "unknown" : result;
        }

        /// <summary>
        /// Convert an entity display name to a KB atom, stripping accents.
        /// Falls back to SanitizeToAtom(fallbackId) if name is empty.
        /// </summary>
        public static string NameToAtom(string name, string fallbackId = "unknown")
        {
            if (!string.IsNullOrWhiteSpace(name))
            {
                // Strip combining diacritical marks (NFD normalization)
                var normalized = name.Normalize(System.Text.NormalizationForm.FormD);
                var sb = new System.Text.StringBuilder();
                foreach (var ch in normalized)
                {
                    if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch)
                        != System.Globalization.UnicodeCategory.NonSpacingMark)
                        sb.Append(ch);
                }
                return SanitizeToAtom(sb.ToString());
            }
            return SanitizeToAtom(string.IsNullOrEmpty(fallbackId) ? "unknown" : fallbackId);
        }
    }
}
