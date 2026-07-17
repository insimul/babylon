// InsimulQuestSystem — the host-testable, engine-agnostic portable quest core
// for Unity (US-UC3).
//
// Ported from the semantics authority in packages/core/src (prolog/quest-hydrator.ts)
// and the Unreal twin (packages/unreal/Source/InsimulRuntime/Portable/InsimulQuestSystem.*),
// validated against the golden quest corpus under
// packages/core/conformance/quests/hydration-cases.json:
//
//   - Quest HYDRATION per quest-hydrator.ts: the quest's Prolog `content` is the
//     single source of truth; parsing it populates the structured fields the
//     engine reads (title, type, difficulty, status, objectives, rewards,
//     prerequisites, tags, completion criteria). ToProjection() emits the
//     present-only projection, byte-comparable with hydrateQuestFromProlog via
//     the CanonicalJson serializer.
//
//   - QUERY-DRIVEN completion on the real KB (currentState.prologFacts — the same
//     ground-fact store InsimulSaveSystem snapshots/restores): an objective is
//     complete when the KB contains its trigger fact; when all objectives are
//     satisfied EvaluateQuest ASSERTS quest_complete(questId) and flips the status
//     active -> completed (a fact-asserting transition). Rewards are read from the
//     Prolog content (quest_reward/3), never from a denormalized C# field.
//
// UnityEngine-FREE (System.* only) so the whole contract runs under
// tools/verify-unity (no editor required). The stateful shell that preserves the
// template QuestSystem events is InsimulQuestRuntime; the real InsimulProlog
// engine plugs in behind the same Assert/Has query shape.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using Insimul.Save;

namespace Insimul.Quest
{
    /// <summary>A single hydrated objective — the present-only projection subset.</summary>
    public sealed class HydratedObjective
    {
        public string Id = string.Empty;
        public string Type = string.Empty;
        public string Description = string.Empty;
        public double RequiredCount = 1.0;
        public bool HasTarget;
        public string Target = string.Empty;
        public bool HasNpcId;
        public string NpcId = string.Empty;
    }

    /// <summary>A hydrated quest — the fields the engine reads, derived from Prolog content.</summary>
    public sealed class HydratedQuest
    {
        public string Id = string.Empty; // parsed from the quest/N head atom (not part of the projection)

        public bool HasTitle; public string Title = string.Empty;
        public bool HasQuestType; public string QuestType = string.Empty;
        public bool HasDifficulty; public string Difficulty = string.Empty;
        public bool HasStatus; public string Status = string.Empty;
        public bool HasTargetLanguage; public string TargetLanguage = string.Empty;
        public bool HasAssignedTo; public string AssignedTo = string.Empty;
        public bool HasAssignedBy; public string AssignedBy = string.Empty;
        public bool HasExperience; public double ExperienceReward;

        public readonly List<string> Tags = new List<string>();
        public readonly List<string> PrerequisiteQuestIds = new List<string>();

        // Completion criteria (subset the corpus exercises).
        public bool HasCompletion;
        public string CompletionType = string.Empty;              // "all_objectives" | "conversation_turns"
        public bool HasCompletionDescription; public string CompletionDescription = string.Empty;
        public bool HasCompletionTurns; public double CompletionTurns;

        public readonly List<HydratedObjective> Objectives = new List<HydratedObjective>();

