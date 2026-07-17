// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulQuestSystem implementation — see InsimulQuestSystem.h. Ported from
// packages/core/src/prolog/quest-hydrator.ts and the golden quest/radiant
// corpus under packages/core/conformance/quests.

#include "InsimulQuestSystem.h"

#include "InsimulCanonicalJson.h"

#include <algorithm>
#include <cctype>
#include <regex>
#include <string>
#include <vector>

namespace insimul {

namespace {

// ── small string helpers ──────────────────────────────────────────────────

std::string Trim(const std::string& S) {
	std::size_t B = 0, E = S.size();
	while (B < E && std::isspace(static_cast<unsigned char>(S[B]))) ++B;
	while (E > B && std::isspace(static_cast<unsigned char>(S[E - 1]))) --E;
	return S.substr(B, E - B);
}

bool IsAllDigits(const std::string& S) {
	if (S.empty()) return false;
	for (char C : S) if (!std::isdigit(static_cast<unsigned char>(C))) return false;
	return true;
}

/** Leading-integer parse, like JS parseInt (0 if no leading digits). */
long long ParseIntPrefix(const std::string& S) {
	std::size_t I = 0;
	while (I < S.size() && std::isspace(static_cast<unsigned char>(S[I]))) ++I;
	bool Neg = false;
	if (I < S.size() && (S[I] == '+' || S[I] == '-')) { Neg = S[I] == '-'; ++I; }
	long long V = 0; bool Any = false;
	while (I < S.size() && std::isdigit(static_cast<unsigned char>(S[I]))) {
		V = V * 10 + (S[I] - '0'); ++I; Any = true;
	}
	if (!Any) return 0;
	return Neg ? -V : V;
}

std::string Capitalize(const std::string& S) {
	if (S.empty()) return S;
	std::string R = S;
	R[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(R[0])));
	return R;
}

/** Unescape Prolog string escapes: \' -> ' and \\ -> \ (matches TS unescape). */
std::string Unescape(const std::string& S) {
	std::string R;
	R.reserve(S.size());
	for (std::size_t I = 0; I < S.size(); ++I) {
		if (S[I] == '\\' && I + 1 < S.size() && (S[I + 1] == '\'' || S[I + 1] == '\\')) {
			R += S[I + 1]; ++I;
		} else {
			R += S[I];
		}
	}
	return R;
}

std::string ReplaceAll(std::string S, const std::string& From, const std::string& To) {
	if (From.empty()) return S;
	std::size_t Pos = 0;
	while ((Pos = S.find(From, Pos)) != std::string::npos) {
		S.replace(Pos, From.size(), To);
		Pos += To.size();
	}
	return S;
}

// ── JSON node builders (for the projection) ────────────────────────────────

FJsonValuePtr MakeString(const std::string& S) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::String;
	V->StringValue = S;
	return V;
}

FJsonValuePtr MakeNumber(double N) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Number;
	V->NumberValue = N;
	// Emit an integral lexeme for whole numbers so RawNumber never disagrees
	// with the ECMAScript ToString the canonical serializer produces.
	if (N == static_cast<double>(static_cast<long long>(N))) {
		V->RawNumber = std::to_string(static_cast<long long>(N));
	}
	return V;
}

void AddMember(FJsonValue& Obj, const std::string& Key, FJsonValuePtr Val) {
	Obj.ObjectItems.emplace_back(Key, std::move(Val));
}

FJsonValuePtr MakeStringArray(const std::vector<std::string>& Items) {
	auto V = std::make_shared<FJsonValue>();
	V->Type = EJsonType::Array;
	for (const auto& S : Items) V->ArrayItems.push_back(MakeString(S));
	return V;
}

// ── goalToDescription (mirrors quest-hydrator.ts) ──────────────────────────

std::string LabelFor(const std::string& Functor) {
	static const std::vector<std::pair<std::string, std::string>> Labels = {
		{"visit_location", "Visit"}, {"discover_location", "Discover"},
		{"talk_to", "Talk to"}, {"collect", "Collect"}, {"defeat", "Defeat"},
		{"deliver", "Deliver to"}, {"use_item", "Use"}, {"craft_item", "Craft"},
		{"escort", "Escort"}, {"solve_puzzle", "Solve"},
		{"gain_reputation", "Gain reputation with"}, {"reach_level", "Reach level"},
		{"give_gift", "Give a gift to"}, {"equip_item", "Equip"}, {"drop_item", "Drop"},
		{"accept_quest", "Accept quest"}, {"read_text", "Read"}, {"find_text", "Find texts"},
		{"photograph", "Photograph"},
	};
	for (const auto& P : Labels) if (P.first == Functor) return P.second;
	return Capitalize(ReplaceAll(Functor, "_", " "));
}

