// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulChatModel implementation — see InsimulChatModel.h. std-only; host-tested
// by tools/verify-unreal/run-dialogue-ui-tests.sh against chat-cases.json.

#include "InsimulChatModel.h"

namespace insimul {

namespace {

std::string TrimEdges(const std::string& S) {
	std::size_t B = 0;
	std::size_t E = S.size();
	while (B < E && (S[B] == ' ' || S[B] == '\t' || S[B] == '\n' || S[B] == '\r')) {
		++B;
	}
	while (E > B && (S[E - 1] == ' ' || S[E - 1] == '\t' || S[E - 1] == '\n' || S[E - 1] == '\r')) {
		--E;
	}
	return S.substr(B, E - B);
}

} // namespace

FInsimulChatModel::FInsimulChatModel(const std::string& InCharId, const std::string& InCharName)
	: CharId(InCharId), CharName(InCharName.empty() ? InCharId : InCharName) {}

void FInsimulChatModel::Greeting(const std::string& Text) {
	if (Text.empty()) {
		return;
	}
	FChatMessage M;
	M.Role = "npc";
	M.Text = Text;
	Messages.push_back(M);
}

bool FInsimulChatModel::BeginUserTurn(const std::string& Text) {
	if (bStreaming) {
		return false;
	}
	const std::string Trimmed = TrimEdges(Text);
	if (Trimmed.empty()) {
		return false;
	}
	FChatMessage Player;
	Player.Role = "player";
	Player.Text = Trimmed;
	Messages.push_back(Player);

	FChatMessage Bubble;
	Bubble.Role = "npc";
	Bubble.bStreaming = true;
	Messages.push_back(Bubble);

	StreamIndex = static_cast<long long>(Messages.size()) - 1;
	bStreaming = true;
	return true;
}

void FInsimulChatModel::AppendChunk(const std::string& Text) {
	if (!bStreaming || StreamIndex < 0) {
		return;
	}
	Messages[static_cast<std::size_t>(StreamIndex)].Text += Text;
}

void FInsimulChatModel::TriggerAction(const FChatAction& Action) {
	Actions.push_back(Action);
}

bool FInsimulChatModel::CloseTurn(const std::string* FullText) {
	if (!bStreaming || StreamIndex < 0) {
		return false;
	}
	FChatMessage& Bubble = Messages[static_cast<std::size_t>(StreamIndex)];
	if (FullText != nullptr) {
		Bubble.Text = *FullText;
	}
	Bubble.bStreaming = false;
	bStreaming = false;
	StreamIndex = -1;
	++TurnCount;
	return true;
}

bool FInsimulChatModel::CompleteTurn() {
	return CloseTurn(nullptr);
}

bool FInsimulChatModel::CompleteTurn(const std::string& FullText) {
	return CloseTurn(&FullText);
}

bool FInsimulChatModel::FailTurn(const std::string& Error) {
	if (!bStreaming || StreamIndex < 0) {
		return false;
	}
	FChatMessage& Bubble = Messages[static_cast<std::size_t>(StreamIndex)];
	Bubble.Text = "[Error: " + Error + "]";
	Bubble.bError = true;
	Bubble.bStreaming = false;
	bStreaming = false;
	StreamIndex = -1;
	// A failed turn does NOT count as a completed turn and drops from history.
	return true;
}

std::string FInsimulChatModel::StreamingText() const {
	if (StreamIndex >= 0) {
		return Messages[static_cast<std::size_t>(StreamIndex)].Text;
	}
	return std::string();
}

std::string FInsimulChatModel::LastNpcText() const {
	for (std::size_t I = Messages.size(); I-- > 0;) {
		const FChatMessage& M = Messages[I];
		if (M.Role == "npc" && !M.bStreaming && !M.bError) {
			return M.Text;
		}
	}
	return std::string();
}

FChatHistory FInsimulChatModel::History(const std::string& Timestamp) const {
	FChatHistory Out;
	for (const FChatMessage& M : Messages) {
		if (M.bStreaming || M.bError) {
			continue;
		}
		FChatHistoryTurn T;
		T.Role = M.Role;
		T.Content = M.Text;
		T.Timestamp = Timestamp;
		Out.RecentTurns.push_back(T);
	}
	Out.TotalTurnCount = TurnCount;
	return Out;
}

} // namespace insimul