        /// <summary>Build the present-only projection object (mirrors projectHydratedQuest).</summary>
        public JsonVal ToProjection()
        {
            var obj = JsonVal.Object();
            if (HasTitle) obj.Set("title", JsonVal.Str(Title));
            if (HasQuestType) obj.Set("questType", JsonVal.Str(QuestType));
            if (HasDifficulty) obj.Set("difficulty", JsonVal.Str(Difficulty));
            if (HasStatus) obj.Set("status", JsonVal.Str(Status));
            if (HasTargetLanguage) obj.Set("targetLanguage", JsonVal.Str(TargetLanguage));
            if (HasAssignedTo) obj.Set("assignedTo", JsonVal.Str(AssignedTo));
            if (HasAssignedBy) obj.Set("assignedBy", JsonVal.Str(AssignedBy));
            if (HasExperience) obj.Set("experienceReward", JsonVal.Num(ExperienceReward));
            if (Tags.Count > 0) obj.Set("tags", StringArray(Tags));
            if (PrerequisiteQuestIds.Count > 0) obj.Set("prerequisiteQuestIds", StringArray(PrerequisiteQuestIds));
            if (HasCompletion)
            {
                var cc = JsonVal.Object();
                cc.Set("type", JsonVal.Str(CompletionType));
                if (HasCompletionDescription) cc.Set("description", JsonVal.Str(CompletionDescription));
                if (HasCompletionTurns) cc.Set("requiredTurns", JsonVal.Num(CompletionTurns));
                obj.Set("completionCriteria", cc);
            }
            if (Objectives.Count > 0)
            {
                var arr = JsonVal.Arr();
                foreach (var o in Objectives)
                {
                    var e = JsonVal.Object();
                    e.Set("id", JsonVal.Str(o.Id));
                    e.Set("type", JsonVal.Str(o.Type));
                    e.Set("description", JsonVal.Str(o.Description));
                    e.Set("requiredCount", JsonVal.Num(o.RequiredCount));
                    if (o.HasTarget) e.Set("target", JsonVal.Str(o.Target));
                    if (o.HasNpcId) e.Set("npcId", JsonVal.Str(o.NpcId));
                    arr.Add(e);
                }
                obj.Set("objectives", arr);
            }
            return obj;
        }

        private static JsonVal StringArray(List<string> items)
        {
            var arr = JsonVal.Arr();
            foreach (var s in items) arr.Add(JsonVal.Str(s));
            return arr;
        }
    }

    /// <summary>
    /// A thin ground-fact store over currentState.prologFacts. Assertions dedupe so
    /// a Snapshot after repeated transitions is deterministic. This is the "real KB"
    /// surface the quest system drives; the native InsimulProlog engine plugs in
    /// behind the same Assert/Has query shape.
    /// </summary>
    public sealed class InsimulKB
    {
        private readonly List<PrologFact> _facts = new List<PrologFact>();

        /// <summary>Assert a ground fact (idempotent — duplicates are ignored).</summary>
        public void Assert(PrologFact fact)
        {
            foreach (var f in _facts) if (f.Equals(fact)) return;
            _facts.Add(fact);
        }

        /// <summary>True if a fact with this predicate + exact args is present.</summary>
        public bool Has(string predicate, IReadOnlyList<PrologArg> args)
        {
            var probe = new PrologFact(predicate, args);
            foreach (var f in _facts) if (f.Equals(probe)) return true;
            return false;
        }

        public IReadOnlyList<PrologFact> Facts => _facts;

        public void Load(IEnumerable<PrologFact> facts)
        {
            _facts.Clear();
            if (facts != null) _facts.AddRange(facts);
        }
    }

    /// <summary>Result of evaluating a quest's completion against the KB.</summary>
    public sealed class QuestTransition
    {
        public string QuestId = string.Empty;
        public bool Completed;                        // all objectives satisfied this eval
        public readonly List<string> SatisfiedObjectiveIds = new List<string>();
    }

    /// <summary>The portable quest core: hydration + query-driven completion.</summary>
    public static class InsimulQuestSystem
    {
        // ── Hydration ─────────────────────────────────────────────────────────

