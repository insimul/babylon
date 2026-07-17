// conformance_runner.cpp — the golden Prolog conformance harness for the plain
// C++ InsimulKB wrapper (US-XP2).
//
// Loads every JSON corpus file from packages/core/conformance/prolog (env
// INSIMUL_CONFORMANCE_DIR overrides the compile-time default), and for each
// { name, kb, query, expected } case:
//   - creates a fresh InsimulKB (isolation between cases),
//   - consults the kb clauses/directives through the wrapper,
//   - runs the query and collects every solution's PrologBinding, and
//   - compares the produced solution set against `expected` as an UNORDERED
//     MULTISET (the order-insensitivity rule documented in conformance/README.md
//     and enforced by the Unity C# and native C runners) — numbers normalized so
//     1 == 1.0.
//
// This is the host mirror of the native ABI's tests/conformance.c and the Unity
// tools/verify-unity Program.cs corpus pass, but driven through the marshalling
// layer the C++ wrapper adds (binding-set JSON -> PrologValue), so it catches
// wrapper bugs the native lib cannot. Per-case table output mirrors
// libinsimul's conformance.c ([PASS]/[FAIL]/[AMEND]/[SKIP] rows).
//
// Radiant conformance is SKIPPED with a tracked TODO: libinsimul exposes no
// radiant tick (insimul.h has no insimul_radiant_*), so there is no way to drive
// the radiant corpus through InsimulKB yet — same posture as the Unity runner.

#include "InsimulKB.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <vector>

using insimul::InsimulKB;
using insimul::PrologBinding;
using insimul::PrologValue;
using insimul::PrologValueType;

namespace fs = std::filesystem;

// ------------------------------------------------------------------ //
// Minimal JSON value model + recursive-descent parser. Used only to read the
// corpus files; the ABI's solution JSON is already parsed by the wrapper.
// ------------------------------------------------------------------ //

struct JVal
{
    enum Type { Null, Bool, Num, Str, Arr, Obj } t = Null;
    bool b = false;
    double num = 0.0;
    std::string str;
    std::vector<JVal> items;       // Arr elements / Obj values
    std::vector<std::string> keys; // Obj keys (parallel to items)
};