std::string GoalToDescription(const std::string& Functor, const std::vector<std::string>& Args) {
	const std::string Label = LabelFor(Functor);
	if (Args.empty()) return Label;
	const std::string MainArg = (Args[0] == "any") ? std::string() : (" " + Args[0]);
	if (Args.size() > 1 && IsAllDigits(Args[1])) {
		const long long Count = ParseIntPrefix(Args[1]);
		if (Count > 1) {
			const std::string N = std::to_string(Count);
			if (Functor == "collect") return "Collect " + N + " " + Args[0];
			if (Functor == "defeat") return "Defeat " + N + " " + Args[0];
			if (Functor == "craft_item") return "Craft " + N + " " + Args[0];
			if (Functor == "gain_reputation") return "Gain " + N + " reputation with " + Args[0];
			if (Functor == "photograph") return "Photograph " + N + " " + Args[0];
			return Label + MainArg + " (" + N + ")";
		}
	}
	return Trim(Label + MainArg);
}

std::string FormatCountDescription(const std::string& Template, long long Count) {
	std::string R = ReplaceAll(Template, "{n}", std::to_string(Count));
	if (Count == 1) {
		R = ReplaceAll(R, "(s)", "");
		R = ReplaceAll(R, "(ies)", "y");
	} else {
		R = ReplaceAll(R, "(s)", "s");
		R = ReplaceAll(R, "(ies)", "ies");
	}
	return R;
}

// Lookup tables mirroring parseObjectiveGoal.
const std::vector<std::pair<std::string, std::string>>& TwoArgGoals() {
	static const std::vector<std::pair<std::string, std::string>> M = {
		{"collect", "collect_item"}, {"defeat", "defeat_enemies"}, {"craft_item", "craft_item"},
		{"gain_reputation", "gain_reputation"}, {"reach_level", "reach_level"},
		{"photograph", "photograph_subject"}, {"physical_action", "physical_action"},
		{"practice_grammar", "grammar_pattern"},
	};
	return M;
}
const std::vector<std::pair<std::string, std::string>>& SingleArgGoals() {
	static const std::vector<std::pair<std::string, std::string>> M = {
		{"visit_location", "visit_location"}, {"discover_location", "discover_location"},
		{"talk_to", "talk_to_npc"}, {"solve_puzzle", "solve_puzzle"}, {"use_item", "use_item"},
		{"equip_item", "equip_item"}, {"drop_item", "drop_item"}, {"give_gift", "give_gift"},
		{"read_text", "read_text"}, {"accept_quest", "accept_quest"}, {"escort", "escort_npc"},
	};
	return M;
}
const std::vector<std::pair<std::string, std::string>>& CountGoals() {
	static const std::vector<std::pair<std::string, std::string>> M = {
		{"conversation_turns", "Complete {n} conversation turn(s)"},
		{"examine_object", "Examine {n} object(s)"}, {"read_sign", "Read {n} sign(s)"},
		{"write_response", "Write {n} response(s)"}, {"listen_and_repeat", "Listen and repeat {n} phrase(s)"},
		{"pronunciation_check", "Complete {n} pronunciation check(s)"}, {"identify_object", "Identify {n} object(s)"},
		{"order_food", "Order {n} food item(s)"}, {"haggle_price", "Haggle {n} price(s)"},
		{"buy_item", "Buy {n} item(s)"}, {"sell_item", "Sell {n} item(s)"},
		{"ask_for_directions", "Ask for directions {n} time(s)"}, {"comprehension_quiz", "Answer {n} quiz question(s) correctly"},
		{"translation_challenge", "Complete {n} translation(s) correctly"}, {"follow_directions", "Follow {n} direction(s)"},
		{"listening_comprehension", "Answer {n} listening question(s) correctly"}, {"collect_vocabulary", "Collect {n} vocabulary word(s)"},
		{"collect_clue", "Collect {n} clue(s)"}, {"vocabulary_activities", "Complete {n} vocabulary activit(ies)"},
		{"conversation_activities", "Complete {n} conversation activit(ies)"}, {"grammar_activities", "Demonstrate {n} grammar pattern(s)"},
		{"sustained_conversation", "Sustain a conversation for {n} turn(s)"}, {"master_words", "Master {n} vocabulary word(s)"},
		{"learn_new_words", "Learn {n} new word(s)"}, {"find_vocabulary_items", "Find {n} vocabulary item(s)"},
		{"find_text", "Find {n} text(s)"}, {"combat_action", "Perform {n} combat action(s)"},
		{"observe_activity", "Observe {n} activit(ies)"}, {"build_friendship", "Build friendship (reach {n} strength)"},
		{"learn_words_count", "Learn {n} vocabulary word(s)"}, {"survive", "Survive for {n} second(s)"},
		{"visit_location", "Visit {n} location(s)"},
	};
	return M;
}
bool LookupMap(const std::vector<std::pair<std::string, std::string>>& M,
	const std::string& Key, std::string& Out) {
	for (const auto& P : M) if (P.first == Key) { Out = P.second; return true; }
	return false;
}

