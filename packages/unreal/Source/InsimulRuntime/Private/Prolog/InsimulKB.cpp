// Copyright 2024 Insimul. All Rights Reserved.
//
// Implementation of the plain C++ RAII wrapper over the libinsimul C ABI.
// Includes a self-contained parser for the binding-set JSON the ABI emits
// (insimul_query_next), so the wrapper carries no JSON dependency.
//
// UE-FREE: only <insimul.h> (the extern "C" ABI) and the C++ standard library.

#include "InsimulKB.h"

#include "insimul.h"

#include <cstdlib>

namespace insimul
{

// ---------------------------------------------------------------------------
// PrologValue::ToDisplayString
// ---------------------------------------------------------------------------
namespace
{
    void AppendNumber(std::string& Out, const PrologValue& V)
    {
        if (V.Type == PrologValueType::Int)
        {
            Out += std::to_string(V.Int);
        }
        else
        {
            // std::to_string(double) is fine for display; conformance compares
            // the structured values, not this text.
            Out += std::to_string(V.Float);
        }
    }
} // namespace

std::string PrologValue::ToDisplayString() const
{
    switch (Type)
    {
    case PrologValueType::Null:
        return "_";
    case PrologValueType::Atom:
        return Text;
    case PrologValueType::Int:
    case PrologValueType::Float:
    {
        std::string Out;
        AppendNumber(Out, *this);
        return Out;
    }
    case PrologValueType::List:
    {
        std::string Out = "[";
        for (std::size_t i = 0; i < Elements.size(); ++i)
        {
            if (i) Out += ",";
            Out += Elements[i].ToDisplayString();
        }
        Out += "]";
        return Out;
    }
    case PrologValueType::Compound:
    {
        std::string Out = Text;
        Out += "(";
        for (std::size_t i = 0; i < Elements.size(); ++i)
        {
            if (i) Out += ",";
            Out += Elements[i].ToDisplayString();
        }
        Out += ")";
        return Out;
    }
    }
    return "";
}

// ---------------------------------------------------------------------------
// PrologBinding
// ---------------------------------------------------------------------------
const PrologValue* PrologBinding::Find(const std::string& Name) const
{
    for (const auto& Kv : Vars)
    {
        if (Kv.first == Name)
        {
            return &Kv.second;
        }
    }
    return nullptr;
}

// ---------------------------------------------------------------------------
// Binding-set JSON parser
//
// The ABI guarantees well-formed JSON in the exact shape documented on
// insimul_query_next: a top-level object of Var -> value, values being string
// (atom), number (int/float), array (list), {"functor","args"} (compound), or
// null (unbound). This recursive-descent parser is intentionally minimal but
// handles the full string-escape set (including \uXXXX and surrogate pairs) so
// atoms with special characters round-trip correctly.
// ---------------------------------------------------------------------------
namespace
{

class JsonParser
{
public:
    explicit JsonParser(const char* Text)
        : P(Text), End(Text + (Text ? std::char_traits<char>::length(Text) : 0)) {}

    // Parse a top-level binding object into OutBinding. Returns false on malformed
    // input (a wrapper/ABI-contract violation, never expected in practice).
    bool ParseBinding(PrologBinding& OutBinding)
    {
        SkipWs();
        if (!Consume('{')) return false;
        SkipWs();
        if (Peek() == '}') { ++P; return true; } // "{}" — ground success
        for (;;)
        {
            SkipWs();
            std::string Key;
            if (!ParseString(Key)) return false;
            SkipWs();
            if (!Consume(':')) return false;
            PrologValue Value;
            if (!ParseValue(Value)) return false;
            OutBinding.Vars.emplace_back(std::move(Key), std::move(Value));
            SkipWs();
            const char C = Peek();
            if (C == ',') { ++P; continue; }
            if (C == '}') { ++P; return true; }
            return false;
        }
    }

private:
    const char* P;
    const char* End;

    char Peek() const { return P < End ? *P : '\0'; }
    void SkipWs()
    {
        while (P < End && (*P == ' ' || *P == '\t' || *P == '\n' || *P == '\r'))
        {
            ++P;
        }
    }
    bool Consume(char C)
    {
        if (P < End && *P == C) { ++P; return true; }
        return false;
    }

    bool ParseValue(PrologValue& Out)
    {
        SkipWs();
        const char C = Peek();
        switch (C)
        {
        case '"':
            Out.Type = PrologValueType::Atom;
            return ParseString(Out.Text);
        case '[':
            return ParseArray(Out);
        case '{':
            return ParseCompound(Out);
        case 'n': // null -> unbound variable
            if (Match("null")) { Out.Type = PrologValueType::Null; return true; }
            return false;
        case 't': // defensive: never emitted by the ABI, map to atoms
            if (Match("true")) { Out.Type = PrologValueType::Atom; Out.Text = "true"; return true; }
            return false;
        case 'f':
            if (Match("false")) { Out.Type = PrologValueType::Atom; Out.Text = "false"; return true; }
            return false;
        default:
            if (C == '-' || (C >= '0' && C <= '9'))
            {
                return ParseNumber(Out);
            }
            return false;
        }
    }

