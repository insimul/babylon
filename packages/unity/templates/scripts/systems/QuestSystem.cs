using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Insimul.Data;

namespace Insimul.Systems
{
    // ── Field comparison for quest-action mapping ───────────────────────────

    public enum FieldComparison { Exact, Contains, ContainsLower }

    [Serializable]
    public class FieldMatchRule
    {
        public string eventField;
        public string objectiveField;
        public FieldComparison comparison = FieldComparison.Exact;
        public bool optional;
    }

    [Serializable]
    public class QuantityTracking
    {
        public string currentField;
        public string requiredField;
        public int defaultRequired = 1;
    }

    [Serializable]
    public class QuestActionMapping
    {
        public string objectiveType;
        public string eventType;
        public List<FieldMatchRule> matchFields = new();
        public bool hasQuantity;
        public QuantityTracking quantity;
        public string description;
    }

    // ── Quest objective ─────────────────────────────────────────────────────

    /// <summary>
    /// Quest objective data mirroring Insimul's CompletionObjective interface.
    /// </summary>
    [Serializable]
    public class QuestObjective
    {
        public string id;
        public string questId;
        public string type;
        public string description;
        public bool completed;
        public int requiredCount = 1;
        public int currentCount;

        // ── Time limit ──────────────────────────────────────────────────
        /// <summary>Time limit in seconds (0 = untimed).</summary>
        public float timeLimitSeconds;
        /// <summary>Game-time when objective was started (-1 = not started).</summary>
        public float startedAt = -1f;
        /// <summary>Number of English hints requested (navigation/directions).</summary>
        public int hintsRequested;
        /// <summary>Whether a GPS-style waypoint is currently shown.</summary>
        public bool showWaypoint;

        // ── Vocabulary ──────────────────────────────────────────────────
        /// <summary>Vocabulary category for scavenger hunt rotation.</summary>
        public string vocabularyCategory;
        /// <summary>Target words for vocabulary objectives (empty = any word counts).</summary>
        public List<string> targetWords = new();
        /// <summary>Words already used (for deduplication).</summary>
        public List<string> wordsUsed = new();

        // ── Writing ─────────────────────────────────────────────────────
        /// <summary>Writing prompt for write_response / describe_scene objectives.</summary>
        public string writingPrompt;
        /// <summary>Submitted written responses.</summary>
        public List<string> writtenResponses = new();
        /// <summary>Minimum word count required per submission (0 = no minimum).</summary>
        public int minWordCount;

        // ── Item / delivery ─────────────────────────────────────────────
        /// <summary>Item name for collect_item / deliver_item objectives.</summary>
        public string itemName;
        /// <summary>Item ID for deliver_item objectives.</summary>
        public string itemId;
        /// <summary>Required item count for quantity-based collection.</summary>
        public int itemCount = 1;
        /// <summary>Number of items collected so far.</summary>
        public int collectedCount;
        /// <summary>Whether the delivery has been completed.</summary>
        public bool delivered;
        /// <summary>Whether the escort arrived.</summary>
        public bool arrived;

        // ── NPC-targeted ────────────────────────────────────────────────
        /// <summary>NPC ID for NPC-targeted objectives.</summary>
        public string npcId;
        /// <summary>NPC name for display/matching.</summary>
        public string npcName;
        /// <summary>Escort NPC ID.</summary>
        public string escortNpcId;

        // ── Conversation initiation ─────────────────────────────────────
        /// <summary>Whether conversation was NPC-initiated.</summary>
        public bool npcInitiated;
        /// <summary>Response quality score (0-100).</summary>
        public float responseQuality;
        /// <summary>Minimum response quality to count as completion.</summary>
        public float minResponseQuality;

        // ── Teaching ────────────────────────────────────────────────────
        /// <summary>Words taught to NPC (for teach_vocabulary deduplication).</summary>
        public List<string> wordsTaught = new();
        /// <summary>Phrases taught to NPC (for teach_phrase deduplication).</summary>
        public List<string> phrasesTaught = new();

        // ── Pronunciation ───────────────────────────────────────────────
        /// <summary>All pronunciation attempt scores.</summary>
        public List<float> pronunciationScores = new();
        /// <summary>Best pronunciation score achieved.</summary>
        public float pronunciationBestScore;
        /// <summary>Minimum average score required for completion.</summary>
        public float minAverageScore;
        /// <summary>Target phrases for pronunciation objectives.</summary>
        public List<string> targetPhrases = new();
        /// <summary>Single target phrase.</summary>
        public string targetPhrase;

        /// <summary>Optional pronunciation hint texts (parallel array with hintScorePenalties).</summary>
        public List<string> hintTexts = new();
        /// <summary>Per-hint score penalty (additive, clamped to [0,1]).</summary>
        public List<float> hintScorePenalties = new();
        /// <summary>How many hints have been revealed so far.</summary>
        public int hintsRevealed;

        // ── Romance ─────────────────────────────────────────────────────
        /// <summary>Target romance stage for romance_stage_reach (e.g. "dating").</summary>
        public string targetRomanceStage;
        /// <summary>Optional gift recipient NPC for romance_gift (empty = any).</summary>
        public string romanceGiftRecipientNpcId;

        // ── Enemies ─────────────────────────────────────────────────────
        /// <summary>Enemy type to defeat.</summary>
        public string enemyType;
        /// <summary>Enemies defeated so far.</summary>
        public int enemiesDefeated;
        /// <summary>Required enemy defeat count.</summary>
        public int enemiesRequired = 1;

        // ── Crafting ────────────────────────────────────────────────────
        /// <summary>Crafted item identifier.</summary>
        public string craftedItemId;
        /// <summary>Number of items crafted.</summary>
        public int craftedCount;

        // ── Reputation ──────────────────────────────────────────────────
        public string factionId;
        public int reputationGained;
        public int reputationRequired;

        // ── Listening comprehension ─────────────────────────────────────
        public int questionsAnswered;
        public int questionsCorrect;
        public string listeningStoryNpcId;

        // ── Translation challenge ───────────────────────────────────────
        public int translationsCompleted;
        public int translationsCorrect;

        // ── Navigation / direction steps ────────────────────────────────
        public int stepsCompleted;
        public int stepsRequired;
        public int waypointsReached;
        public string navigationInstructions;
        public string locationName;

        // ── Mercantile ──────────────────────────────────────────────────
        public string merchantId;
        public string businessType;
        public List<string> itemsPurchased = new();