// Parse a Prolog goal-term's argument list (mirrors parseObjectiveGoal's loop).
std::vector<std::string> ParseGoalArgs(const std::string& ArgsStr) {
	std::vector<std::string> Args;
	std::size_t I = 0;
	const std::size_t N = ArgsStr.size();
	while (I < N) {
		const char C = ArgsStr[I];
		if (C == ' ' || C == ',') { ++I; continue; }
		if (C == '\'') {
			std::string Val;
			++I; // skip opening quote
			while (I < N) {
				if (ArgsStr[I] == '\\' && I + 1 < N) { Val += ArgsStr[I + 1]; I += 2; }
				else if (ArgsStr[I] == '\'') { ++I; break; }
				else { Val += ArgsStr[I]; ++I; }
			}
			Args.push_back(Val);
		} else if (C == '[') {
			const std::size_t End = ArgsStr.find(']', I);
			if (End == std::string::npos) { Args.push_back(ArgsStr.substr(I)); break; }
			Args.push_back(ArgsStr.substr(I, End - I + 1));
			I = End + 1;
		} else {
			std::string Val;
			while (I < N && ArgsStr[I] != ',' && ArgsStr[I] != ')') { Val += ArgsStr[I]; ++I; }
			Args.push_back(Trim(Val));
		}
	}
	return Args;
}

