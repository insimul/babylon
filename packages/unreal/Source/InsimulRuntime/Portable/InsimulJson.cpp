// Copyright 2024 Insimul. All Rights Reserved.

#include "InsimulJson.h"

#include <cstdlib>

namespace insimul {

const FJsonValue* FJsonValue::Find(const std::string& Key) const {
	if (!IsObject()) {
		return nullptr;
	}
	for (const auto& Pair : ObjectItems) {
		if (Pair.first == Key) {
			return Pair.second.get();
		}
	}
	return nullptr;
}

std::string FJsonValue::AsString(const std::string& Default) const {
	return IsString() ? StringValue : Default;
}

double FJsonValue::AsNumber(double Default) const {
	return IsNumber() ? NumberValue : Default;
}

long long FJsonValue::AsInt(long long Default) const {
	return IsNumber() ? static_cast<long long>(NumberValue) : Default;
}

bool FJsonValue::AsBool(bool Default) const {
	return Type == EJsonType::Bool ? BoolValue : Default;
}

std::string FJsonValue::GetString(const std::string& Key, const std::string& Default) const {
	const FJsonValue* Member = Find(Key);
	return Member ? Member->AsString(Default) : Default;
}

long long FJsonValue::GetInt(const std::string& Key, long long Default) const {
	const FJsonValue* Member = Find(Key);
	return Member ? Member->AsInt(Default) : Default;
}

bool FJsonValue::GetBool(const std::string& Key, bool Default) const {
	const FJsonValue* Member = Find(Key);
	return Member ? Member->AsBool(Default) : Default;
}

namespace {

/** Minimal recursive-descent JSON parser over a std::string. */
class FParser {
public:
	explicit FParser(const std::string& InText) : Text(InText) {}

	FJsonParseResult Run() {
		FJsonParseResult Result;
		SkipWhitespace();
		FJsonValuePtr Root = ParseValue();
		if (bError) {
			Result.bOk = false;
			Result.Error = Error;
			Result.ErrorPos = Pos;
			return Result;
		}
		SkipWhitespace();
		if (Pos != Text.size()) {
			Result.bOk = false;
			Result.Error = "Trailing characters after JSON value";
			Result.ErrorPos = Pos;
			return Result;
		}
		Result.bOk = true;
		Result.Root = Root;
		return Result;
	}

private:
	const std::string& Text;
	std::size_t Pos = 0;
	bool bError = false;
	std::string Error;

	void Fail(const char* Message) {
		if (!bError) {
			bError = true;
			Error = Message;
		}
	}

	bool AtEnd() const { return Pos >= Text.size(); }
	char Peek() const { return Pos < Text.size() ? Text[Pos] : '\0'; }

	void SkipWhitespace() {
		while (Pos < Text.size()) {
			const char C = Text[Pos];
			if (C == ' ' || C == '\t' || C == '\n' || C == '\r') {
				++Pos;
			} else {
				break;
			}
		}
	}

	FJsonValuePtr ParseValue() {
		if (bError) {
			return nullptr;
		}
		SkipWhitespace();
		if (AtEnd()) {
			Fail("Unexpected end of input");
			return nullptr;
		}
		const char C = Peek();
		switch (C) {
			case '{': return ParseObject();
			case '[': return ParseArray();
			case '"': return ParseString();
			case 't':
			case 'f': return ParseBool();
			case 'n': return ParseNull();
			default:
				if (C == '-' || (C >= '0' && C <= '9')) {
					return ParseNumber();
				}
				Fail("Unexpected character");
				return nullptr;
		}
	}

	FJsonValuePtr ParseObject() {
		auto Node = std::make_shared<FJsonValue>();
		Node->Type = EJsonType::Object;
		++Pos; // consume '{'
		SkipWhitespace();
		if (Peek() == '}') {
			++Pos;
			return Node;
		}
		while (true) {
			SkipWhitespace();
			if (Peek() != '"') {
				Fail("Expected object key string");
				return nullptr;
			}
			FJsonValuePtr KeyNode = ParseString();
			if (bError) {
				return nullptr;
			}
			SkipWhitespace();
			if (Peek() != ':') {
				Fail("Expected ':' after object key");
				return nullptr;
			}
			++Pos; // consume ':'
			FJsonValuePtr ValueNode = ParseValue();
			if (bError) {
				return nullptr;
			}
			Node->ObjectItems.emplace_back(KeyNode->StringValue, ValueNode);
			SkipWhitespace();
			const char Next = Peek();
			if (Next == ',') {
				++Pos;
				continue;
			}
			if (Next == '}') {
				++Pos;
				break;
			}
			Fail("Expected ',' or '}' in object");
			return nullptr;
		}
		return Node;
	}

	FJsonValuePtr ParseArray() {
		auto Node = std::make_shared<FJsonValue>();
		Node->Type = EJsonType::Array;
		++Pos; // consume '['
		SkipWhitespace();
		if (Peek() == ']') {
			++Pos;
			return Node;
		}
		while (true) {
			FJsonValuePtr ValueNode = ParseValue();
			if (bError) {
				return nullptr;
			}
			Node->ArrayItems.push_back(ValueNode);
			SkipWhitespace();
			const char Next = Peek();
			if (Next == ',') {
				++Pos;
				continue;
			}
			if (Next == ']') {
				++Pos;
				break;
			}
			Fail("Expected ',' or ']' in array");
			return nullptr;
		}
		return Node;
	}