        // ── Photography / observation ───────────────────────────────────
        public string targetSubject;
        public string targetCategory; // "item", "npc", "building", "nature"
        public string targetActivity;
        public List<string> photographedSubjects = new();
        public List<string> observedActivities = new();
        public float observeDurationRequired = 5f;

        // ── Text / reading / comprehension ──────────────────────────────
        public string textId;
        public List<string> textsFound = new();
        public List<string> textsRead = new();
        public int quizAnswered;
        public int quizCorrect;
        public int quizPassThreshold;

        // ── Physical action ─────────────────────────────────────────────
        public string actionType;
        public int actionsCompleted;
        public int actionsRequired = 1;

        // ── Dependency ordering ─────────────────────────────────────────
        /// <summary>Objective IDs that must be completed before this one.</summary>
        public List<string> dependsOn = new();
        /// <summary>Numeric order for sequential completion (lower = earlier; -1 = unordered).</summary>
        public int order = -1;

        // ── Declarative trigger ─────────────────────────────────────────
        /// <summary>When an event with this type fires, the objective is auto-completed.</summary>
        public string completionTrigger;
    }

    // ── Result structs ──────────────────────────────────────────────────────

    /// <summary>
    /// Result struct returned by TrackCollectedItemByName for each matched objective.
    /// </summary>
    [Serializable]
    public struct CollectedItemMatch
    {
        public string questId;
        public string objectiveId;
        public string matchedName;
        public int collectedCount;
        public int requiredCount;
        public bool completed;
    }

    /// <summary>Pronunciation stats returned by GetPronunciationStats.</summary>
    [Serializable]
    public struct PronunciationStats
    {
        public float[] scores;
        public float average;
        public int passed;
        public bool valid;
    }

    // ── Quest system ────────────────────────────────────────────────────────

    public class QuestSystem : MonoBehaviour
    {
        public event Action<string, string> OnStoryTTS;
        public event Action<string, string, string> OnQuestItemCollected;
        public event Action<string> OnQuestAccepted;
        public event Action<string> OnQuestCompleted;
        public event Action<string, string> OnObjectiveCompleted;

        /// <summary>Scavenger hunt categories for vocabulary rotation.</summary>
        public static readonly string[] SCAVENGER_CATEGORIES = {
            "food", "colors", "animals", "clothing", "household",
            "nature", "body", "professions", "transportation", "weather"
        };

        private List<InsimulQuestData> _allQuests = new();
        private List<string> _activeQuestIds = new();
        private HashSet<string> _completedQuestIds = new();
        private List<QuestObjective> _objectives = new();
        private float _gameTime;
        private List<QuestActionMapping> _actionMappings = new();

        public int QuestCount => _allQuests.Count;
        public int ActiveCount => _activeQuestIds.Count;

        private void Awake()
        {
            BuildActionMappingCatalog();
        }

        private void Update()
        {
            _gameTime += Time.deltaTime;
        }

        // ── Action mapping catalog ──────────────────────────────────────