        /// <summary>Parse Prolog <paramref name="content"/> (+ optional runtime status)
        /// into a hydrated quest.</summary>
        public static HydratedQuest HydrateFromContent(string content, string inputStatus = null)
        {
            var q = new HydratedQuest();
            content = content ?? string.Empty;
            inputStatus = inputStatus ?? string.Empty;

            // Quest id (head atom of the first quest/N term).
            var idm = Regex.Match(content, @"quest\(\s*(\w+)");
            if (idm.Success) q.Id = idm.Groups[1].Value;

            // quest/5 main fact: quest(id, 'title', type, difficulty, status)
            string mainStatus = string.Empty;
            bool hasMain = false;
            var qm = Regex.Match(content,
                @"quest\(\s*\w+\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)");
            if (qm.Success)
            {
                hasMain = true;
                q.HasTitle = true; q.Title = Unescape(qm.Groups[1].Value);
                q.HasQuestType = true; q.QuestType = qm.Groups[2].Value;
                q.HasDifficulty = true; q.Difficulty = qm.Groups[3].Value;
                mainStatus = qm.Groups[4].Value;
            }

            // Prerequisites (excludes 'none').
            var prereqs = new List<string>();
            foreach (Match m in Regex.Matches(content, @"quest_prerequisite\(\s*\w+\s*,\s*(\w+)\s*\)"))
            {
                string p = m.Groups[1].Value;
                if (p != "none") prereqs.Add(p);
            }

            // Status resolution (mirrors the hydrator's availability rule).
            if (hasMain)
            {
                if (string.IsNullOrEmpty(inputStatus))
                {
                    q.HasStatus = true; q.Status = mainStatus;
                }
                else if (inputStatus == "unavailable" && mainStatus == "available")
                {
                    q.HasStatus = true;
                    q.Status = prereqs.Count == 0 ? "available" : inputStatus;
                }
                else
                {
                    q.HasStatus = true; q.Status = inputStatus;
                }
            }
            else if (!string.IsNullOrEmpty(inputStatus))
            {
                q.HasStatus = true; q.Status = inputStatus;
            }

            // Objectives: quest_objective(id, Index, Goal).
            foreach (Match m in Regex.Matches(content, @"quest_objective\(\s*\w+\s*,\s*(\d+)\s*,\s*(.*)\)\s*\."))
            {
                long index = ParseIntPrefix(m.Groups[1].Value);
                var o = ParseObjectiveGoal(Trim(m.Groups[2].Value));
                if (o != null)
                {
                    o.Id = "obj_" + index.ToString(CultureInfo.InvariantCulture);
                    q.Objectives.Add(o);
                }
            }

            // Scalars.
            if (TryParseStringFact(content, "quest_assigned_to", out string s1)) { q.HasAssignedTo = true; q.AssignedTo = s1; }
            if (TryParseStringFact(content, "quest_assigned_by", out string s2)) { q.HasAssignedBy = true; q.AssignedBy = s2; }
            if (TryParseAtomFact(content, "quest_language", out string s3)) { q.HasTargetLanguage = true; q.TargetLanguage = s3; }

            // Rewards: quest_reward(id, key, N) — experience is promoted to a scalar
            // read from Prolog (never a denormalized default).
            foreach (Match m in Regex.Matches(content, @"quest_reward\(\s*\w+\s*,\s*(\w+)\s*,\s*(\d+(?:\.\d+)?)\s*\)"))
            {
                if (m.Groups[1].Value == "experience")
                {
                    q.HasExperience = true;
                    q.ExperienceReward = double.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
                }
            }

            // Tags.
            foreach (var t in ParseAllAtomFacts(content, "quest_tag")) q.Tags.Add(t);

            // Prerequisites projection (only when real prereqs present).
            if (prereqs.Count > 0) q.PrerequisiteQuestIds.AddRange(prereqs);

            // Completion criteria: quest_completion(id, Goal).
            var cm = Regex.Match(content, @"quest_completion\(\s*\w+\s*,\s*(.*?)\)\s*\.");
            if (cm.Success)
            {
                string goal = Trim(cm.Groups[1].Value);
                var conv = Regex.Match(goal, @"^conversation_turns\(\s*(\d+)\s*\)$");
                if (goal == "all_objectives_complete")
                {
                    q.HasCompletion = true; q.CompletionType = "all_objectives";
                    q.HasCompletionDescription = true; q.CompletionDescription = "Complete all objectives";
                }
                else if (conv.Success)
                {
                    q.HasCompletion = true; q.CompletionType = "conversation_turns";
                    q.HasCompletionTurns = true; q.CompletionTurns = ParseIntPrefix(conv.Groups[1].Value);
                }
                else
                {
                    // vocabulary_* and unknown goals default to all-objectives (as TS does).
                    q.HasCompletion = true; q.CompletionType = "all_objectives";
                    q.HasCompletionDescription = true; q.CompletionDescription = "Complete all objectives";
                }
            }

            return q;
        }