    bool Match(const char* Lit)
    {
        const char* Q = P;
        while (*Lit)
        {
            if (Q >= End || *Q != *Lit) return false;
            ++Q; ++Lit;
        }
        P = Q;
        return true;
    }

    bool ParseArray(PrologValue& Out)
    {
        Out.Type = PrologValueType::List;
        if (!Consume('[')) return false;
        SkipWs();
        if (Peek() == ']') { ++P; return true; } // empty list
        for (;;)
        {
            PrologValue Elem;
            if (!ParseValue(Elem)) return false;
            Out.Elements.push_back(std::move(Elem));
            SkipWs();
            const char C = Peek();
            if (C == ',') { ++P; continue; }
            if (C == ']') { ++P; return true; }
            return false;
        }
    }

    bool ParseCompound(PrologValue& Out)
    {
        Out.Type = PrologValueType::Compound;
        if (!Consume('{')) return false;
        for (;;)
        {
            SkipWs();
            std::string Key;
            if (!ParseString(Key)) return false;
            SkipWs();
            if (!Consume(':')) return false;
            if (Key == "functor")
            {
                SkipWs();
                if (!ParseString(Out.Text)) return false;
            }
            else if (Key == "args")
            {
                PrologValue Args;
                if (!ParseArray(Args)) return false;
                Out.Elements = std::move(Args.Elements);
            }
            else
            {
                // Unknown key — skip its value to stay robust.
                PrologValue Ignored;
                if (!ParseValue(Ignored)) return false;
            }
            SkipWs();
            const char C = Peek();
            if (C == ',') { ++P; continue; }
            if (C == '}') { ++P; return true; }
            return false;
        }
    }

    bool ParseNumber(PrologValue& Out)
    {
        const char* Start = P;
        bool IsFloat = false;
        if (Peek() == '-') ++P;
        while (P < End)
        {
            const char C = *P;
            if (C >= '0' && C <= '9') { ++P; }
            else if (C == '.' || C == 'e' || C == 'E') { IsFloat = true; ++P; }
            else if (C == '+' || C == '-') { ++P; } // exponent sign
            else break;
        }
        const std::string Tok(Start, P);
        if (IsFloat)
        {
            Out.Type = PrologValueType::Float;
            Out.Float = std::strtod(Tok.c_str(), nullptr);
        }
        else
        {
            Out.Type = PrologValueType::Int;
            Out.Int = std::strtoll(Tok.c_str(), nullptr, 10);
        }
        return true;
    }

    static void AppendUtf8(std::string& Out, unsigned Cp)
    {
        if (Cp <= 0x7F)
        {
            Out.push_back(static_cast<char>(Cp));
        }
        else if (Cp <= 0x7FF)
        {
            Out.push_back(static_cast<char>(0xC0 | (Cp >> 6)));
            Out.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
        }
        else if (Cp <= 0xFFFF)
        {
            Out.push_back(static_cast<char>(0xE0 | (Cp >> 12)));
            Out.push_back(static_cast<char>(0x80 | ((Cp >> 6) & 0x3F)));
            Out.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
        }
        else
        {
            Out.push_back(static_cast<char>(0xF0 | (Cp >> 18)));
            Out.push_back(static_cast<char>(0x80 | ((Cp >> 12) & 0x3F)));
            Out.push_back(static_cast<char>(0x80 | ((Cp >> 6) & 0x3F)));
            Out.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
        }
    }

    bool ParseHex4(unsigned& OutCp)
    {
        if (End - P < 4) return false;
        unsigned Cp = 0;
        for (int i = 0; i < 4; ++i)
        {
            const char H = *P++;
            Cp <<= 4;
            if (H >= '0' && H <= '9') Cp |= static_cast<unsigned>(H - '0');
            else if (H >= 'a' && H <= 'f') Cp |= static_cast<unsigned>(H - 'a' + 10);
            else if (H >= 'A' && H <= 'F') Cp |= static_cast<unsigned>(H - 'A' + 10);
            else return false;
        }
        OutCp = Cp;
        return true;
    }