// Map a goal term to a structured objective. Returns false for unparseable.
bool ParseObjectiveGoal(const std::string& GoalIn, FHydratedObjective& Out) {
	const std::string Goal = Trim(GoalIn);
	std::smatch M;
	static const std::regex FunctorRe("^(\\w+)\\(");
	if (!std::regex_search(Goal, M, FunctorRe)) {
		if (Goal == "introduce_self") {
			Out.Type = "introduce_self"; Out.Description = "Introduce yourself"; Out.RequiredCount = 1; return true;
		}
		if (Goal == "complete_assessment") {
			Out.Type = "complete_assessment"; Out.Description = "Complete the assessment"; Out.RequiredCount = 1; return true;
		}
		return false;
	}
	const std::string Functor = M[1].str();
	// argsStr = goal.slice(functor.length + 1, -1)
	const std::string ArgsStr = Trim(Goal.substr(Functor.size() + 1, Goal.size() - Functor.size() - 2));
	const std::vector<std::string> Args = ParseGoalArgs(ArgsStr);

	std::string Mapped;

	// Two-arg goals: functor(target, count)
	if (LookupMap(TwoArgGoals(), Functor, Mapped) && Args.size() >= 2) {
		const long long Count = ParseIntPrefix(Args[1]) ? ParseIntPrefix(Args[1]) : 1;
		Out.Type = Mapped;
		Out.Description = GoalToDescription(Functor, Args);
		Out.bHasTarget = true; Out.Target = Args[0];
		Out.RequiredCount = static_cast<double>(Count);
		return true;
	}

	// Single-quoted-arg goals: functor('target')
	if (LookupMap(SingleArgGoals(), Functor, Mapped) && Args.size() >= 1) {
		const std::string Target = Args[0];
		const long long Count = Args.size() >= 2 ? (ParseIntPrefix(Args[1]) ? ParseIntPrefix(Args[1]) : 1) : 1;
		std::string Desc = GoalToDescription(Functor, Args);
		if (Functor == "talk_to" && Count > 1) {
			Desc = "Talk to " + Target + " (at least " + std::to_string(Count) + " turns)";
		}
		Out.Type = Mapped;
		Out.Description = Desc;
		Out.bHasTarget = true; Out.Target = Target;
		Out.RequiredCount = static_cast<double>(Count);
		if (Functor == "talk_to") { Out.bHasNpcId = true; Out.NpcId = Target; }
		return true;
	}

	// Deliver: deliver(item, npc)
	if (Functor == "deliver" && Args.size() >= 2) {
		Out.Type = "deliver_item";
		Out.Description = "Deliver " + Args[0] + " to " + Args[1];
		Out.bHasTarget = true; Out.Target = Args[1];
		Out.RequiredCount = 1;
		return true;
	}

	// Count-only goals: functor(count[, extra])
	if (LookupMap(CountGoals(), Functor, Mapped) && Args.size() >= 1) {
		static const std::regex NumRe("^\\d+(\\.\\d+)?$");
		if (std::regex_match(Args[0], NumRe)) {
			const long long Count = ParseIntPrefix(Args[0]);
			Out.Type = Functor;
			Out.Description = FormatCountDescription(Mapped, Count);
			Out.RequiredCount = static_cast<double>(Count);
			return true;
		}
	}

	// objective('description text')
	if (Functor == "objective" && Args.size() >= 1) {
		Out.Type = "objective";
		Out.Description = Capitalize(Args[0]);
		Out.RequiredCount = 1;
		return true;
	}

	// Fallback — human-readable description from the raw goal.
	std::string Desc = Goal;
	Desc = ReplaceAll(Desc, "_", " ");
	Desc.erase(std::remove(Desc.begin(), Desc.end(), '\''), Desc.end());
	static const std::regex ParenRe("\\(.*\\)");
	Desc = std::regex_replace(Desc, ParenRe, "");
	Out.Type = Functor.empty() ? "custom" : Functor;
	Out.Description = Capitalize(Trim(Desc));
	Out.RequiredCount = 1;
	return true;
}

// ── scalar fact parsers ────────────────────────────────────────────────────

bool ParseStringFact(const std::string& Content, const std::string& Predicate, std::string& Out) {
	const std::regex Re(Predicate + "\\(\\s*\\w+\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*\\)");
	std::smatch M;
	if (std::regex_search(Content, M, Re)) { Out = Unescape(M[1].str()); return true; }
	return false;
}

bool ParseAtomFact(const std::string& Content, const std::string& Predicate, std::string& Out) {
	const std::regex Re(Predicate + "\\(\\s*\\w+\\s*,\\s*(\\w+)\\s*\\)");
	std::smatch M;
	if (std::regex_search(Content, M, Re)) { Out = M[1].str(); return true; }
	return false;
}

std::vector<std::string> ParseAllAtomFacts(const std::string& Content, const std::string& Predicate) {
	std::vector<std::string> Out;
	const std::regex Re(Predicate + "\\(\\s*\\w+\\s*,\\s*(\\w+)\\s*\\)");
	for (auto It = std::sregex_iterator(Content.begin(), Content.end(), Re);
		It != std::sregex_iterator(); ++It) {
		Out.push_back((*It)[1].str());
	}
	return Out;
}

// ── FHydratedQuest::ToProjection ───────────────────────────────────────────

} // namespace

