// Copyright 2024 Insimul. All Rights Reserved.
//
// Portable, dependency-free JSON value + parser for the Insimul runtime core.
//
// This header intentionally uses ONLY the C++ standard library so it is
// host-testable via the tools/verify-unreal CMake harness (no Unreal Engine,
// no CoreMinimal.h). The UStruct boundary layer converts these std-based
// values into UE types at the engine seam.
//
// Number tokens preserve their original lexeme (RawNumber) so a future
// canonical re-serializer (US-XC2 save envelope) can reproduce byte-identical
// output for existing saves without re-formatting numbers.

#pragma once

#include <cstddef>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace insimul {

enum class EJsonType {
	Null,
	Bool,
	Number,
	String,
	Array,
	Object,
};

class FJsonValue;
using FJsonValuePtr = std::shared_ptr<FJsonValue>;

/** A parsed JSON node. Objects preserve key insertion order. */
class FJsonValue {
public:
	EJsonType Type = EJsonType::Null;

	bool BoolValue = false;

	/** Original number token text, preserved for byte-faithful re-emit. */
	std::string RawNumber;
	double NumberValue = 0.0;

	/** Decoded string contents (escapes already resolved). */
	std::string StringValue;

	std::vector<FJsonValuePtr> ArrayItems;
	std::vector<std::pair<std::string, FJsonValuePtr>> ObjectItems;

	bool IsNull() const { return Type == EJsonType::Null; }
	bool IsObject() const { return Type == EJsonType::Object; }
	bool IsArray() const { return Type == EJsonType::Array; }
	bool IsString() const { return Type == EJsonType::String; }
	bool IsNumber() const { return Type == EJsonType::Number; }

	/** Number of array elements (0 for non-arrays). */
	std::size_t Size() const { return IsArray() ? ArrayItems.size() : 0; }

	/** Look up an object member by key. Returns nullptr if absent or non-object. */
	const FJsonValue* Find(const std::string& Key) const;

	std::string AsString(const std::string& Default = std::string()) const;
	double AsNumber(double Default = 0.0) const;
	long long AsInt(long long Default = 0) const;
	bool AsBool(bool Default = false) const;

	/** Convenience: read a string member of this object (or Default). */
	std::string GetString(const std::string& Key, const std::string& Default = std::string()) const;
	long long GetInt(const std::string& Key, long long Default = 0) const;
	bool GetBool(const std::string& Key, bool Default = false) const;
};

struct FJsonParseResult {
	bool bOk = false;
	FJsonValuePtr Root;
	std::string Error;
	std::size_t ErrorPos = 0;
};

/** Parse a UTF-8 JSON document. On failure bOk is false and Error is set. */
FJsonParseResult ParseJson(const std::string& Text);

} // namespace insimul