    bool ParseString(std::string& Out)
    {
        Out.clear();
        if (!Consume('"')) return false;
        while (P < End)
        {
            const char C = *P++;
            if (C == '"') return true;
            if (C != '\\') { Out.push_back(C); continue; }
            if (P >= End) return false;
            const char E = *P++;
            switch (E)
            {
            case '"': Out.push_back('"'); break;
            case '\\': Out.push_back('\\'); break;
            case '/': Out.push_back('/'); break;
            case 'b': Out.push_back('\b'); break;
            case 'f': Out.push_back('\f'); break;
            case 'n': Out.push_back('\n'); break;
            case 'r': Out.push_back('\r'); break;
            case 't': Out.push_back('\t'); break;
            case 'u':
            {
                unsigned Cp = 0;
                if (!ParseHex4(Cp)) return false;
                // Combine a UTF-16 surrogate pair if a low surrogate follows.
                if (Cp >= 0xD800 && Cp <= 0xDBFF && End - P >= 6 && P[0] == '\\' && P[1] == 'u')
                {
                    const char* Save = P;
                    P += 2;
                    unsigned Low = 0;
                    if (ParseHex4(Low) && Low >= 0xDC00 && Low <= 0xDFFF)
                    {
                        Cp = 0x10000 + ((Cp - 0xD800) << 10) + (Low - 0xDC00);
                    }
                    else
                    {
                        P = Save; // not a valid low surrogate — leave it
                    }
                }
                AppendUtf8(Out, Cp);
                break;
            }
            default:
                Out.push_back(E);
                break;
            }
        }
        return false; // unterminated string
    }
};

} // namespace

// ---------------------------------------------------------------------------
// PrologQuery
// ---------------------------------------------------------------------------
PrologQuery::~PrologQuery()
{
    Stop();
}

PrologQuery::PrologQuery(PrologQuery&& Other) noexcept
    : Handle(Other.Handle)
{
    Other.Handle = nullptr;
}

PrologQuery& PrologQuery::operator=(PrologQuery&& Other) noexcept
{
    if (this != &Other)
    {
        Stop();
        Handle = Other.Handle;
        Other.Handle = nullptr;
    }
    return *this;
}

void PrologQuery::Stop()
{
    if (Handle)
    {
        insimul_query_stop(Handle);
        Handle = nullptr;
    }
}

bool PrologQuery::Next(PrologBinding& OutBinding)
{
    OutBinding.Vars.clear();
    if (!Handle) return false;
    const char* Json = insimul_query_next(Handle);
    if (!Json) return false;
    JsonParser Parser(Json);
    if (!Parser.ParseBinding(OutBinding))
    {
        OutBinding.Vars.clear();
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// InsimulKB
// ---------------------------------------------------------------------------
InsimulKB::InsimulKB()
    : Handle(insimul_kb_create())
{
}

InsimulKB::~InsimulKB()
{
    if (Handle)
    {
        insimul_kb_destroy(Handle);
        Handle = nullptr;
    }
}

InsimulKB::InsimulKB(InsimulKB&& Other) noexcept
    : Handle(Other.Handle)
{
    Other.Handle = nullptr;
}

InsimulKB& InsimulKB::operator=(InsimulKB&& Other) noexcept
{
    if (this != &Other)
    {
        if (Handle) insimul_kb_destroy(Handle);
        Handle = Other.Handle;
        Other.Handle = nullptr;
    }
    return *this;
}

bool InsimulKB::Consult(const std::string& Source)
{
    if (!Handle) return false;
    return insimul_kb_consult(Handle, Source.c_str()) == 0;
}

bool InsimulKB::Assert(const std::string& Fact)
{
    if (!Handle) return false;
    return insimul_kb_assert(Handle, Fact.c_str()) == 0;
}

InsimulKB::RetractResult InsimulKB::Retract(const std::string& Fact)
{
    if (!Handle) return RetractResult::Error;
    const int Rc = insimul_kb_retract(Handle, Fact.c_str());
    if (Rc == 0) return RetractResult::Removed;
    if (Rc == 1) return RetractResult::NoMatch;
    return RetractResult::Error;
}

PrologQuery InsimulKB::StartQuery(const std::string& Goal)
{
    if (!Handle) return PrologQuery(nullptr);
    return PrologQuery(insimul_query_start(Handle, Goal.c_str()));
}

bool InsimulKB::QueryAll(const std::string& Goal, std::vector<PrologBinding>& OutSolutions)
{
    OutSolutions.clear();
    PrologQuery Query = StartQuery(Goal);
    if (!Query.IsValid()) return false;
    PrologBinding Binding;
    while (Query.Next(Binding))
    {
        OutSolutions.push_back(std::move(Binding));
        Binding = PrologBinding();
    }
    return true;
}

bool InsimulKB::QueryFirst(const std::string& Goal, PrologBinding& OutBinding)
{
    PrologQuery Query = StartQuery(Goal);
    if (!Query.IsValid()) return false;
    return Query.Next(OutBinding);
}

bool InsimulKB::Snapshot(std::string& OutImage)
{
    if (!Handle) return false;
    const char* Image = insimul_kb_snapshot(Handle);
    if (!Image) return false;
    OutImage.assign(Image);
    return true;
}

bool InsimulKB::Restore(const std::string& Image)
{
    if (!Handle) return false;
    return insimul_kb_restore(Handle, Image.c_str()) == 0;
}

std::string InsimulKB::LastError() const
{
    if (!Handle) return "insimul: knowledge base not created";
    const char* Err = insimul_last_error(Handle);
    return Err ? std::string(Err) : std::string();
}

std::string InsimulKB::Version()
{
    const char* V = insimul_version();
    return V ? std::string(V) : std::string();
}

} // namespace insimul
