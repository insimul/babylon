// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulCanonicalJson.h"

#include "InsimulSha256.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <utility>
#include <vector>

namespace insimul {

std::string CanonicalNumber(double Value, const std::string& Raw) {
	// Non-finite values are not representable in JSON; JS emits `null`.
	if (std::isnan(Value) || std::isinf(Value)) {
		return "null";
	}

	// Integral fast path. std::to_string(long long) reproduces JS's integer
	// rendering exactly, and covers every integer save files carry (ids,
	// counts, ms timestamps ~1.7e12). Cap below int64 range; fall back to the
	// raw lexeme for the (save-absent) 9e18..1e21 integral band.
	if (Value == std::floor(Value) && std::fabs(Value) < 9.0e18) {
		return std::to_string(static_cast<long long>(Value));
	}

	// Non-integral (or huge): shortest %.*g string that round-trips back to the
	// same double — this matches ECMAScript's shortest-representation rule for
	// the simple decimals save files use (0.6, 2.5, ...).
	for (int Precision = 1; Precision <= 17; ++Precision) {
		char Buffer[64];
		std::snprintf(Buffer, sizeof(Buffer), "%.*g", Precision, Value);
		if (std::strtod(Buffer, nullptr) == Value) {
			return std::string(Buffer);
		}
	}
	// Unreachable for finite doubles; keep the raw token as a last resort.
	return Raw.empty() ? "0" : Raw;
}

std::string CanonicalJsonString(const std::string& Value) {
	static const char* Hex = "0123456789abcdef";
	std::string Out;
	Out.reserve(Value.size() + 2);
	Out.push_back('"');
	for (unsigned char C : Value) {
		switch (C) {
			case '"': Out += "\\\""; break;
			case '\\': Out += "\\\\"; break;
			case '\b': Out += "\\b"; break;
			case '\f': Out += "\\f"; break;
			case '\n': Out += "\\n"; break;
			case '\r': Out += "\\r"; break;
			case '\t': Out += "\\t"; break;
			default:
				if (C < 0x20) {
					Out += "\\u00";
					Out.push_back(Hex[(C >> 4) & 0xF]);
					Out.push_back(Hex[C & 0xF]);
				} else {
					// Printable ASCII and raw UTF-8 bytes pass through unescaped,
					// exactly as JSON.stringify emits them.
					Out.push_back(static_cast<char>(C));
				}
		}
	}
	Out.push_back('"');
	return Out;
}

namespace {

void Emit(const FJsonValue& Value, std::string& Out) {
	switch (Value.Type) {
		case EJsonType::Null:
			Out += "null";
			break;
		case EJsonType::Bool:
			Out += Value.BoolValue ? "true" : "false";
			break;
		case EJsonType::Number:
			Out += CanonicalNumber(Value.NumberValue, Value.RawNumber);
			break;
		case EJsonType::String:
			Out += CanonicalJsonString(Value.StringValue);
			break;
		case EJsonType::Array: {
			Out.push_back('[');
			for (std::size_t I = 0; I < Value.ArrayItems.size(); ++I) {
				if (I != 0) {
					Out.push_back(',');
				}
				if (Value.ArrayItems[I]) {
					Emit(*Value.ArrayItems[I], Out);
				} else {
					Out += "null";
				}
			}
			Out.push_back(']');
			break;
		}
		case EJsonType::Object: {
			// Sort keys ascending by byte value (matches JS default sort for
			// ASCII keys). Ties keep first-seen ordering — save keys are unique.
			std::vector<std::size_t> Order(Value.ObjectItems.size());
			for (std::size_t I = 0; I < Order.size(); ++I) {
				Order[I] = I;
			}
			std::stable_sort(Order.begin(), Order.end(), [&](std::size_t A, std::size_t B) {
				return Value.ObjectItems[A].first < Value.ObjectItems[B].first;
			});
			Out.push_back('{');
			bool bFirst = true;
			for (std::size_t Idx : Order) {
				const auto& Pair = Value.ObjectItems[Idx];
				// JSON.stringify drops keys whose value is undefined. Parsed JSON
				// has no `undefined`, so every member is emitted here.
				if (!bFirst) {
					Out.push_back(',');
				}
				bFirst = false;
				Out += CanonicalJsonString(Pair.first);
				Out.push_back(':');
				if (Pair.second) {
					Emit(*Pair.second, Out);
				} else {
					Out += "null";
				}
			}
			Out.push_back('}');
			break;
		}
	}
}

} // namespace

std::string CanonicalJsonStringify(const FJsonValue& Value) {
	std::string Out;
	Emit(Value, Out);
	return Out;
}

std::string CanonicalJsonIntegrity(const FJsonValue& Value) {
	return Sha256Hex(CanonicalJsonStringify(Value));
}

} // namespace insimul