        /// <summary>Canonical JSON of the hydration projection — byte-comparable with TS.</summary>
        public static string HydrateCanonical(string content, string inputStatus = null)
        {
            return CanonicalJson.Stringify(HydrateFromContent(content, inputStatus).ToProjection());
        }

        // ── Query-driven completion + fact-asserting transitions ───────────────

        /// <summary>
        /// True if objective #<paramref name="index"/> of <paramref name="quest"/> is
        /// satisfied by the KB — either an explicit objective_satisfied(questId, objId)
        /// fact or a type-specific trigger fact (talk_to_npc -> talked_to,
        /// visit_location -> visited, deliver_item -> delivered; player is the acting
        /// subject).
        /// </summary>
        public static bool IsObjectiveSatisfied(HydratedQuest quest, int index, InsimulKB kb)
        {
            if (quest == null || kb == null || index < 0 || index >= quest.Objectives.Count) return false;
            var o = quest.Objectives[index];

            if (kb.Has("objective_satisfied", new[] { PrologArg.Atom(quest.Id), PrologArg.Atom(o.Id) }))
                return true;

            if (o.HasTarget)
            {
                var playerTarget = new[] { PrologArg.Atom("player"), PrologArg.Atom(o.Target) };
                if (o.Type == "talk_to_npc" && kb.Has("talked_to", playerTarget)) return true;
                if (o.Type == "visit_location" && kb.Has("visited", playerTarget)) return true;
                if (o.Type == "deliver_item" && kb.Has("delivered", playerTarget)) return true;
            }
            return false;
        }

        /// <summary>
        /// Evaluate <paramref name="quest"/> against <paramref name="kb"/>. Asserts
        /// quest_objective_complete(questId, objId) for each satisfied objective; when
        /// ALL objectives are satisfied and the completion criterion is all-objectives,
        /// asserts quest_complete(questId) and flips Quest.Status to "completed" (the
        /// fact-asserting transition).
        /// </summary>
        public static QuestTransition EvaluateQuest(HydratedQuest quest, InsimulKB kb)
        {
            var result = new QuestTransition { QuestId = quest.Id };

            bool allSatisfied = quest.Objectives.Count > 0;
            for (int i = 0; i < quest.Objectives.Count; i++)
            {
                if (IsObjectiveSatisfied(quest, i, kb))
                {
                    var o = quest.Objectives[i];
                    kb.Assert(new PrologFact("quest_objective_complete",
                        new[] { PrologArg.Atom(quest.Id), PrologArg.Atom(o.Id) }));
                    result.SatisfiedObjectiveIds.Add(o.Id);
                }
                else
                {
                    allSatisfied = false;
                }
            }

            // Completion criterion: all-objectives (the default). conversation_turns is
            // a runtime-metered criterion, not auto-satisfied by objective facts here.
            bool allObjectivesCriterion = !quest.HasCompletion || quest.CompletionType == "all_objectives";
            if (allSatisfied && allObjectivesCriterion)
            {
                kb.Assert(new PrologFact("quest_complete", new[] { PrologArg.Atom(quest.Id) }));
                quest.HasStatus = true;
                quest.Status = "completed";
                result.Completed = true;
            }
            return result;
        }

        // ── Goal parsing (mirrors parseObjectiveGoal in quest-hydrator.ts) ─────

        // functor(target, count)
        private static readonly Dictionary<string, string> TwoArgGoals = new Dictionary<string, string>
        {
            { "collect", "collect_item" }, { "defeat", "defeat_enemies" }, { "craft_item", "craft_item" },
            { "gain_reputation", "gain_reputation" }, { "reach_level", "reach_level" },
            { "photograph", "photograph_subject" }, { "physical_action", "physical_action" },
            { "practice_grammar", "grammar_pattern" },
        };

