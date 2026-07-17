// JsonVal — a small mutable JSON value model + CanonicalJson serializer.
//
// The C# twin of the Unreal FJsonValue / InsimulCanonicalJson pair
// (packages/unreal/Source/InsimulRuntime/Portable) and the semantics authority
// canonicalJSONStringify / computeSaveFileIntegrity in save-envelope.ts.
//
// Why not System.Text.Json.Nodes? We need (a) a MUTABLE tree the migration
// steps can augment in place and (b) byte-for-byte control over the canonical
// output (key ordering, number formatting, string escaping) that matches
// `JSON.stringify(sortDeep(value))` exactly, so the SHA-256 integrity hash is
// portable across the TS / Unreal / Unity runtimes. System.Text.Json is used
// ONLY to bootstrap-parse the incoming JSON into this model.
//
// UnityEngine-FREE (System.* only) — host-tests under tools/verify-unity.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Insimul.Save
{
    public enum JsonKind { Null, Bool, Number, String, Array, Object }

    /// <summary>A mutable JSON value. Objects preserve insertion order (canonical
    /// serialization re-sorts keys); numbers retain their raw lexeme as a
    /// formatting fallback.</summary>
    public sealed class JsonVal
    {
        public JsonKind Kind { get; private set; }
        public bool BoolValue { get; private set; }
        public double Number { get; private set; }
        public string RawNumber { get; private set; }
        public string Str { get; private set; }

        private readonly List<JsonVal> _items;
        private readonly List<KeyValuePair<string, JsonVal>> _members;

        private JsonVal(JsonKind kind)
        {
            Kind = kind;
            if (kind == JsonKind.Array) _items = new List<JsonVal>();
            if (kind == JsonKind.Object) _members = new List<KeyValuePair<string, JsonVal>>();
        }

        // ── Factories ───────────────────────────────────────────────────────

        public static JsonVal Null() => new JsonVal(JsonKind.Null);
        public static JsonVal Bool(bool b) => new JsonVal(JsonKind.Bool) { BoolValue = b };
        public static JsonVal Str(string s) => new JsonVal(JsonKind.String) { Str = s ?? string.Empty };
        public static JsonVal Object() => new JsonVal(JsonKind.Object);
        public static JsonVal Arr() => new JsonVal(JsonKind.Array);

        public static JsonVal Int(long n) => new JsonVal(JsonKind.Number)
        {
            Number = n,
            RawNumber = n.ToString(CultureInfo.InvariantCulture),
        };

        public static JsonVal Num(double n) => new JsonVal(JsonKind.Number)
        {
            Number = n,
            RawNumber = null,
        };

        // ── Collections ─────────────────────────────────────────────────────

        public IReadOnlyList<JsonVal> Items => _items ?? (IReadOnlyList<JsonVal>)Array.Empty<JsonVal>();

        public IReadOnlyList<KeyValuePair<string, JsonVal>> Members =>
            _members ?? (IReadOnlyList<KeyValuePair<string, JsonVal>>)Array.Empty<KeyValuePair<string, JsonVal>>();

        public void Add(JsonVal item)
        {
            if (Kind != JsonKind.Array) throw new InvalidOperationException("Add on a non-array JsonVal");
            _items.Add(item ?? Null());
        }

        /// <summary>Set (insert or overwrite) an object member, preserving first-seen order.</summary>
        public void Set(string key, JsonVal value)
        {
            if (Kind != JsonKind.Object) throw new InvalidOperationException("Set on a non-object JsonVal");
            for (int i = 0; i < _members.Count; i++)
            {
                if (string.Equals(_members[i].Key, key, StringComparison.Ordinal))
                {
                    _members[i] = new KeyValuePair<string, JsonVal>(key, value ?? Null());
                    return;
                }
            }
            _members.Add(new KeyValuePair<string, JsonVal>(key, value ?? Null()));
        }

        public bool TryGet(string key, out JsonVal value)
        {
            value = null;
            if (Kind != JsonKind.Object) return false;
            foreach (var m in _members)
            {
                if (string.Equals(m.Key, key, StringComparison.Ordinal))
                {
                    value = m.Value;
                    return true;
                }
            }
            return false;
        }

        /// <summary>Best-effort string projection (atoms come back unquoted; numbers stringified).</summary>
        public string AsString()
        {
            switch (Kind)
            {
                case JsonKind.String: return Str;
                case JsonKind.Number: return CanonicalJson.CanonicalNumber(Number, RawNumber);
                case JsonKind.Bool: return BoolValue ? "true" : "false";
                default: return string.Empty;
            }
        }

        // ── Parse (System.Text.Json bootstrap) ──────────────────────────────

        public static JsonVal Parse(string json)
        {
            using var doc = JsonDocument.Parse(json);
            return FromElement(doc.RootElement);
        }

        private static JsonVal FromElement(JsonElement el)
        {
            switch (el.ValueKind)
            {
                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    return Null();
                case JsonValueKind.True:
                    return Bool(true);
                case JsonValueKind.False:
                    return Bool(false);
                case JsonValueKind.String:
                    return Str(el.GetString());
                case JsonValueKind.Number:
                {
                    var n = new JsonVal(JsonKind.Number)
                    {
                        RawNumber = el.GetRawText(),
                        Number = el.GetDouble(),
                    };
                    return n;
                }
                case JsonValueKind.Array:
                {
                    var arr = Arr();
                    foreach (var item in el.EnumerateArray())
                        arr.Add(FromElement(item));
                    return arr;
                }
                case JsonValueKind.Object:
                {
                    var obj = Object();
                    foreach (var prop in el.EnumerateObject())
                        obj.Set(prop.Name, FromElement(prop.Value));
                    return obj;
                }
                default:
                    return Null();
            }
        }
    }

    /// <summary>
    /// Canonical JSON serializer — the C# twin of canonicalJSONStringify in
    /// save-envelope.ts. Produces a byte-for-byte match with
    /// <c>JSON.stringify(sortDeep(value))</c>: object keys sorted ordinal at
    /// every depth, arrays keep order, minified, numbers rendered as ECMAScript
    /// ToString(Number), strings escaped exactly as JSON.stringify does (and
    /// <c>/</c> is NOT escaped). The SHA-256 of this output is the portable
    /// integrity hash.
    /// </summary>
    public static class CanonicalJson
    {
        public static string Stringify(JsonVal value)
        {
            var sb = new StringBuilder();
            Emit(value, sb);
            return sb.ToString();
        }

        /// <summary>SHA-256 hex of the canonical serialization of <paramref name="value"/>.</summary>
        public static string Integrity(JsonVal value)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(Stringify(value));
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(bytes);
            var sb = new StringBuilder(hash.Length * 2);
            foreach (byte b in hash) sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
            return sb.ToString();
        }

        private static void Emit(JsonVal value, StringBuilder sb)
        {
            if (value == null) { sb.Append("null"); return; }
            switch (value.Kind)
            {
                case JsonKind.Null:
                    sb.Append("null");
                    break;
                case JsonKind.Bool:
                    sb.Append(value.BoolValue ? "true" : "false");
                    break;
                case JsonKind.Number:
                    sb.Append(CanonicalNumber(value.Number, value.RawNumber));
                    break;
                case JsonKind.String:
                    EmitString(value.Str, sb);
                    break;
                case JsonKind.Array:
                {
                    sb.Append('[');
                    var items = value.Items;
                    for (int i = 0; i < items.Count; i++)
                    {
                        if (i != 0) sb.Append(',');
                        Emit(items[i], sb);
                    }
                    sb.Append(']');
                    break;
                }
                case JsonKind.Object:
                {
                    // Sort keys ascending by ordinal (matches JS default sort for
                    // the ASCII keys save files use). Stable so ties keep order.
                    var members = value.Members;
                    var order = new int[members.Count];
                    for (int i = 0; i < order.Length; i++) order[i] = i;
                    Array.Sort(order, (a, b) =>
                    {
                        int c = string.CompareOrdinal(members[a].Key, members[b].Key);
                        return c != 0 ? c : a.CompareTo(b);
                    });
                    sb.Append('{');
                    bool first = true;
                    foreach (int idx in order)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        EmitString(members[idx].Key, sb);
                        sb.Append(':');
                        Emit(members[idx].Value, sb);
                    }
                    sb.Append('}');
                    break;
                }
            }
        }

        /// <summary>Format a number as ECMAScript ToString(Number) / JSON.stringify would.</summary>
        public static string CanonicalNumber(double value, string raw)
        {
            // Non-finite values are not representable in JSON; JS emits `null`.
            if (double.IsNaN(value) || double.IsInfinity(value)) return "null";

            // Integral fast path. Covers every integer save files carry (ids,
            // counts, ms timestamps ~1.7e12). Cap below the int64 range.
            if (value == Math.Floor(value) && Math.Abs(value) < 9.0e18)
                return ((long)value).ToString(CultureInfo.InvariantCulture);

            // Non-integral (or huge): shortest round-tripping representation —
            // matches ECMAScript's shortest-representation rule for the simple
            // decimals save files use (0.6, 2.5, ...).
            for (int precision = 1; precision <= 17; precision++)
            {
                string candidate = value.ToString("G" + precision.ToString(CultureInfo.InvariantCulture),
                    CultureInfo.InvariantCulture);
                if (double.TryParse(candidate, NumberStyles.Float, CultureInfo.InvariantCulture, out double back)
                    && back == value)
                {
                    return NormalizeExponent(candidate);
                }
            }
            return string.IsNullOrEmpty(raw) ? "0" : raw;
        }

        // C#'s "G" format uses an uppercase 'E' with a sign and >=2 exponent
        // digits ("1E+21"); ECMAScript uses lowercase 'e' ("1e+21"). Save files
        // never reach the exponent path, but normalize defensively.
        private static string NormalizeExponent(string s)
        {
            int e = s.IndexOf('E');
            if (e < 0) return s;
            return s.Substring(0, e) + "e" + s.Substring(e + 1);
        }

        /// <summary>Escape a string exactly as JSON.stringify would (quotes included).</summary>
        public static void EmitString(string value, StringBuilder sb)
        {
            const string hex = "0123456789abcdef";
            sb.Append('"');
            foreach (char c in value ?? string.Empty)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            sb.Append("\\u00");
                            sb.Append(hex[(c >> 4) & 0xF]);
                            sb.Append(hex[c & 0xF]);
                        }
                        else
                        {
                            // Printable ASCII and non-ASCII pass through; UTF-8
                            // encoding of the assembled string matches JSON.stringify.
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