        private void BuildActionMappingCatalog()
        {
            _actionMappings.Clear();

            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "collect_item", eventType = "item_collected",
                matchFields = new() { new() { eventField = "itemName", objectiveField = "itemName", comparison = FieldComparison.ContainsLower, optional = true } },
                hasQuantity = true, quantity = new() { currentField = "collectedCount", requiredField = "itemCount", defaultRequired = 1 },
                description = "Player collects an item into inventory"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "visit_location", eventType = "location_visited",
                matchFields = new() { new() { eventField = "locationName", objectiveField = "locationName", comparison = FieldComparison.ContainsLower, optional = true } },
                description = "Player visits a named location"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "discover_location", eventType = "location_discovered",
                matchFields = new() { new() { eventField = "locationName", objectiveField = "locationName", comparison = FieldComparison.ContainsLower, optional = true } },
                description = "Player discovers a new location"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "talk_to_npc", eventType = "npc_talked",
                matchFields = new() { new() { eventField = "npcId", objectiveField = "npcId", comparison = FieldComparison.Exact, optional = true } },
                description = "Player talks to an NPC"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "photograph_subject", eventType = "photo_taken",
                matchFields = new() {
                    new() { eventField = "subjectName", objectiveField = "targetSubject", comparison = FieldComparison.ContainsLower, optional = true },
                    new() { eventField = "subjectCategory", objectiveField = "targetCategory", comparison = FieldComparison.Exact, optional = true }
                },
                hasQuantity = true, quantity = new() { currentField = "currentCount", requiredField = "requiredCount", defaultRequired = 1 },
                description = "Player photographs a subject"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "photograph_activity", eventType = "photo_taken",
                matchFields = new() {
                    new() { eventField = "subjectName", objectiveField = "targetSubject", comparison = FieldComparison.ContainsLower, optional = true },
                    new() { eventField = "subjectCategory", objectiveField = "targetCategory", comparison = FieldComparison.Exact, optional = true }
                },
                hasQuantity = true, quantity = new() { currentField = "currentCount", requiredField = "requiredCount", defaultRequired = 1 },
                description = "Player photographs an activity"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "physical_action", eventType = "physical_action_completed",
                matchFields = new() { new() { eventField = "actionType", objectiveField = "actionType", comparison = FieldComparison.Exact, optional = true } },
                hasQuantity = true, quantity = new() { currentField = "actionsCompleted", requiredField = "actionsRequired", defaultRequired = 1 },
                description = "Player performs a physical action at a hotspot"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "craft_item", eventType = "item_crafted",
                matchFields = new() { new() { eventField = "itemName", objectiveField = "itemName", comparison = FieldComparison.ContainsLower, optional = true } },
                hasQuantity = true, quantity = new() { currentField = "craftedCount", requiredField = "requiredCount", defaultRequired = 1 },
                description = "Player crafts an item"
            });
            _actionMappings.Add(new QuestActionMapping {
                objectiveType = "buy_item", eventType = "item_purchased",
                matchFields = new() { new() { eventField = "itemName", objectiveField = "itemName", comparison = FieldComparison.ContainsLower, optional = true } },
                hasQuantity = true, quantity = new() { currentField = "currentCount", requiredField = "requiredCount", defaultRequired = 1 },
                description = "Player purchases an item from a merchant"
            });
        }

        // ── Data loading ────────────────────────────────────────────────

        public void LoadFromData(InsimulWorldIR worldData)
        {
            if (worldData?.systems?.quests == null) return;
            _allQuests.AddRange(worldData.systems.quests);
            Debug.Log($"[Insimul] QuestSystem loaded {_allQuests.Count} quests");
        }

        // ── Internal helpers ────────────────────────────────────────────

        private bool IsObjectiveLocked(QuestObjective objective)
        {
            // Check explicit dependsOn
            if (objective.dependsOn.Count > 0)
            {
                foreach (var depId in objective.dependsOn)
                {
                    var dep = _objectives.Find(o => o.id == depId);
                    if (dep != null && !dep.completed) return true;
                }
            }
            // Check order-based sequencing
            if (objective.order >= 0)
            {
                foreach (var other in _objectives)
                {
                    if (other.id == objective.id) continue;
                    if (other.questId != objective.questId) continue;
                    if (other.order >= 0 && other.order < objective.order && !other.completed)
                        return true;
                }
            }
            return false;
        }

        private delegate void ObjectiveCallback(QuestObjective obj);

        private void ForEachObjective(string questId, string[] types, ObjectiveCallback callback)
        {
            // Snapshot eligible objectives before iteration
            var eligible = _objectives.FindAll(obj =>
                !obj.completed &&
                (string.IsNullOrEmpty(questId) || obj.questId == questId) &&
                types.Contains(obj.type) &&
                !IsObjectiveLocked(obj));

            foreach (var obj in eligible)
            {
                if (obj.completed) continue; // re-check
                callback(obj);
            }
        }

        // ── Quest management ────────────────────────────────────────────

        public bool AcceptQuest(string questId)
        {
            var quest = _allQuests.Find(q => q.id == questId);
            if (quest == null || _activeQuestIds.Contains(questId)) return false;
            _activeQuestIds.Add(questId);
            Debug.Log($"[Insimul] Quest accepted: {quest.title}");
            OnQuestAccepted?.Invoke(questId);
            return true;
        }

        public bool CompleteQuest(string questId)
        {
            if (!_activeQuestIds.Contains(questId)) return false;
            _activeQuestIds.Remove(questId);
            _completedQuestIds.Add(questId);
            Debug.Log($"[Insimul] Quest completed: {questId}");
            OnQuestCompleted?.Invoke(questId);
            return true;
        }

        public bool CompleteObjective(string questId, string objectiveId)
        {
            var obj = _objectives.Find(o => o.questId == questId && o.id == objectiveId);
            if (obj == null || obj.completed) return false;
            if (IsObjectiveLocked(obj)) return false;

            obj.completed = true;
            OnObjectiveCompleted?.Invoke(questId, objectiveId);
            Debug.Log($"[Insimul] Objective completed: {questId}/{objectiveId}");

            // Check if all objectives for this quest are complete
            if (IsQuestComplete(questId))
            {
                OnQuestCompleted?.Invoke(questId);
            }
            return true;
        }

        /// <summary>Check if a specific objective is complete.</summary>
        public bool IsObjectiveComplete(string questId, string objectiveId)
        {
            var obj = _objectives.Find(o => o.questId == questId && o.id == objectiveId);
            return obj?.completed ?? false;
        }

        /// <summary>Check if all objectives for a quest are complete.</summary>
        public bool IsQuestComplete(string questId)
        {
            var questObjectives = _objectives.FindAll(o => o.questId == questId);
            if (questObjectives.Count == 0) return false;
            return questObjectives.All(o => o.completed);
        }

        /// <summary>Get all unlocked, incomplete objectives for a quest.</summary>
        public List<QuestObjective> GetAvailableObjectives(string questId) =>
            _objectives.FindAll(o => o.questId == questId && !o.completed && !IsObjectiveLocked(o));

        /// <summary>Get all locked objectives for a quest.</summary>
        public List<QuestObjective> GetLockedObjectives(string questId) =>
            _objectives.FindAll(o => o.questId == questId && !o.completed && IsObjectiveLocked(o));

        // ── Timed objectives ────────────────────────────────────────────

        /// <summary>Check timed objectives and return descriptions of expired ones.</summary>
        public List<string> CheckTimedObjectives()
        {
            var expired = new List<string>();
            foreach (var obj in _objectives)
            {
                if (obj.completed) continue;
                if (obj.timeLimitSeconds <= 0f || obj.startedAt < 0f) continue;

                float elapsed = _gameTime - obj.startedAt;
                if (elapsed > obj.timeLimitSeconds)
                {
                    obj.completed = true;
                    expired.Add($"Time expired: {obj.description}");
                    Debug.Log($"[Insimul] Timed objective expired: {obj.id}");
                }
            }
            return expired;
        }

        /// <summary>Get remaining seconds for a timed objective, or -1 if untimed.</summary>
        public float GetObjectiveTimeRemaining(string objectiveId)
        {
            var obj = _objectives.Find(o => o.id == objectiveId);
            if (obj != null && obj.timeLimitSeconds > 0f && obj.startedAt >= 0f)
            {
                float elapsed = _gameTime - obj.startedAt;
                return Mathf.Max(0f, obj.timeLimitSeconds - elapsed);
            }
            return -1f;
        }

        /// <summary>Request a GPS-style waypoint hint. Returns English hint or null.</summary>
        public string RequestNavigationHint(string questId = null)
        {
            foreach (var obj in _objectives)
            {
                if (obj.completed) continue;
                if (!string.IsNullOrEmpty(questId) && obj.questId != questId) continue;
                if (obj.type != "navigate_language" && obj.type != "follow_directions") continue;

                obj.hintsRequested++;
                obj.showWaypoint = true;
                Debug.Log($"[Insimul] Navigation hint #{obj.hintsRequested} for {obj.id}");
                return obj.description;
            }
            return null;
        }

        /// <summary>Get next scavenger hunt category (round-robin).</summary>
        public static string GetNextScavengerCategory(int lastCategoryIndex)
        {
            int next = (lastCategoryIndex + 1) % SCAVENGER_CATEGORIES.Length;
            return SCAVENGER_CATEGORIES[next];
        }

        // ── NPC / conversation tracking ─────────────────────────────────

        /// <summary>Track NPC conversation for talk_to_npc objectives.</summary>
        public void TrackNPCConversation(string npcId, string questId = null)
        {
            ForEachObjective(questId, new[] { "talk_to_npc" }, obj => {
                if (obj.npcId == npcId)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track vocabulary usage for use_vocabulary / collect_vocabulary objectives.</summary>
        public void TrackVocabularyUsage(string word, string questId = null)
        {
            string lowerWord = word.ToLowerInvariant();

            ForEachObjective(questId, new[] { "use_vocabulary", "collect_vocabulary" }, obj => {
                if (obj.targetWords.Count > 0 && !obj.targetWords.Contains(lowerWord)) return;
                if (obj.wordsUsed.Contains(lowerWord)) return;

                obj.wordsUsed.Add(lowerWord);
                obj.currentCount++;

                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 10))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a conversation turn for complete_conversation objectives.</summary>
        public void TrackConversationTurn(string[] keywords = null, string questId = null)
        {
            ForEachObjective(questId, new[] { "complete_conversation" }, obj => {
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 5))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track NPC-initiated conversation acceptance for conversation_initiation objectives.</summary>
        public void TrackConversationInitiation(string npcId, bool accepted, float responseQuality = 100f, string questId = null)
        {
            if (!accepted) return;

            ForEachObjective(questId, new[] { "conversation_initiation" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;

                obj.currentCount++;
                obj.responseQuality = responseQuality;

                float minQuality = obj.minResponseQuality;
                bool meetsQuality = responseQuality >= minQuality;

                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1) && meetsQuality)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track topic-based NPC conversation turns.</summary>
        public void TrackNpcConversationTurn(string npcId, string topicTag = null, string questId = null)
        {
            var tagToTypes = new Dictionary<string, string[]> {
                { "directions", new[] { "ask_for_directions" } },
                { "order", new[] { "order_food" } },
                { "haggle", new[] { "haggle_price" } },
                { "introduction", new[] { "introduce_self" } },
                { "friendship", new[] { "build_friendship" } },
            };

            string[] targetTypes;
            if (!string.IsNullOrEmpty(topicTag) && tagToTypes.ContainsKey(topicTag))
                targetTypes = tagToTypes[topicTag];
            else
                targetTypes = new[] { "ask_for_directions", "order_food", "haggle_price", "introduce_self", "build_friendship" };

            ForEachObjective(questId, targetTypes, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track accumulated conversation turns for arrival_conversation objectives.</summary>
        public void TrackConversationTurnCounted(string npcId, int totalTurns, int meaningfulTurns, string questId = null)
        {
            ForEachObjective(questId, new[] { "arrival_conversation" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;
                obj.currentCount = meaningfulTurns;
                if (meaningfulTurns >= (obj.requiredCount > 0 ? obj.requiredCount : 3))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a detected conversational action against matching objectives.</summary>
        public void TrackConversationalAction(string action, string npcId, string topic = null, string questId = null)
        {
            var actionToObjectiveTypes = new Dictionary<string, string[]> {
                { "asked_about_topic", new[] { "asked_about_topic" } },
                { "used_target_language", new[] { "used_target_language", "arrival_writing" } },
                { "answered_question", new[] { "answered_question" } },
                { "requested_information", new[] { "requested_information", "ask_for_directions" } },
                { "made_introduction", new[] { "made_introduction", "introduce_self" } },
            };

            string[] targetTypes;
            if (actionToObjectiveTypes.ContainsKey(action))
                targetTypes = actionToObjectiveTypes[action];
            else
                targetTypes = new[] { action };

            ForEachObjective(questId, targetTypes, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;

                // For topic-based objectives, check topic match
                if (obj.type == "asked_about_topic" && obj.targetWords.Count > 0)
                {
                    if (!string.IsNullOrEmpty(topic) && !obj.targetWords.Contains(topic)) return;
                }

                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });

            // Also fire arrival_initiate_conversation for any conversational action
            ForEachObjective(questId, new[] { "arrival_initiate_conversation" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;
                CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Pronunciation ───────────────────────────────────────────────

        /// <summary>Track a pronunciation attempt. Score is 0-100.</summary>
        public void TrackPronunciationAttempt(bool passed, float score = 0f, string phrase = null, string questId = null)
        {
            ForEachObjective(questId, new[] { "pronunciation_check", "listen_and_repeat", "speak_phrase" }, obj => {
                if (score > 0f)
                {
                    obj.pronunciationScores.Add(score);
                    if (score > obj.pronunciationBestScore)
                        obj.pronunciationBestScore = score;
                }

                if (passed)
                {
                    obj.currentCount++;
                    int required = obj.requiredCount > 0 ? obj.requiredCount : 3;
                    if (obj.currentCount >= required)
                    {
                        // If minAverageScore is set, check average before completing
                        if (obj.minAverageScore > 0f && obj.pronunciationScores.Count > 0)
                        {
                            float avg = obj.pronunciationScores.Average();
                            if (avg >= obj.minAverageScore)
                                CompleteObjective(obj.questId, obj.id);
                        }
                        else
                        {
                            CompleteObjective(obj.questId, obj.id);
                        }
                    }
                }
            });
        }

        /// <summary>Get pronunciation statistics for an objective.</summary>
        public PronunciationStats GetPronunciationStats(string questId, string objectiveId)
        {
            var obj = _objectives.Find(o => o.questId == questId && o.id == objectiveId && o.type == "pronunciation_check");
            if (obj == null) return new PronunciationStats();

            var scores = obj.pronunciationScores.ToArray();
            float avg = scores.Length > 0 ? scores.Average() : 0f;
            return new PronunciationStats { scores = scores, average = avg, passed = scores.Length, valid = true };
        }

        /// <summary>
        /// Reveal the next hint on a pronunciation objective. Returns the hint
        /// text or null when no more hints are available. Each revealed hint
        /// applies its score penalty to subsequent attempts.
        /// </summary>
        public string RevealPronunciationHint(string questId, string objectiveId)
        {
            var obj = _objectives.Find(o => o.questId == questId && o.id == objectiveId);
            if (obj == null) return null;
            if (obj.hintsRevealed >= obj.hintTexts.Count) return null;
            string hint = obj.hintTexts[obj.hintsRevealed];
            obj.hintsRevealed++;
            return hint;
        }

        // ── Romance ─────────────────────────────────────────────────────

        private static readonly string[] ROMANCE_STAGE_ORDER = {
            "none", "attracted", "flirting", "dating", "committed", "engaged", "married"
        };

        /// <summary>Complete romance_stage_reach objectives whose target stage has been met.</summary>
        public void TrackRomanceStageReach(string currentStage, string questId = null)
        {
            int currentIdx = Array.IndexOf(ROMANCE_STAGE_ORDER, (currentStage ?? "").ToLowerInvariant());
            if (currentIdx < 0) return;

            ForEachObjective(questId, new[] { "romance_stage_reach" }, obj => {
                string target = !string.IsNullOrEmpty(obj.targetRomanceStage) ? obj.targetRomanceStage : obj.targetPhrase;
                target = (target ?? "").ToLowerInvariant();
                int targetIdx = Array.IndexOf(ROMANCE_STAGE_ORDER, target);
                if (targetIdx < 0) return;
                if (currentIdx >= targetIdx)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Complete romance_gift objectives when the player gifts a romance target.</summary>
        public void TrackRomanceGift(string npcId, string questId = null)
        {
            ForEachObjective(questId, new[] { "romance_gift" }, obj => {
                if (!string.IsNullOrEmpty(obj.romanceGiftRecipientNpcId) && obj.romanceGiftRecipientNpcId != npcId) return;
                obj.currentCount++;
                int required = obj.requiredCount > 0 ? obj.requiredCount : 1;
                if (obj.currentCount >= required)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Writing ─────────────────────────────────────────────────────

        /// <summary>Track a writing submission for write_response / describe_scene / arrival_writing objectives.</summary>
        public void TrackWritingSubmission(string text, int wordCount, string questId = null)
        {
            // Complete arrival_writing objectives with word count validation
            ForEachObjective(questId, new[] { "arrival_writing" }, obj => {
                int minWords = obj.minWordCount > 0 ? obj.minWordCount : 20;
                if (wordCount >= minWords)
                    CompleteObjective(obj.questId, obj.id);
            });

            ForEachObjective(questId, new[] { "write_response", "describe_scene" }, obj => {
                obj.writtenResponses.Add(text);
                obj.currentCount++;

                if (obj.minWordCount > 0 && wordCount < obj.minWordCount) return;

                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Item tracking ───────────────────────────────────────────────

        /// <summary>Track item delivery to an NPC for deliver_item objectives.</summary>
        public void TrackItemDelivery(string npcId, string[] playerItemNames, string questId = null)
        {
            var normalizedItems = new HashSet<string>(
                playerItemNames.Select(n => n.ToLowerInvariant()));

            ForEachObjective(questId, new[] { "deliver_item" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;

                string itemLower = (obj.itemName ?? "").ToLowerInvariant();
                if (!string.IsNullOrEmpty(itemLower) && normalizedItems.Contains(itemLower))
                {
                    obj.delivered = true;
                    CompleteObjective(obj.questId, obj.id);
                }
            });
        }

        /// <summary>Check inventory items against collect_item / collect_items objectives.</summary>
        public void CheckInventoryObjectives(string[] playerItemNames, string questId = null)
        {
            var normalizedItems = playerItemNames.Select(n => n.ToLowerInvariant()).ToList();

            ForEachObjective(questId, new[] { "collect_item", "collect_items" }, obj => {
                string objName = (obj.itemName ?? "").ToLowerInvariant();
                if (string.IsNullOrEmpty(objName)) return;

                bool matched = normalizedItems.Any(n =>
                    n == objName || n.Contains(objName) || objName.Contains(n));
                if (matched)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a crafted item for craft_item objectives.</summary>
        public void TrackItemCrafted(string itemId, string questId = null)
        {
            ForEachObjective(questId, new[] { "craft_item" }, obj => {
                if (obj.craftedItemId == itemId || obj.itemName == itemId)
                {
                    obj.craftedCount++;
                    if (obj.craftedCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                        CompleteObjective(obj.questId, obj.id);
                }
            });
        }

        /// <summary>Track a collected item by name (supports exact, partial, category, and word-overlap matching).</summary>
        public List<CollectedItemMatch> TrackCollectedItemByName(string itemName, string category = null, string questId = null)
        {
            var matches = new List<CollectedItemMatch>();
            string lowerItem = itemName.ToLowerInvariant();
            string lowerCat = category?.ToLowerInvariant();

            ForEachObjective(questId, new[] { "collect_item" }, obj => {
                string objItemLower = (obj.itemName ?? "").ToLowerInvariant();
                bool nameMatch = false;

                // Exact match
                if (!string.IsNullOrEmpty(objItemLower) && objItemLower == lowerItem)
                    nameMatch = true;
                // Partial match
                else if (!string.IsNullOrEmpty(objItemLower) && (lowerItem.Contains(objItemLower) || objItemLower.Contains(lowerItem)))
                    nameMatch = true;
                // Category match
                else if (!string.IsNullOrEmpty(lowerCat) && !string.IsNullOrEmpty(obj.vocabularyCategory) &&
                         string.Equals(obj.vocabularyCategory, category, StringComparison.OrdinalIgnoreCase))
                    nameMatch = true;
                // Word-overlap matching
                else if (!string.IsNullOrEmpty(objItemLower))
                {
                    var objWords = objItemLower.Split(' ');
                    var keyWords = lowerItem.Split(' ');
                    nameMatch = objWords.Any(w => w.Length >= 3 && keyWords.Contains(w)) ||
                                keyWords.Any(w => w.Length >= 3 && objWords.Contains(w));
                }
                // No item name means any item counts
                else if (string.IsNullOrEmpty(objItemLower) && string.IsNullOrEmpty(obj.vocabularyCategory))
                    nameMatch = true;

                if (!nameMatch) return;

                int required = obj.itemCount > 0 ? obj.itemCount : 1;
                obj.collectedCount++;

                bool completed = obj.collectedCount >= required;
                if (completed)
                    CompleteObjective(obj.questId, obj.id);

                matches.Add(new CollectedItemMatch {
                    questId = obj.questId,
                    objectiveId = obj.id,
                    matchedName = itemName,
                    collectedCount = obj.collectedCount,
                    requiredCount = required,
                    completed = completed
                });

                OnQuestItemCollected?.Invoke(obj.questId, obj.id, itemName);
            });
            return matches;
        }

        /// <summary>Track a gift given to an NPC for give_gift objectives.</summary>
        public void TrackGiftGiven(string npcId, string itemName, string questId = null)
        {
            ForEachObjective(questId, new[] { "give_gift" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;
                CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Combat / reputation ─────────────────────────────────────────

        /// <summary>Track an enemy defeat for defeat_enemies objectives.</summary>
        public void TrackEnemyDefeated(string enemyType, string questId = null)
        {
            ForEachObjective(questId, new[] { "defeat_enemies" }, obj => {
                if (!string.IsNullOrEmpty(obj.enemyType) && obj.enemyType != enemyType) return;
                obj.enemiesDefeated++;
                if (obj.enemiesDefeated >= (obj.enemiesRequired > 0 ? obj.enemiesRequired : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track reputation gain for gain_reputation objectives.</summary>
        public void TrackReputationGain(string factionId, int amount, string questId = null)
        {
            ForEachObjective(questId, new[] { "gain_reputation" }, obj => {
                if (obj.factionId != factionId) return;
                obj.reputationGained += amount;
                if (obj.reputationGained >= (obj.reputationRequired > 0 ? obj.reputationRequired : 100))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track escort/delivery arrival for escort_npc / deliver_item objectives.</summary>
        public void TrackArrival(string npcOrItemId, bool reached, string questId = null)
        {
            if (!reached) return;
            ForEachObjective(questId, new[] { "escort_npc", "deliver_item" }, obj => {
                if (obj.type == "escort_npc") obj.arrived = true;
                else obj.delivered = true;
                CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Location tracking ───────────────────────────────────────────

        /// <summary>Track location visit/discovery for visit_location / discover_location objectives.</summary>
        public void TrackLocationVisit(string locationId, string locationName, string questId = null)
        {
            string lowerName = locationName.ToLowerInvariant();
            string lowerId = locationId.ToLowerInvariant();

            ForEachObjective(questId, new[] { "visit_location", "discover_location" }, obj => {
                string objName = (obj.locationName ?? "").ToLowerInvariant();
                if (string.IsNullOrEmpty(objName)) return;

                if (objName == lowerId || objName == lowerName ||
                    lowerName.Contains(objName) || objName.Contains(lowerName))
                {
                    CompleteObjective(obj.questId, obj.id);
                }
            });
        }

        // ── Teaching ────────────────────────────────────────────────────

        /// <summary>Track teaching a vocabulary word to an NPC for teach_vocabulary objectives.</summary>
        public void TrackTeachWord(string npcId, string word, string questId = null)
        {
            string lowerWord = word.ToLowerInvariant();
            ForEachObjective(questId, new[] { "teach_vocabulary" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;
                if (obj.wordsTaught.Contains(lowerWord)) return;
                obj.wordsTaught.Add(lowerWord);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 3))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track teaching a phrase to an NPC for teach_phrase objectives.</summary>
        public void TrackTeachPhrase(string npcId, string phrase, string questId = null)
        {
            string lowerPhrase = phrase.ToLowerInvariant();
            ForEachObjective(questId, new[] { "teach_phrase" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcId) && obj.npcId != npcId) return;
                if (obj.phrasesTaught.Contains(lowerPhrase)) return;
                obj.phrasesTaught.Add(lowerPhrase);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Mercantile ──────────────────────────────────────────────────

        /// <summary>Track food ordering at a merchant for order_food objectives.</summary>
        public void TrackFoodOrdered(string itemName, string merchantId, string businessType, string questId = null)
        {
            ForEachObjective(questId, new[] { "order_food" }, obj => {
                if (!string.IsNullOrEmpty(obj.merchantId) && obj.merchantId != merchantId) return;
                obj.itemsPurchased.Add(itemName);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track price haggling in target language for haggle_price objectives.</summary>
        public void TrackPriceHaggled(string itemName, string merchantId, string typedWord, string questId = null)
        {
            ForEachObjective(questId, new[] { "haggle_price" }, obj => {
                if (!string.IsNullOrEmpty(obj.merchantId) && obj.merchantId != merchantId) return;
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Direction / navigation ──────────────────────────────────────

        /// <summary>Track a direction step completed for follow_directions objectives.</summary>
        public void TrackDirectionStep(string questId = null)
        {
            ForEachObjective(questId, new[] { "follow_directions" }, obj => {
                obj.stepsCompleted++;
                obj.currentCount = obj.stepsCompleted;

                int required = obj.stepsRequired > 0 ? obj.stepsRequired : (obj.requiredCount > 0 ? obj.requiredCount : 1);
                if (obj.stepsCompleted >= required)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a navigation waypoint reached for navigate_language objectives.</summary>
        public void TrackNavigationWaypoint(string questId = null)
        {
            ForEachObjective(questId, new[] { "navigate_language" }, obj => {
                obj.waypointsReached++;
                obj.stepsCompleted = obj.waypointsReached;

                int required = obj.stepsRequired > 0 ? obj.stepsRequired : 1;
                if (obj.waypointsReached >= required)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Listening / translation ─────────────────────────────────────

        /// <summary>Track a listening comprehension answer for listening_comprehension objectives.</summary>
        public void TrackListeningAnswer(bool correct, string questId = null)
        {
            ForEachObjective(questId, new[] { "listening_comprehension" }, obj => {
                obj.questionsAnswered++;
                if (correct) obj.questionsCorrect++;
                obj.currentCount = obj.questionsAnswered;

                int required = obj.requiredCount > 0 ? obj.requiredCount : 3;
                if (obj.questionsCorrect >= required)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a translation attempt for translation_challenge objectives.</summary>
        public void TrackTranslationAttempt(bool correct, string questId = null)
        {
            ForEachObjective(questId, new[] { "translation_challenge" }, obj => {
                if (correct) obj.translationsCorrect++;
                obj.translationsCompleted++;
                obj.currentCount = obj.translationsCorrect;

                int required = obj.requiredCount > 0 ? obj.requiredCount : 3;
                if (obj.translationsCorrect >= required)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Object interaction ──────────────────────────────────────────

        /// <summary>Track an object identified for identify_object objectives.</summary>
        public void TrackObjectIdentified(string objectName, string questId = null)
        {
            ForEachObjective(questId, new[] { "identify_object" }, obj => {
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track an object examined for examine_object objectives.</summary>
        public void TrackObjectExamined(string objectName, string questId = null)
        {
            ForEachObjective(questId, new[] { "examine_object" }, obj => {
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a sign read for read_sign objectives.</summary>
        public void TrackSignRead(string signId, string questId = null)
        {
            ForEachObjective(questId, new[] { "read_sign" }, obj => {
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track point-and-name for point_and_name objectives.</summary>
        public void TrackPointAndName(string objectName, string questId = null)
        {
            ForEachObjective(questId, new[] { "point_and_name" }, obj => {
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Text / reading / comprehension ──────────────────────────────

        /// <summary>Track a text found for find_text objectives.</summary>
        public void TrackTextFound(string textId, string textName, string questId = null)
        {
            string lowerName = textName.ToLowerInvariant();
            ForEachObjective(questId, new[] { "find_text" }, obj => {
                string targetName = (obj.itemName ?? "").ToLowerInvariant();
                if (!string.IsNullOrEmpty(targetName) && targetName != lowerName && targetName != textId) return;
                if (obj.textsFound.Contains(textId)) return;
                obj.textsFound.Add(textId);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a text read for read_text objectives.</summary>
        public void TrackTextRead(string textId, string questId = null)
        {
            ForEachObjective(questId, new[] { "read_text" }, obj => {
                if (!string.IsNullOrEmpty(obj.textId) && obj.textId != textId) return;
                if (obj.textsRead.Contains(textId)) return;
                obj.textsRead.Add(textId);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track a comprehension quiz answer for comprehension_quiz objectives.</summary>
        public void TrackComprehensionAnswer(bool correct, string questId = null)
        {
            ForEachObjective(questId, new[] { "comprehension_quiz" }, obj => {
                obj.quizAnswered++;
                if (correct) obj.quizCorrect++;
                obj.currentCount = obj.quizCorrect;

                int required = obj.requiredCount > 0 ? obj.requiredCount : 3;
                int threshold = obj.quizPassThreshold > 0 ? obj.quizPassThreshold : required;
                if (obj.quizCorrect >= threshold)
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Photography / observation ───────────────────────────────────

        /// <summary>Track a photo taken for photograph_subject objectives.</summary>
        public void TrackPhotoTaken(string subjectName, string subjectCategory, string subjectActivity = null, string questId = null)
        {
            string lowerName = subjectName.ToLowerInvariant();
            string lowerActivity = (subjectActivity ?? "").ToLowerInvariant();

            ForEachObjective(questId, new[] { "photograph_subject" }, obj => {
                if (!string.IsNullOrEmpty(obj.targetCategory) && obj.targetCategory != subjectCategory) return;
                if (!string.IsNullOrEmpty(obj.targetSubject) && obj.targetSubject.ToLowerInvariant() != lowerName) return;
                if (!string.IsNullOrEmpty(obj.targetActivity))
                {
                    if (string.IsNullOrEmpty(lowerActivity)) return;
                    if (!lowerActivity.Contains(obj.targetActivity.ToLowerInvariant())) return;
                }

                string trackingKey = !string.IsNullOrEmpty(obj.targetActivity)
                    ? $"{lowerName}:{lowerActivity}" : lowerName;
                if (obj.photographedSubjects.Contains(trackingKey)) return;
                obj.photographedSubjects.Add(trackingKey);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track an activity photographed for photograph_activity objectives.</summary>
        public void TrackActivityPhotographed(string npcId, string npcName, string activity, string questId = null)
        {
            string lowerName = npcName.ToLowerInvariant();
            string lowerActivity = activity.ToLowerInvariant();

            ForEachObjective(questId, new[] { "photograph_activity" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcName) && obj.npcName.ToLowerInvariant() != lowerName) return;
                if (!string.IsNullOrEmpty(obj.targetActivity) && !lowerActivity.Contains(obj.targetActivity.ToLowerInvariant())) return;

                string trackingKey = $"{lowerName}:{lowerActivity}";
                if (obj.photographedSubjects.Contains(trackingKey)) return;
                obj.photographedSubjects.Add(trackingKey);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        /// <summary>Track an activity observed for observe_activity objectives.</summary>
        public void TrackActivityObserved(string npcId, string npcName, string activity, float durationSeconds, string questId = null)
        {
            string lowerName = npcName.ToLowerInvariant();
            string lowerActivity = activity.ToLowerInvariant();

            ForEachObjective(questId, new[] { "observe_activity" }, obj => {
                if (!string.IsNullOrEmpty(obj.npcName) && obj.npcName.ToLowerInvariant() != lowerName) return;
                if (!string.IsNullOrEmpty(obj.targetActivity) && !lowerActivity.Contains(obj.targetActivity.ToLowerInvariant())) return;

                float required = obj.observeDurationRequired > 0f ? obj.observeDurationRequired : 5f;
                if (durationSeconds < required) return;

                string trackingKey = $"{lowerName}:{lowerActivity}";
                if (obj.observedActivities.Contains(trackingKey)) return;
                obj.observedActivities.Add(trackingKey);
                obj.currentCount++;
                if (obj.currentCount >= (obj.requiredCount > 0 ? obj.requiredCount : 1))
                    CompleteObjective(obj.questId, obj.id);
            });
        }

        // ── Physical actions ────────────────────────────────────────────

        /// <summary>Track a physical action for perform_physical_action objectives.</summary>
        public void TrackPhysicalAction(string actionType, string[] itemsProduced, string questId = null)
        {
            ForEachObjective(questId, new[] { "perform_physical_action" }, obj => {
                if (!string.IsNullOrEmpty(obj.actionType) && obj.actionType != actionType) return;
                obj.actionsCompleted++;
                if (obj.actionsCompleted >= (obj.actionsRequired > 0 ? obj.actionsRequired : 1))
                    CompleteObjective(obj.questId, obj.id);
            });

            // Physical actions that produce items also count toward collect_item and craft_item
            foreach (string item in itemsProduced)
            {
                TrackCollectedItemByName(item, null, questId);
                TrackItemCrafted(item, questId);
            }
        }

        // ── Declarative trigger & event matching ────────────────────────

        /// <summary>Complete objectives whose completionTrigger matches the given trigger string.</summary>
        public void TrackByTrigger(string trigger, string questId = null)
        {
            foreach (var obj in _objectives)
            {
                if (obj.completed) continue;
                if (!string.IsNullOrEmpty(questId) && obj.questId != questId) continue;
                if (obj.completionTrigger == trigger && !IsObjectiveLocked(obj))
                    CompleteObjective(obj.questId, obj.id);
            }
        }

        /// <summary>Generic event matcher using the quest-action mapping catalog.</summary>
        public int HandleGameEvent(Dictionary<string, string> eventData)
        {
            if (!eventData.TryGetValue("type", out var eventType) || string.IsNullOrEmpty(eventType))
                return 0;

            int affected = 0;
            foreach (var mapping in _actionMappings)
            {
                if (mapping.eventType != eventType) continue;

                ForEachObjective(null, new[] { mapping.objectiveType }, obj => {
                    // Check all match fields
                    bool allMatch = true;
                    foreach (var rule in mapping.matchFields)
                    {
                        eventData.TryGetValue(rule.eventField, out var eventVal);
                        string objVal = GetObjectiveFieldValue(obj, rule.objectiveField);
                        if (!MatchesFieldStatic(rule, eventVal ?? "", objVal))
                        {
                            allMatch = false;
                            break;
                        }
                    }
                    if (!allMatch) return;

                    // photograph_activity compound check
                    if (mapping.objectiveType == "photograph_activity" && !string.IsNullOrEmpty(obj.targetActivity))
                    {
                        eventData.TryGetValue("subjectActivity", out var evAct);
                        string eventActivity = (evAct ?? "").ToLowerInvariant();
                        if (string.IsNullOrEmpty(eventActivity) || !eventActivity.Contains(obj.targetActivity.ToLowerInvariant()))
                            return;
                    }

                    affected++;

                    if (mapping.hasQuantity)
                    {
                        obj.currentCount++;
                        int required = obj.requiredCount > 0 ? obj.requiredCount : mapping.quantity.defaultRequired;
                        if (obj.currentCount >= required)
                            CompleteObjective(obj.questId, obj.id);
                    }
                    else
                    {
                        CompleteObjective(obj.questId, obj.id);
                    }
                });
            }
            return affected;
        }

        private static string GetObjectiveFieldValue(QuestObjective obj, string fieldName)
        {
            return fieldName switch
            {
                "itemName" => obj.itemName ?? "",
                "npcId" => obj.npcId ?? "",
                "npcName" => obj.npcName ?? "",
                "locationName" => obj.locationName ?? "",
                "textId" => obj.textId ?? "",
                "factionId" => obj.factionId ?? "",
                "enemyType" => obj.enemyType ?? "",
                "targetSubject" => obj.targetSubject ?? "",
                "targetCategory" => obj.targetCategory ?? "",
                "targetActivity" => obj.targetActivity ?? "",
                "actionType" => obj.actionType ?? "",
                "merchantId" => obj.merchantId ?? "",
                "craftedItemId" => obj.craftedItemId ?? "",
                _ => "",
            };
        }

        private static bool MatchesFieldStatic(FieldMatchRule rule, string eventValue, string objectiveValue)
        {
            if (string.IsNullOrEmpty(objectiveValue) && rule.optional) return true;
            if (string.IsNullOrEmpty(eventValue) || string.IsNullOrEmpty(objectiveValue)) return false;

            return rule.comparison switch
            {
                FieldComparison.Exact => eventValue == objectiveValue,
                FieldComparison.Contains => eventValue.Contains(objectiveValue) || objectiveValue.Contains(eventValue),
                FieldComparison.ContainsLower => eventValue.ToLowerInvariant().Contains(objectiveValue.ToLowerInvariant()) || objectiveValue.ToLowerInvariant().Contains(eventValue.ToLowerInvariant()),
                _ => eventValue == objectiveValue,
            };
        }

        // ── Position generation ─────────────────────────────────────────

        /// <summary>
        /// Register a building-check callback so spawned items avoid building interiors.
        /// The callback receives world-space (x, z) and returns true if inside a building.
        /// </summary>
        public void SetPointInBuildingCheck(Func<float, float, bool> check)
        {
            _pointInBuildingCheck = check;
        }

        /// <summary>Generate spread-out item positions that avoid building interiors.</summary>
        public List<Vector3> GenerateItemPositions(int count)
        {
            var positions = new List<Vector3>();
            float radius = 30f;

            for (int i = 0; i < count; i++)
            {
                float x = 0f, z = 0f;
                for (int attempt = 0; attempt < 8; attempt++)
                {
                    float angle = (Mathf.PI * 2f * i) / count + UnityEngine.Random.Range(0f, 0.5f);
                    float dist = 10f + UnityEngine.Random.Range(0f, radius);
                    x = Mathf.Cos(angle) * dist;
                    z = Mathf.Sin(angle) * dist;
                    if (_pointInBuildingCheck == null || !_pointInBuildingCheck(x, z))
                        break;
                }
                positions.Add(new Vector3(x, 0.5f, z));
            }
            return positions;
        }

        /// <summary>Generate a single location position that avoids building interiors.</summary>
        public Vector3 GenerateLocationPosition()
        {
            for (int attempt = 0; attempt < 8; attempt++)
            {
                float angle = UnityEngine.Random.Range(0f, Mathf.PI * 2f);
                float dist = 20f + UnityEngine.Random.Range(0f, 20f);
                float x = Mathf.Cos(angle) * dist;
                float z = Mathf.Sin(angle) * dist;
                if (_pointInBuildingCheck == null || !_pointInBuildingCheck(x, z))
                    return new Vector3(x, 0f, z);
            }
            float fallbackAngle = UnityEngine.Random.Range(0f, Mathf.PI * 2f);
            float fallbackDist = 40f + UnityEngine.Random.Range(0f, 10f);
            return new Vector3(Mathf.Cos(fallbackAngle) * fallbackDist, 0f, Mathf.Sin(fallbackAngle) * fallbackDist);
        }

        /// <summary>
        /// Attach debug metadata to a quest marker GameObject (used for hover tooltips).
        /// </summary>
        public static void SetMarkerDebugLabel(GameObject marker, string label)
        {
            if (marker == null) return;
            var meta = marker.GetComponent<QuestMarkerMeta>();
            if (meta == null) meta = marker.AddComponent<QuestMarkerMeta>();
            meta.debugLabel = label;
        }

        // ── Accessors ───────────────────────────────────────────────────

        public InsimulQuestData GetQuest(string id) => _allQuests.Find(q => q.id == id);
        public List<InsimulQuestData> GetAllQuests() => new List<InsimulQuestData>(_allQuests);
        public List<InsimulQuestData> GetActiveQuests() =>
            _allQuests.FindAll(q => _activeQuestIds.Contains(q.id));
        public List<InsimulQuestData> GetCompletedQuests() =>
            _allQuests.FindAll(q => _completedQuestIds.Contains(q.id));
        public List<InsimulQuestData> GetAvailableQuests() =>
            _allQuests.FindAll(q => !_activeQuestIds.Contains(q.id) && !_completedQuestIds.Contains(q.id));
        public bool IsQuestActive(string id) => _activeQuestIds.Contains(id);
        public bool IsQuestCompleted(string id) => _completedQuestIds.Contains(id);
        public List<QuestObjective> GetObjectivesForQuest(string questId) =>
            _objectives.FindAll(o => o.questId == questId);

        private Func<float, float, bool> _pointInBuildingCheck;
    }

    /// <summary>
    /// Lightweight metadata component for quest markers (debug labels, tooltips).
    /// </summary>
    public class QuestMarkerMeta : MonoBehaviour
    {
        public string debugLabel;
    }
}