namespace
{
struct JParser
{
    const char* p;
    bool err = false;
};

void jskip(JParser& j)
{
    while (*j.p == ' ' || *j.p == '\t' || *j.p == '\n' || *j.p == '\r') ++j.p;
}

JVal jparseValue(JParser& j);

// Parse a string body (cursor just past the opening quote), decoding escapes.
std::string jparseStrRaw(JParser& j)
{
    std::string out;
    const char* p = j.p;
    while (*p && *p != '"')
    {
        char c = *p++;
        if (c == '\\')
        {
            char e = *p++;
            switch (e)
            {
            case '"':  c = '"';  break;
            case '\\': c = '\\'; break;
            case '/':  c = '/';  break;
            case 'b':  c = '\b'; break;
            case 'f':  c = '\f'; break;
            case 'n':  c = '\n'; break;
            case 'r':  c = '\r'; break;
            case 't':  c = '\t'; break;
            case 'u':
            {
                unsigned code = 0;
                for (int k = 0; k < 4 && *p; ++k)
                {
                    char h = *p++;
                    code <<= 4;
                    if (h >= '0' && h <= '9') code |= (unsigned)(h - '0');
                    else if (h >= 'a' && h <= 'f') code |= (unsigned)(h - 'a' + 10);
                    else if (h >= 'A' && h <= 'F') code |= (unsigned)(h - 'A' + 10);
                }
                if (code < 0x80) { c = (char)code; }
                else if (code < 0x800)
                {
                    out.push_back((char)(0xC0 | (code >> 6)));
                    out.push_back((char)(0x80 | (code & 0x3F)));
                    continue;
                }
                else
                {
                    out.push_back((char)(0xE0 | (code >> 12)));
                    out.push_back((char)(0x80 | ((code >> 6) & 0x3F)));
                    out.push_back((char)(0x80 | (code & 0x3F)));
                    continue;
                }
                break;
            }
            default: c = e; break;
            }
        }
        out.push_back(c);
    }
    if (*p == '"') ++p; else j.err = true;
    j.p = p;
    return out;
}

JVal jparseString(JParser& j)
{
    ++j.p; // opening quote
    JVal v; v.t = JVal::Str; v.str = jparseStrRaw(j);
    return v;
}

JVal jparseNumber(JParser& j)
{
    char* end = nullptr;
    double d = std::strtod(j.p, &end);
    if (end == j.p) { j.err = true; return JVal{}; }
    j.p = end;
    JVal v; v.t = JVal::Num; v.num = d;
    return v;
}

JVal jparseArray(JParser& j)
{
    ++j.p; // [
    JVal v; v.t = JVal::Arr;
    jskip(j);
    if (*j.p == ']') { ++j.p; return v; }
    for (;;)
    {
        jskip(j);
        v.items.push_back(jparseValue(j));
        if (j.err) return v;
        jskip(j);
        if (*j.p == ',') { ++j.p; continue; }
        if (*j.p == ']') { ++j.p; break; }
        j.err = true; break;
    }
    return v;
}

JVal jparseObject(JParser& j)
{
    ++j.p; // {
    JVal v; v.t = JVal::Obj;
    jskip(j);
    if (*j.p == '}') { ++j.p; return v; }
    for (;;)
    {
        jskip(j);
        if (*j.p != '"') { j.err = true; break; }
        ++j.p;
        std::string key = jparseStrRaw(j);
        jskip(j);
        if (*j.p != ':') { j.err = true; break; }
        ++j.p;
        jskip(j);
        JVal val = jparseValue(j);
        if (j.err) break;
        v.keys.push_back(std::move(key));
        v.items.push_back(std::move(val));
        jskip(j);
        if (*j.p == ',') { ++j.p; continue; }
        if (*j.p == '}') { ++j.p; break; }
        j.err = true; break;
    }
    return v;
}

JVal jparseValue(JParser& j)
{
    jskip(j);
    switch (*j.p)
    {
    case '"': return jparseString(j);
    case '[': return jparseArray(j);
    case '{': return jparseObject(j);
    case 't': if (!std::strncmp(j.p, "true", 4))  { j.p += 4; JVal v; v.t = JVal::Bool; v.b = true;  return v; } break;
    case 'f': if (!std::strncmp(j.p, "false", 5)) { j.p += 5; JVal v; v.t = JVal::Bool; v.b = false; return v; } break;
    case 'n': if (!std::strncmp(j.p, "null", 4))  { j.p += 4; return JVal{}; } break;
    default: break;
    }
    if (*j.p == '-' || (*j.p >= '0' && *j.p <= '9')) return jparseNumber(j);
    j.err = true;
    return JVal{};
}

JVal jparse(const std::string& text, bool& err)
{
    JParser j{ text.c_str(), false };
    JVal v = jparseValue(j);
    jskip(j);
    err = j.err;
    return v;
}

const JVal* jget(const JVal& o, const char* key)
{
    if (o.t != JVal::Obj) return nullptr;
    for (std::size_t i = 0; i < o.keys.size(); ++i)
        if (o.keys[i] == key) return &o.items[i];
    return nullptr;
}

// ------------------------------------------------------------------ //
// Documented corpus amendment (mirrors conformance.c).
//
// The corpus is authored against tau-prolog; where Trealla (which libinsimul
// embeds) diverges AND tau-prolog is the ISO-correct one, we apply an explicit,
// printed substring amendment rather than silently skip. The one live amendment:
// `log/1` collides with Trealla's static builtin arithmetic functor log/1, so
// `asserta(log(0))` raises permission_error(modify, static_procedure, log/1).
// The asserta-prepends case is about ordering, not the name, so `log` -> `entry`.
// ------------------------------------------------------------------ //

struct Amendment { const char* area; const char* name; const char* from; const char* to; };

const Amendment AMENDMENTS[] = {
    { "assert-retract", "asserta-prepends", "log(", "entry(" },
    { "assert-retract", "asserta-prepends", "log/", "entry/" },
};

const char* amendReason(const std::string& area, const std::string& name)
{
    if (area == "assert-retract" && name == "asserta-prepends")
        return "predicate 'log' collides with Trealla's static builtin arith "
               "functor log/1; renamed to preserve asserta-ordering semantics";
    return "documented amendment (see conformance_runner.cpp)";
}

std::string applyAmendments(const std::string& area, const std::string& name,
                            const std::string& in, bool& applied)
{
    std::string cur = in;
    for (const Amendment& a : AMENDMENTS)
    {
        if (area != a.area || name != a.name) continue;
        std::string from = a.from, to = a.to;
        std::size_t pos = 0;
        while ((pos = cur.find(from, pos)) != std::string::npos)
        {
            cur.replace(pos, from.size(), to);
            pos += to.size();
            applied = true;
        }
    }
    return cur;
}

// ------------------------------------------------------------------ //
// Canonicalization: one string form for a bound value, driven from both the
// JSON (expected) side and the PrologValue (actual) side so a multiset compare
// is a plain string sort. Integral numbers normalize (1 == 1.0).
// ------------------------------------------------------------------ //

std::string canonNumber(double d)
{
    if (std::isfinite(d) && d == std::floor(d) && std::fabs(d) < 9.2e18)
        return "n:" + std::to_string((long long)d);
    char buf[64];
    std::snprintf(buf, sizeof buf, "n:%.17g", d);
    return buf;
}

void jwrite(std::string& out, const JVal& v); // fwd

std::string canonJVal(const JVal& v)
{
    switch (v.t)
    {
    case JVal::Str:  return "s:" + v.str;
    case JVal::Num:  return canonNumber(v.num);
    case JVal::Bool: return v.b ? "b:true" : "b:false";
    case JVal::Null: return "null";
    default: { std::string s = "j:"; jwrite(s, v); return s; }
    }
}

std::string canonProlog(const PrologValue& v)
{
    switch (v.Type)
    {
    case PrologValueType::Atom:  return "s:" + v.Text;
    case PrologValueType::Int:   return "n:" + std::to_string(v.Int);
    case PrologValueType::Float: return canonNumber(v.Float);
    case PrologValueType::Null:  return "null";
    default: return "j:" + v.ToDisplayString(); // List / Compound
    }
}

// Canonical string for one expected solution object: sorted keys.
std::string canonExpected(const JVal& obj)
{
    std::vector<std::size_t> idx(obj.keys.size());
    for (std::size_t i = 0; i < idx.size(); ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(),
              [&](std::size_t a, std::size_t b) { return obj.keys[a] < obj.keys[b]; });
    std::string s = "{";
    for (std::size_t n = 0; n < idx.size(); ++n)
    {
        if (n) s += ",";
        s += obj.keys[idx[n]] + "=" + canonJVal(obj.items[idx[n]]);
    }
    return s + "}";
}

// Canonical string for one produced solution: sorted variable names.
std::string canonActual(const PrologBinding& b)
{
    std::vector<std::size_t> idx(b.Vars.size());
    for (std::size_t i = 0; i < idx.size(); ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(),
              [&](std::size_t a, std::size_t c) { return b.Vars[a].first < b.Vars[c].first; });
    std::string s = "{";
    for (std::size_t n = 0; n < idx.size(); ++n)
    {
        if (n) s += ",";
        s += b.Vars[idx[n]].first + "=" + canonProlog(b.Vars[idx[n]].second);
    }
    return s + "}";
}

// Compact JSON serialization (readable diffs on failure).
void jwrite(std::string& out, const JVal& v)
{
    switch (v.t)
    {
    case JVal::Null: out += "null"; break;
    case JVal::Bool: out += v.b ? "true" : "false"; break;
    case JVal::Num:
        if (std::isfinite(v.num) && v.num == std::floor(v.num) && std::fabs(v.num) < 9.2e18)
            out += std::to_string((long long)v.num);
        else { char buf[64]; std::snprintf(buf, sizeof buf, "%g", v.num); out += buf; }
        break;
    case JVal::Str: out += "\""; out += v.str; out += "\""; break;
    case JVal::Arr:
        out += "[";
        for (std::size_t i = 0; i < v.items.size(); ++i) { if (i) out += ","; jwrite(out, v.items[i]); }
        out += "]";
        break;
    case JVal::Obj:
        out += "{";
        for (std::size_t i = 0; i < v.items.size(); ++i)
        {
            if (i) out += ",";
            out += "\""; out += v.keys[i]; out += "\":";
            jwrite(out, v.items[i]);
        }
        out += "}";
        break;
    }
}

// ------------------------------------------------------------------ //
// Corpus execution.
// ------------------------------------------------------------------ //

int gPass = 0, gFail = 0, gCases = 0, gAmended = 0;

// Compare produced solutions against `expected` as an unordered multiset.
bool solutionsMatch(const JVal& expected, const std::vector<PrologBinding>& actual)
{
    if ((std::size_t)expected.items.size() != actual.size()) return false;
    std::vector<std::string> e, a;
    e.reserve(expected.items.size());
    a.reserve(actual.size());
    for (const JVal& ex : expected.items) e.push_back(canonExpected(ex));
    for (const PrologBinding& ac : actual) a.push_back(canonActual(ac));
    std::sort(e.begin(), e.end());
    std::sort(a.begin(), a.end());
    return e == a;
}

std::string joinKb(const JVal* kb)
{
    std::string src;
    if (!kb || kb->t != JVal::Arr) return src;
    for (const JVal& item : kb->items)
        if (item.t == JVal::Str) { src += item.str; src += "\n"; }
    return src;
}

std::string describeExpected(const JVal& expected)
{
    std::string s = "[";
    for (std::size_t i = 0; i < expected.items.size(); ++i)
    {
        if (i) s += ", ";
        s += canonExpected(expected.items[i]);
    }
    return s + "]";
}

std::string describeActual(const std::vector<PrologBinding>& actual)
{
    std::string s = "[";
    for (std::size_t i = 0; i < actual.size(); ++i)
    {
        if (i) s += ", ";
        s += canonActual(actual[i]);
    }
    return s + "]";
}

// Run one case, print one table row. Returns true on pass.
bool runCase(const std::string& area, const JVal& c)
{
    ++gCases;
    const JVal* jname  = jget(c, "name");
    const JVal* kb     = jget(c, "kb");
    const JVal* jquery = jget(c, "query");
    const JVal* exp    = jget(c, "expected");
    std::string name = (jname && jname->t == JVal::Str) ? jname->str : "?";

    if (!jquery || jquery->t != JVal::Str || !exp || exp->t != JVal::Arr)
    {
        std::printf("  [FAIL] %s / %s - malformed case (missing query/expected)\n",
                    area.c_str(), name.c_str());
        ++gFail;
        return false;
    }

    bool amended = false;
    std::string src   = applyAmendments(area, name, joinKb(kb), amended);
    std::string query = applyAmendments(area, name, jquery->str, amended);
    if (amended)
    {
        std::printf("  [AMEND] %s / %s - %s\n", area.c_str(), name.c_str(),
                    amendReason(area, name));
        ++gAmended;
    }

    InsimulKB kb2;
    if (!kb2.IsValid())
    {
        std::printf("  [FAIL] %s / %s - InsimulKB failed to construct\n",
                    area.c_str(), name.c_str());
        ++gFail;
        return false;
    }

    bool ok = true;
    std::string why;
    if (!src.empty())
    {
        if (!kb2.Consult(src)) { ok = false; why = kb2.LastError(); }
    }

    std::vector<PrologBinding> actual;
    if (ok)
    {
        if (!kb2.QueryAll(query, actual))
        {
            // A false return with a set LastError is a start error; empty error
            // just means zero solutions (which QueryAll reports as true anyway).
            if (!kb2.LastError().empty()) { ok = false; why = kb2.LastError(); }
        }
    }

    bool match = ok && solutionsMatch(*exp, actual);
    if (match)
    {
        std::printf("  [PASS] %s / %s\n", area.c_str(), name.c_str());
        ++gPass;
    }
    else
    {
        std::printf("  [FAIL] %s / %s\n", area.c_str(), name.c_str());
        if (!ok && !why.empty()) std::printf("         query error: %s\n", why.c_str());
        std::printf("         query:    %s\n", query.c_str());
        std::printf("         expected: %s\n", describeExpected(*exp).c_str());
        std::printf("         actual:   %s\n", describeActual(actual).c_str());
        ++gFail;
    }
    return match;
}

// Load + run every case in one corpus file. Returns false on a hard read/parse
// error (never a silent skip).
bool runFile(const fs::path& path)
{
    FILE* f = std::fopen(path.string().c_str(), "rb");
    if (!f) { std::fprintf(stderr, "conformance: cannot open %s\n", path.string().c_str()); return false; }
    std::fseek(f, 0, SEEK_END);
    long sz = std::ftell(f);
    std::fseek(f, 0, SEEK_SET);
    std::string text((std::size_t)sz, '\0');
    std::size_t rd = std::fread(&text[0], 1, (std::size_t)sz, f);
    std::fclose(f);
    if (rd != (std::size_t)sz) { std::fprintf(stderr, "conformance: read error %s\n", path.string().c_str()); return false; }

    bool perr = false;
    JVal root = jparse(text, perr);
    if (perr || root.t != JVal::Obj)
    {
        std::fprintf(stderr, "conformance: JSON parse error in %s\n", path.string().c_str());
        return false;
    }

    const JVal* jarea  = jget(root, "area");
    const JVal* jcases = jget(root, "cases");
    std::string area = (jarea && jarea->t == JVal::Str) ? jarea->str : path.filename().string();
    if (!jcases || jcases->t != JVal::Arr || jcases->items.empty())
    {
        std::fprintf(stderr, "conformance: %s has no cases\n", path.string().c_str());
        return false;
    }

    std::printf("== %s (%s) ==\n", path.filename().string().c_str(), area.c_str());
    for (const JVal& c : jcases->items) runCase(area, c);
    return true;
}

std::string corpusRoot()
{
    if (const char* env = std::getenv("INSIMUL_CONFORMANCE_DIR"))
        if (*env) return env;
#ifdef INSIMUL_CONFORMANCE_DEFAULT_DIR
    return INSIMUL_CONFORMANCE_DEFAULT_DIR;
#else
    return "packages/core/conformance";
#endif
}
} // namespace

