// Copyright 2024 Insimul. All Rights Reserved.
//
// Portable, dependency-free SHA-256 for the Insimul runtime core.
//
// std-only (no Unreal Engine, no OpenSSL) so it is host-testable via the
// tools/verify-unreal CMake harness. Produces the lowercase-hex digest used by
// the save-envelope integrity check, byte-compatible with Node's
// crypto.createHash('sha256').digest('hex') in packages/core/src/save-envelope.ts.

#pragma once

#include <cstdint>
#include <string>

namespace insimul {

/** Lowercase 64-char hex SHA-256 digest of the raw UTF-8 bytes of `Data`. */
std::string Sha256Hex(const std::string& Data);

} // namespace insimul