FJsonValuePtr FHydratedQuest::ToProjection() const {
	auto Obj = std::make_shared<FJsonValue>();
	Obj->Type = EJsonType::Object;
	if (bHasTitle) AddMember(*Obj, "title", MakeString(Title));
	if (bHasQuestType) AddMember(*Obj, "questType", MakeString(QuestType));
	if (bHasDifficulty) AddMember(*Obj, "difficulty", MakeString(Difficulty));
	if (bHasStatus) AddMember(*Obj, "status", MakeString(Status));
	if (bHasTargetLanguage) AddMember(*Obj, "targetLanguage", MakeString(TargetLanguage));
	if (bHasAssignedTo) AddMember(*Obj, "assignedTo", MakeString(AssignedTo));
	if (bHasAssignedBy) AddMember(*Obj, "assignedBy", MakeString(AssignedBy));
	if (bHasExperience) AddMember(*Obj, "experienceReward", MakeNumber(ExperienceReward));
	if (!Tags.empty()) AddMember(*Obj, "tags", MakeStringArray(Tags));
	if (!PrerequisiteQuestIds.empty())
		AddMember(*Obj, "prerequisiteQuestIds", MakeStringArray(PrerequisiteQuestIds));
	if (bHasCompletion) {
		auto CC = std::make_shared<FJsonValue>();
		CC->Type = EJsonType::Object;
		AddMember(*CC, "type", MakeString(CompletionType));
		if (bHasCompletionDescription) AddMember(*CC, "description", MakeString(CompletionDescription));
		if (bHasCompletionTurns) AddMember(*CC, "requiredTurns", MakeNumber(CompletionTurns));
		AddMember(*Obj, "completionCriteria", CC);
	}
	if (!Objectives.empty()) {
		auto Arr = std::make_shared<FJsonValue>();
		Arr->Type = EJsonType::Array;
		for (const auto& O : Objectives) {
			auto E = std::make_shared<FJsonValue>();
			E->Type = EJsonType::Object;
			AddMember(*E, "id", MakeString(O.Id));
			AddMember(*E, "type", MakeString(O.Type));
			AddMember(*E, "description", MakeString(O.Description));
			AddMember(*E, "requiredCount", MakeNumber(O.RequiredCount));
			if (O.bHasTarget) AddMember(*E, "target", MakeString(O.Target));
			if (O.bHasNpcId) AddMember(*E, "npcId", MakeString(O.NpcId));
			Arr->ArrayItems.push_back(E);
		}
		AddMember(*Obj, "objectives", Arr);
	}
	return Obj;
}

// ── HydrateFromContent ─────────────────────────────────────────────────────