	void AppendCodepointUtf8(std::string& Out, unsigned int Cp) {
		if (Cp <= 0x7F) {
			Out.push_back(static_cast<char>(Cp));
		} else if (Cp <= 0x7FF) {
			Out.push_back(static_cast<char>(0xC0 | (Cp >> 6)));
			Out.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
		} else if (Cp <= 0xFFFF) {
			Out.push_back(static_cast<char>(0xE0 | (Cp >> 12)));
			Out.push_back(static_cast<char>(0x80 | ((Cp >> 6) & 0x3F)));
			Out.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
		} else {
			Out.push_back(static_cast<char>(0xF0 | (Cp >> 18)));
			Out.push_back(static_cast<char>(0x80 | ((Cp >> 12) & 0x3F)));
			Out.push_back(static_cast<char>(0x80 | ((Cp >> 6) & 0x3F)));
			Out.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
		}
	}

	int ReadHex4() {
		if (Pos + 4 > Text.size()) {
			Fail("Truncated \\u escape");
			return -1;
		}
		int Value = 0;
		for (int I = 0; I < 4; ++I) {
			const char C = Text[Pos + I];
			Value <<= 4;
			if (C >= '0' && C <= '9') {
				Value |= (C - '0');
			} else if (C >= 'a' && C <= 'f') {
				Value |= (C - 'a' + 10);
			} else if (C >= 'A' && C <= 'F') {
				Value |= (C - 'A' + 10);
			} else {
				Fail("Invalid hex digit in \\u escape");
				return -1;
			}
		}
		Pos += 4;
		return Value;
	}

	FJsonValuePtr ParseString() {
		auto Node = std::make_shared<FJsonValue>();
		Node->Type = EJsonType::String;
		++Pos; // consume opening quote
		std::string& Out = Node->StringValue;
		while (true) {
			if (AtEnd()) {
				Fail("Unterminated string");
				return nullptr;
			}
			const char C = Text[Pos++];
			if (C == '"') {
				break;
			}
			if (C == '\\') {
				if (AtEnd()) {
					Fail("Unterminated escape sequence");
					return nullptr;
				}
				const char Esc = Text[Pos++];
				switch (Esc) {
					case '"': Out.push_back('"'); break;
					case '\\': Out.push_back('\\'); break;
					case '/': Out.push_back('/'); break;
					case 'b': Out.push_back('\b'); break;
					case 'f': Out.push_back('\f'); break;
					case 'n': Out.push_back('\n'); break;
					case 'r': Out.push_back('\r'); break;
					case 't': Out.push_back('\t'); break;
					case 'u': {
						const int First = ReadHex4();
						if (bError) {
							return nullptr;
						}
						unsigned int Cp = static_cast<unsigned int>(First);
						// Surrogate pair handling.
						if (Cp >= 0xD800 && Cp <= 0xDBFF) {
							if (Pos + 1 < Text.size() && Text[Pos] == '\\' && Text[Pos + 1] == 'u') {
								Pos += 2;
								const int Second = ReadHex4();
								if (bError) {
									return nullptr;
								}
								const unsigned int Low = static_cast<unsigned int>(Second);
								if (Low >= 0xDC00 && Low <= 0xDFFF) {
									Cp = 0x10000 + ((Cp - 0xD800) << 10) + (Low - 0xDC00);
								} else {
									// Unpaired: emit replacement char.
									AppendCodepointUtf8(Out, 0xFFFD);
									Cp = Low;
								}
							} else {
								Cp = 0xFFFD;
							}
						}
						AppendCodepointUtf8(Out, Cp);
						break;
					}
					default:
						Fail("Invalid escape character");
						return nullptr;
				}
			} else {
				Out.push_back(C);
			}
		}
		return Node;
	}

	FJsonValuePtr ParseNumber() {
		auto Node = std::make_shared<FJsonValue>();
		Node->Type = EJsonType::Number;
		const std::size_t Start = Pos;
		if (Peek() == '-') {
			++Pos;
		}
		while (Pos < Text.size() && Text[Pos] >= '0' && Text[Pos] <= '9') {
			++Pos;
		}
		if (Peek() == '.') {
			++Pos;
			while (Pos < Text.size() && Text[Pos] >= '0' && Text[Pos] <= '9') {
				++Pos;
			}
		}
		if (Peek() == 'e' || Peek() == 'E') {
			++Pos;
			if (Peek() == '+' || Peek() == '-') {
				++Pos;
			}
			while (Pos < Text.size() && Text[Pos] >= '0' && Text[Pos] <= '9') {
				++Pos;
			}
		}
		Node->RawNumber = Text.substr(Start, Pos - Start);
		if (Node->RawNumber.empty()) {
			Fail("Invalid number");
			return nullptr;
		}
		Node->NumberValue = std::strtod(Node->RawNumber.c_str(), nullptr);
		return Node;
	}

	FJsonValuePtr ParseBool() {
		auto Node = std::make_shared<FJsonValue>();
		Node->Type = EJsonType::Bool;
		if (Text.compare(Pos, 4, "true") == 0) {
			Node->BoolValue = true;
			Pos += 4;
		} else if (Text.compare(Pos, 5, "false") == 0) {
			Node->BoolValue = false;
			Pos += 5;
		} else {
			Fail("Invalid literal");
			return nullptr;
		}
		return Node;
	}

	FJsonValuePtr ParseNull() {
		if (Text.compare(Pos, 4, "null") == 0) {
			Pos += 4;
			auto Node = std::make_shared<FJsonValue>();
			Node->Type = EJsonType::Null;
			return Node;
		}
		Fail("Invalid literal");
		return nullptr;
	}
};

} // namespace

FJsonParseResult ParseJson(const std::string& Text) {
	FParser Parser(Text);
	return Parser.Run();
}

} // namespace insimul
