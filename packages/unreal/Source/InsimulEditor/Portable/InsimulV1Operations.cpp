// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulV1Operations.cpp — the v1 operation table body (US-XE1). Keep in lock
// step with packages/core/openapi/operations.json; the host conformance test
// (Tests/test_editor_session.cpp) fails on any drift.

#include "InsimulV1Operations.h"

namespace insimul {

const std::vector<FV1Operation>& AllOperations() {
	static const std::vector<FV1Operation> Table = {
		{ "streamConversation", "POST", "/api/conversation/stream" },
		{ "streamConversationAudio", "POST", "/api/conversation/stream-audio" },
		{ "endConversation", "POST", "/api/conversation/end" },
		{ "healthCheck", "GET", "/api/conversation/health" },
		{ "listWorlds", "GET", "/api/worlds" },
		{ "getWorldDetail", "POST", "/api/worlds/detail" },
		{ "importWorld", "POST", "/api/generation/import" },
		{ "startGenerationJob", "POST", "/api/generation/jobs" },
		{ "getGenerationJob", "POST", "/api/generation/jobs/status" },
		{ "streamGenerationJob", "POST", "/api/generation/jobs/events" },
		{ "syncGenerationJob", "POST", "/api/generation/jobs/sync" },
	};
	return Table;
}

FV1Operation ResolveOperation(const std::string& OperationId) {
	for (const FV1Operation& Op : AllOperations()) {
		if (Op.OperationId == OperationId) {
			return Op;
		}
	}
	return FV1Operation{};
}

const std::vector<std::string>& UsedOperationIds() {
	static const std::vector<std::string> Used = {
		"healthCheck",
		"listWorlds",
		"getWorldDetail",
		"importWorld",
		"startGenerationJob",
		"getGenerationJob",
		"streamGenerationJob",
		"syncGenerationJob",
		"streamConversation",
		"endConversation",
	};
	return Used;
}

} // namespace insimul