FHydratedQuest FInsimulQuestSystem::HydrateFromContent(const std::string& Content,
	const std::string& InputStatus) {
	FHydratedQuest Q;

	// Quest id (head atom of the first quest/N term).
	{
		static const std::regex IdRe("quest\\(\\s*(\\w+)");
		std::smatch M;
		if (std::regex_search(Content, M, IdRe)) Q.Id = M[1].str();
	}

	// quest/5 main fact: quest(id, 'title', type, difficulty, status)
	std::string MainStatus;
	bool bHasMain = false;
	{
		static const std::regex QuestRe(
			"quest\\(\\s*\\w+\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*,\\s*(\\w+)\\s*,\\s*(\\w+)\\s*,\\s*(\\w+)\\s*\\)");
		std::smatch M;
		if (std::regex_search(Content, M, QuestRe)) {
			bHasMain = true;
			Q.bHasTitle = true; Q.Title = Unescape(M[1].str());
			Q.bHasQuestType = true; Q.QuestType = M[2].str();
			Q.bHasDifficulty = true; Q.Difficulty = M[3].str();
			MainStatus = M[4].str();
		}
	}

	// Prerequisites (excludes 'none').
	std::vector<std::string> Prereqs;
	{
		static const std::regex PrereqRe("quest_prerequisite\\(\\s*\\w+\\s*,\\s*(\\w+)\\s*\\)");
		for (auto It = std::sregex_iterator(Content.begin(), Content.end(), PrereqRe);
			It != std::sregex_iterator(); ++It) {
			const std::string P = (*It)[1].str();
			if (P != "none") Prereqs.push_back(P);
		}
	}

	// Status resolution (mirrors the hydrator's availability rule).
	if (bHasMain) {
		if (InputStatus.empty()) {
			Q.bHasStatus = true; Q.Status = MainStatus;
		} else if (InputStatus == "unavailable" && MainStatus == "available") {
			Q.bHasStatus = true;
			Q.Status = Prereqs.empty() ? "available" : InputStatus;
		} else {
			Q.bHasStatus = true; Q.Status = InputStatus;
		}
	} else if (!InputStatus.empty()) {
		Q.bHasStatus = true; Q.Status = InputStatus;
	}

	// Objectives: quest_objective(id, Index, Goal).
	{
		static const std::regex ObjRe("quest_objective\\(\\s*\\w+\\s*,\\s*(\\d+)\\s*,\\s*(.*)\\)\\s*\\.");
		for (auto It = std::sregex_iterator(Content.begin(), Content.end(), ObjRe);
			It != std::sregex_iterator(); ++It) {
			const std::smatch& M = *It;
			const long long Index = ParseIntPrefix(M[1].str());
			FHydratedObjective O;
			if (ParseObjectiveGoal(Trim(M[2].str()), O)) {
				O.Id = "obj_" + std::to_string(Index);
				Q.Objectives.push_back(O);
			}
		}
	}

	// Scalars.
	std::string S;
	if (ParseStringFact(Content, "quest_assigned_to", S)) { Q.bHasAssignedTo = true; Q.AssignedTo = S; }
	if (ParseStringFact(Content, "quest_assigned_by", S)) { Q.bHasAssignedBy = true; Q.AssignedBy = S; }
	if (ParseAtomFact(Content, "quest_language", S)) { Q.bHasTargetLanguage = true; Q.TargetLanguage = S; }

	// Rewards: quest_reward(id, key, N) — experience is promoted to a scalar.
	{
		static const std::regex RewardRe("quest_reward\\(\\s*\\w+\\s*,\\s*(\\w+)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*\\)");
		for (auto It = std::sregex_iterator(Content.begin(), Content.end(), RewardRe);
			It != std::sregex_iterator(); ++It) {
			if ((*It)[1].str() == "experience") {
				Q.bHasExperience = true;
				Q.ExperienceReward = std::stod((*It)[2].str());
			}
		}
	}

	// Tags.
	Q.Tags = ParseAllAtomFacts(Content, "quest_tag");

	// Prerequisites projection (only when real prereqs present).
	if (!Prereqs.empty()) Q.PrerequisiteQuestIds = Prereqs;

	// Completion criteria: quest_completion(id, Goal).
	{
		static const std::regex CompRe("quest_completion\\(\\s*\\w+\\s*,\\s*(.*?)\\)\\s*\\.");
		std::smatch M;
		if (std::regex_search(Content, M, CompRe)) {
			const std::string Goal = Trim(M[1].str());
			static const std::regex ConvRe("^conversation_turns\\(\\s*(\\d+)\\s*\\)$");
			std::smatch CM;
			if (Goal == "all_objectives_complete") {
				Q.bHasCompletion = true; Q.CompletionType = "all_objectives";
				Q.bHasCompletionDescription = true; Q.CompletionDescription = "Complete all objectives";
			} else if (std::regex_match(Goal, CM, ConvRe)) {
				Q.bHasCompletion = true; Q.CompletionType = "conversation_turns";
				Q.bHasCompletionTurns = true; Q.CompletionTurns = static_cast<double>(ParseIntPrefix(CM[1].str()));
			} else {
				// vocabulary_* and unknown goals default to all-objectives (as TS does).
				Q.bHasCompletion = true; Q.CompletionType = "all_objectives";
				Q.bHasCompletionDescription = true; Q.CompletionDescription = "Complete all objectives";
			}
		}
	}

	return Q;
}

std::string FInsimulQuestSystem::HydrateCanonical(const std::string& Content,
	const std::string& InputStatus) {
	const FHydratedQuest Q = HydrateFromContent(Content, InputStatus);
	return CanonicalJsonStringify(*Q.ToProjection());
}

// ── FInsimulKB ─────────────────────────────────────────────────────────────

void FInsimulKB::Assert(const FPrologFact& Fact) {
	for (const auto& F : FactList) if (F == Fact) return;
	FactList.push_back(Fact);
}

bool FInsimulKB::Has(const std::string& Predicate, const std::vector<FPrologArg>& Args) const {
	for (const auto& F : FactList) {
		if (F.Predicate == Predicate && F.Args == Args) return true;
	}
	return false;
}

// ── Query-driven completion + fact-asserting transitions ───────────────────

bool FInsimulQuestSystem::IsObjectiveSatisfied(const FHydratedQuest& Quest, std::size_t Index,
	const FInsimulKB& KB) {
	if (Index >= Quest.Objectives.size()) return false;
	const FHydratedObjective& O = Quest.Objectives[Index];

	// Explicit satisfaction fact.
	if (KB.Has("objective_satisfied", {FPrologArg::MakeAtom(Quest.Id), FPrologArg::MakeAtom(O.Id)}))
		return true;

	// Type-specific trigger facts (player is the acting subject).
	if (O.bHasTarget) {
		const std::vector<FPrologArg> PlayerTarget = {
			FPrologArg::MakeAtom("player"), FPrologArg::MakeAtom(O.Target)};
		if (O.Type == "talk_to_npc" && KB.Has("talked_to", PlayerTarget)) return true;
		if (O.Type == "visit_location" && KB.Has("visited", PlayerTarget)) return true;
		if (O.Type == "deliver_item" && KB.Has("delivered", PlayerTarget)) return true;
	}
	return false;
}