        // functor('target')
        private static readonly Dictionary<string, string> SingleArgGoals = new Dictionary<string, string>
        {
            { "visit_location", "visit_location" }, { "discover_location", "discover_location" },
            { "talk_to", "talk_to_npc" }, { "solve_puzzle", "solve_puzzle" }, { "use_item", "use_item" },
            { "equip_item", "equip_item" }, { "drop_item", "drop_item" }, { "give_gift", "give_gift" },
            { "read_text", "read_text" }, { "accept_quest", "accept_quest" }, { "escort", "escort_npc" },
        };

        // functor(count[, extra])
        private static readonly Dictionary<string, string> CountGoals = new Dictionary<string, string>
        {
            { "conversation_turns", "Complete {n} conversation turn(s)" },
            { "examine_object", "Examine {n} object(s)" }, { "read_sign", "Read {n} sign(s)" },
            { "write_response", "Write {n} response(s)" }, { "listen_and_repeat", "Listen and repeat {n} phrase(s)" },
            { "pronunciation_check", "Complete {n} pronunciation check(s)" }, { "identify_object", "Identify {n} object(s)" },
            { "order_food", "Order {n} food item(s)" }, { "haggle_price", "Haggle {n} price(s)" },
            { "buy_item", "Buy {n} item(s)" }, { "sell_item", "Sell {n} item(s)" },
            { "ask_for_directions", "Ask for directions {n} time(s)" }, { "comprehension_quiz", "Answer {n} quiz question(s) correctly" },
            { "translation_challenge", "Complete {n} translation(s) correctly" }, { "follow_directions", "Follow {n} direction(s)" },
            { "listening_comprehension", "Answer {n} listening question(s) correctly" }, { "collect_vocabulary", "Collect {n} vocabulary word(s)" },
            { "collect_clue", "Collect {n} clue(s)" }, { "vocabulary_activities", "Complete {n} vocabulary activit(ies)" },
            { "conversation_activities", "Complete {n} conversation activit(ies)" }, { "grammar_activities", "Demonstrate {n} grammar pattern(s)" },
            { "sustained_conversation", "Sustain a conversation for {n} turn(s)" }, { "master_words", "Master {n} vocabulary word(s)" },
            { "learn_new_words", "Learn {n} new word(s)" }, { "find_vocabulary_items", "Find {n} vocabulary item(s)" },
            { "find_text", "Find {n} text(s)" }, { "combat_action", "Perform {n} combat action(s)" },
            { "observe_activity", "Observe {n} activit(ies)" }, { "build_friendship", "Build friendship (reach {n} strength)" },
            { "learn_words_count", "Learn {n} vocabulary word(s)" }, { "survive", "Survive for {n} second(s)" },
            { "visit_location", "Visit {n} location(s)" },
        };

        private static readonly Dictionary<string, string> Labels = new Dictionary<string, string>
        {
            { "visit_location", "Visit" }, { "discover_location", "Discover" },
            { "talk_to", "Talk to" }, { "collect", "Collect" }, { "defeat", "Defeat" },
            { "deliver", "Deliver to" }, { "use_item", "Use" }, { "craft_item", "Craft" },
            { "escort", "Escort" }, { "solve_puzzle", "Solve" },
            { "gain_reputation", "Gain reputation with" }, { "reach_level", "Reach level" },
            { "give_gift", "Give a gift to" }, { "equip_item", "Equip" }, { "drop_item", "Drop" },
            { "accept_quest", "Accept quest" }, { "read_text", "Read" }, { "find_text", "Find texts" },
            { "photograph", "Photograph" },
        };

