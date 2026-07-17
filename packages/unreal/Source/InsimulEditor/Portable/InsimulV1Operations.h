// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulV1Operations.h — the v1 operation table for the in-editor clients (US-XE1).
//
// The Unreal mirror of packages/core/openapi/operations.json (generated from
// openapi/insimul-v1.yaml by `npm run codegen`) and its engine-agnostic sibling
// packages/core/src/editor/operations.ts. Every native engine's hand-written
// editor client declares the same {operationId -> method, path} table; the host
// conformance test (Tests/test_editor_session.cpp) walks operations.json and
// asserts THIS table matches it verbatim (missing op, extra op, or method/path
// drift all fail), so a spec change that regenerates operations.json must update
// this table too.
//
// Deliberately Unreal-Engine-free (std lib only) so the pure session logic
// (FEditorSession) is host-testable headless against a mocked transport — no
// CoreMinimal.h, no FString/TArray. The UE-coupled seams sit on top.

#pragma once

#include <string>
#include <vector>

namespace insimul {

/** One REST operation: the HTTP verb + path template keyed by its operationId. */
struct FV1Operation {
	std::string OperationId;
	std::string Method;
	std::string Path;

	/** False for the sentinel returned when an operationId is unknown. */
	bool IsValid() const { return !OperationId.empty(); }
};

/**
 * The full v1 operation table, mirroring openapi/operations.json verbatim on
 * method + path. The conformance test pins this list against the generated spec.
 */
const std::vector<FV1Operation>& AllOperations();

/**
 * Resolve an operationId to its FV1Operation. The returned struct's IsValid() is
 * false for an unknown id (callers build the request from Method + Path).
 */
FV1Operation ResolveOperation(const std::string& OperationId);

/**
 * The operations the editor panels actively invoke. Every id here MUST resolve —
 * a used operation missing from the spec is a client bug caught before it 404s.
 * Later stories (World Browser, Generation Console, Conversation Tester) already
 * appear here so the used-set stays in lock step across engines.
 */
const std::vector<std::string>& UsedOperationIds();

} // namespace insimul