FQuestTransition FInsimulQuestSystem::EvaluateQuest(FHydratedQuest& Quest, FInsimulKB& KB) {
	FQuestTransition Result;
	Result.QuestId = Quest.Id;

	bool bAllSatisfied = !Quest.Objectives.empty();
	for (std::size_t I = 0; I < Quest.Objectives.size(); ++I) {
		if (IsObjectiveSatisfied(Quest, I, KB)) {
			const FHydratedObjective& O = Quest.Objectives[I];
			FPrologFact Done;
			Done.Predicate = "quest_objective_complete";
			Done.Args = {FPrologArg::MakeAtom(Quest.Id), FPrologArg::MakeAtom(O.Id)};
			KB.Assert(Done);
			Result.SatisfiedObjectiveIds.push_back(O.Id);
		} else {
			bAllSatisfied = false;
		}
	}

	// Completion criterion: all-objectives (the default). conversation_turns is a
	// runtime-metered criterion, not auto-satisfied by objective facts here.
	const bool bAllObjectivesCriterion =
		!Quest.bHasCompletion || Quest.CompletionType == "all_objectives";
	if (bAllSatisfied && bAllObjectivesCriterion) {
		FPrologFact Complete;
		Complete.Predicate = "quest_complete";
		Complete.Args = {FPrologArg::MakeAtom(Quest.Id)};
		KB.Assert(Complete);
		Quest.bHasStatus = true;
		Quest.Status = "completed";
		Result.bCompleted = true;
	}
	return Result;
}

// ── Radiant tick ───────────────────────────────────────────────────────────

std::vector<FPrologFact> FInsimulQuestSystem::RadiantTick(const std::vector<FRadiantQuest>& Quests,
	int MaxOffering, int Ticks) {
	std::vector<FPrologFact> Facts;
	std::vector<std::string> Offered;
	auto WasOffered = [&Offered](const std::string& Id) {
		return std::find(Offered.begin(), Offered.end(), Id) != Offered.end();
	};
	for (int T = 0; T < Ticks; ++T) {
		std::vector<std::string> Candidates;
		for (const auto& Q : Quests) {
			const bool bRadiant = std::find(Q.Tags.begin(), Q.Tags.end(), "radiant") != Q.Tags.end();
			if (bRadiant && Q.Status == "available" && !WasOffered(Q.Id)) {
				Candidates.push_back(Q.Id);
			}
		}
		std::sort(Candidates.begin(), Candidates.end());
		const int Limit = MaxOffering > 0 ? MaxOffering : 0;
		for (int I = 0; I < static_cast<int>(Candidates.size()) && I < Limit; ++I) {
			Offered.push_back(Candidates[I]);
			FPrologFact F;
			F.Predicate = "quest_offered";
			F.Args = {FPrologArg::MakeAtom(Candidates[I]), FPrologArg::MakeNumber(static_cast<double>(T))};
			Facts.push_back(F);
		}
	}
	return Facts;
}

std::string FInsimulQuestSystem::CanonicalFactString(const FPrologFact& Fact) {
	std::string S = Fact.Predicate + "(";
	for (std::size_t I = 0; I < Fact.Args.size(); ++I) {
		if (I > 0) S += ",";
		const FPrologArg& A = Fact.Args[I];
		if (A.bIsNumber) {
			S += CanonicalNumber(A.Num, std::string());
		} else {
			S += A.Str;
		}
	}
	S += ")";
	return S;
}

std::string FInsimulQuestSystem::CanonicalFactList(const std::vector<FPrologFact>& Facts) {
	std::vector<std::string> Lines;
	Lines.reserve(Facts.size());
	for (const auto& F : Facts) Lines.push_back(CanonicalFactString(F));
	std::sort(Lines.begin(), Lines.end());
	std::string Out;
	for (std::size_t I = 0; I < Lines.size(); ++I) {
		if (I > 0) Out += "\n";
		Out += Lines[I];
	}
	return Out;
}

} // namespace insimul
