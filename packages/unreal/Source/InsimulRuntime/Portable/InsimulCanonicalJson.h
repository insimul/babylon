// Copyright 2024 Insimul. All Rights Reserved.
//
// Canonical JSON serializer — the C++ twin of canonicalJSONStringify in
// packages/core/src/save-envelope.ts (the semantics authority).
//
// Produces a byte-for-byte match with `JSON.stringify(sortDeep(value))`:
//   - object keys sorted ascending at every depth (JS Array.sort default;
//     equivalent to std::string operator< for the ASCII keys save files use),
//   - arrays keep their order,
//   - no whitespace (minified),
//   - numbers formatted the way ECMAScript ToString(Number) / JSON.stringify
//     would render them (integers plain; short decimals as-is), NOT the raw
//     input lexeme, so a re-encoded `1e2` or `1.50` still hashes identically,
//   - strings escaped exactly as JSON.stringify does (short escapes for
//     \b\f\n\r\t, \u00XX for other control chars, raw UTF-8 otherwise, and /
//     is NOT escaped).
//
// The integrity hash (SHA-256 of this output) is therefore portable across the
// TS, Unity, and Unreal runtimes. std-only — no Unreal Engine.

#pragma once

#include "InsimulJson.h"

#include <string>

namespace insimul {

/** Serialize a parsed JSON value in canonical (key-sorted, minified) form. */
std::string CanonicalJsonStringify(const FJsonValue& Value);

/** Convenience: SHA-256 hex of the canonical serialization of `Value`. */
std::string CanonicalJsonIntegrity(const FJsonValue& Value);

/**
 * Format a number the way ECMAScript ToString(Number) would. Exposed for the
 * fixture-vector tests. `Raw` is the original lexeme (used only as a fallback
 * for integral magnitudes beyond the int64 fast path).
 */
std::string CanonicalNumber(double Value, const std::string& Raw);

/** Escape a UTF-8 string exactly as JSON.stringify would (quotes included). */
std::string CanonicalJsonString(const std::string& Value);

} // namespace insimul