        private static HydratedObjective ParseObjectiveGoal(string goalIn)
        {
            string goal = Trim(goalIn);
            var fm = Regex.Match(goal, @"^(\w+)\(");
            if (!fm.Success)
            {
                if (goal == "introduce_self")
                    return new HydratedObjective { Type = "introduce_self", Description = "Introduce yourself", RequiredCount = 1 };
                if (goal == "complete_assessment")
                    return new HydratedObjective { Type = "complete_assessment", Description = "Complete the assessment", RequiredCount = 1 };
                return null;
            }
            string functor = fm.Groups[1].Value;
            string argsStr = Trim(goal.Substring(functor.Length + 1, goal.Length - functor.Length - 2));
            var args = ParseGoalArgs(argsStr);

            // Two-arg goals: functor(target, count)
            if (TwoArgGoals.TryGetValue(functor, out string t2) && args.Count >= 2)
            {
                long count = ParseIntPrefix(args[1]);
                if (count == 0) count = 1;
                return new HydratedObjective
                {
                    Type = t2,
                    Description = GoalToDescription(functor, args),
                    HasTarget = true, Target = args[0],
                    RequiredCount = count,
                };
            }

            // Single-quoted-arg goals: functor('target')
            if (SingleArgGoals.TryGetValue(functor, out string t1) && args.Count >= 1)
            {
                string target = args[0];
                long count = args.Count >= 2 ? ParseIntPrefix(args[1]) : 1;
                if (count == 0) count = 1;
                string desc = GoalToDescription(functor, args);
                if (functor == "talk_to" && count > 1)
                    desc = "Talk to " + target + " (at least " + count.ToString(CultureInfo.InvariantCulture) + " turns)";
                var o = new HydratedObjective
                {
                    Type = t1,
                    Description = desc,
                    HasTarget = true, Target = target,
                    RequiredCount = count,
                };
                if (functor == "talk_to") { o.HasNpcId = true; o.NpcId = target; }
                return o;
            }

            // Deliver: deliver(item, npc)
            if (functor == "deliver" && args.Count >= 2)
            {
                return new HydratedObjective
                {
                    Type = "deliver_item",
                    Description = "Deliver " + args[0] + " to " + args[1],
                    HasTarget = true, Target = args[1],
                    RequiredCount = 1,
                };
            }

            // Count-only goals: functor(count[, extra])
            if (CountGoals.TryGetValue(functor, out string template) && args.Count >= 1)
            {
                if (Regex.IsMatch(args[0], @"^\d+(\.\d+)?$"))
                {
                    long count = ParseIntPrefix(args[0]);
                    return new HydratedObjective
                    {
                        Type = functor,
                        Description = FormatCountDescription(template, count),
                        RequiredCount = count,
                    };
                }
            }

            // objective('description text')
            if (functor == "objective" && args.Count >= 1)
            {
                return new HydratedObjective
                {
                    Type = "objective",
                    Description = Capitalize(args[0]),
                    RequiredCount = 1,
                };
            }

            // Fallback — human-readable description from the raw goal.
            string fdesc = goal.Replace("_", " ");
            fdesc = fdesc.Replace("'", string.Empty);
            fdesc = Regex.Replace(fdesc, @"\(.*\)", string.Empty);
            return new HydratedObjective
            {
                Type = string.IsNullOrEmpty(functor) ? "custom" : functor,
                Description = Capitalize(Trim(fdesc)),
                RequiredCount = 1,
            };
        }

        private static string GoalToDescription(string functor, List<string> args)
        {
            string label = Labels.TryGetValue(functor, out string l) ? l : Capitalize(functor.Replace("_", " "));
            if (args.Count == 0) return label;
            string mainArg = args[0] == "any" ? string.Empty : (" " + args[0]);
            if (args.Count > 1 && IsAllDigits(args[1]))
            {
                long count = ParseIntPrefix(args[1]);
                if (count > 1)
                {
                    string n = count.ToString(CultureInfo.InvariantCulture);
                    if (functor == "collect") return "Collect " + n + " " + args[0];
                    if (functor == "defeat") return "Defeat " + n + " " + args[0];
                    if (functor == "craft_item") return "Craft " + n + " " + args[0];
                    if (functor == "gain_reputation") return "Gain " + n + " reputation with " + args[0];
                    if (functor == "photograph") return "Photograph " + n + " " + args[0];
                    return label + mainArg + " (" + n + ")";
                }
            }
            return Trim(label + mainArg);
        }