int main()
{
    std::string root = corpusRoot();
    fs::path prologDir = fs::path(root) / "prolog";
    if (!fs::is_directory(prologDir))
    {
        std::fprintf(stderr,
            "conformance: prolog corpus not found at %s\n"
            "  set INSIMUL_CONFORMANCE_DIR to the conformance root.\n",
            prologDir.string().c_str());
        return 2;
    }

    // Keepalive KB: Trealla's pl_destroy tears down the process-global symbol
    // table when the last KB closes (g_tpl_count -> 0), and a subsequent create
    // deadlocks/traps. Holding ONE KB open for the whole run keeps the count > 0
    // so the per-case create/destroy below is safe. (Mirrors the `keepalive` KB
    // in the native tests/conformance.c; documented in insimul-native/CLAUDE.md.)
    InsimulKB keepalive;
    if (!keepalive.IsValid())
    {
        std::fprintf(stderr, "conformance: could not create the keepalive KB.\n");
        return 2;
    }

    std::printf("== InsimulKB conformance corpus: %s ==\n", root.c_str());
    std::printf("   libinsimul %s\n", InsimulKB::Version().c_str());

    // Sort files for stable ordering.
    std::vector<fs::path> files;
    for (const auto& e : fs::directory_iterator(prologDir))
        if (e.is_regular_file() && e.path().extension() == ".json") files.push_back(e.path());
    std::sort(files.begin(), files.end());

    if (files.empty())
    {
        std::fprintf(stderr, "conformance: no *.json corpus files in %s\n", prologDir.string().c_str());
        return 2;
    }

    bool fileErr = false;
    for (const fs::path& p : files) if (!runFile(p)) fileErr = true;

    // Radiant: SKIPPED — libinsimul exposes no radiant tick yet (insimul.h has no
    // insimul_radiant_*), so radiant cases cannot run through InsimulKB. Same
    // posture as the Unity runner; a tracked TODO for the libinsimul radiant story.
    fs::path radiantDir = fs::path(root) / "radiant";
    int radiantFiles = 0;
    if (fs::is_directory(radiantDir))
        for (const auto& e : fs::directory_iterator(radiantDir))
            if (e.is_regular_file() && e.path().extension() == ".json") ++radiantFiles;
    std::printf("  [SKIP] radiant (%d file(s)) - libinsimul exposes no radiant tick yet "
                "(insimul.h); TODO: libinsimul radiant story.\n", radiantFiles);

    std::printf("\n%d passed, %d failed, %d amended (%d case(s), %d file(s))\n",
                gPass, gFail, gAmended, gCases, (int)files.size());

    if (fileErr) { std::printf("conformance: FAIL (corpus file read/parse error)\n"); return 2; }
    if (gFail)   { std::printf("conformance: FAIL\n"); return 1; }
    std::printf("conformance: PASS\n");
    return 0;
}