        private static string FormatCountDescription(string template, long count)
        {
            string r = template.Replace("{n}", count.ToString(CultureInfo.InvariantCulture));
            if (count == 1)
            {
                r = r.Replace("(s)", string.Empty);
                r = r.Replace("(ies)", "y");
            }
            else
            {
                r = r.Replace("(s)", "s");
                r = r.Replace("(ies)", "ies");
            }
            return r;
        }

        // ── goal argument-list parsing (mirrors parseObjectiveGoal's loop) ─────

        private static List<string> ParseGoalArgs(string argsStr)
        {
            var args = new List<string>();
            int i = 0;
            int n = argsStr.Length;
            while (i < n)
            {
                char c = argsStr[i];
                if (c == ' ' || c == ',') { i++; continue; }
                if (c == '\'')
                {
                    var val = new System.Text.StringBuilder();
                    i++; // skip opening quote
                    while (i < n)
                    {
                        if (argsStr[i] == '\\' && i + 1 < n) { val.Append(argsStr[i + 1]); i += 2; }
                        else if (argsStr[i] == '\'') { i++; break; }
                        else { val.Append(argsStr[i]); i++; }
                    }
                    args.Add(val.ToString());
                }
                else if (c == '[')
                {
                    int end = argsStr.IndexOf(']', i);
                    if (end < 0) { args.Add(argsStr.Substring(i)); break; }
                    args.Add(argsStr.Substring(i, end - i + 1));
                    i = end + 1;
                }
                else
                {
                    var val = new System.Text.StringBuilder();
                    while (i < n && argsStr[i] != ',' && argsStr[i] != ')') { val.Append(argsStr[i]); i++; }
                    args.Add(Trim(val.ToString()));
                }
            }
            return args;
        }

        // ── scalar fact parsers ────────────────────────────────────────────────

        private static bool TryParseStringFact(string content, string predicate, out string value)
        {
            var m = Regex.Match(content, predicate + @"\(\s*\w+\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)");
            if (m.Success) { value = Unescape(m.Groups[1].Value); return true; }
            value = null;
            return false;
        }

        private static bool TryParseAtomFact(string content, string predicate, out string value)
        {
            var m = Regex.Match(content, predicate + @"\(\s*\w+\s*,\s*(\w+)\s*\)");
            if (m.Success) { value = m.Groups[1].Value; return true; }
            value = null;
            return false;
        }

        private static List<string> ParseAllAtomFacts(string content, string predicate)
        {
            var outList = new List<string>();
            foreach (Match m in Regex.Matches(content, predicate + @"\(\s*\w+\s*,\s*(\w+)\s*\)"))
                outList.Add(m.Groups[1].Value);
            return outList;
        }

        // ── small string helpers ───────────────────────────────────────────────

        private static string Trim(string s) => s == null ? string.Empty : s.Trim();

        private static bool IsAllDigits(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            foreach (char c in s) if (c < '0' || c > '9') return false;
            return true;
        }

        /// <summary>Leading-integer parse, like JS parseInt (0 if no leading digits).</summary>
        private static long ParseIntPrefix(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0;
            int i = 0;
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
            bool neg = false;
            if (i < s.Length && (s[i] == '+' || s[i] == '-')) { neg = s[i] == '-'; i++; }
            long v = 0; bool any = false;
            while (i < s.Length && s[i] >= '0' && s[i] <= '9') { v = v * 10 + (s[i] - '0'); i++; any = true; }
            if (!any) return 0;
            return neg ? -v : v;
        }

        private static string Capitalize(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return char.ToUpperInvariant(s[0]) + s.Substring(1);
        }

        /// <summary>Unescape Prolog string escapes: \' -> ' and \\ -> \ (matches TS).</summary>
        private static string Unescape(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            var sb = new System.Text.StringBuilder(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                if (s[i] == '\\' && i + 1 < s.Length && (s[i + 1] == '\'' || s[i + 1] == '\\'))
                {
                    sb.Append(s[i + 1]); i++;
                }
                else
                {
                    sb.Append(s[i]);
                }
            }
            return sb.ToString();
        }
    }
}
