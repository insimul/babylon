// -----------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT BY HAND.
//   Regenerate with:  npm run codegen   (from the insimul-runtime root)
//   Source of truth:  packages/core/schemas/{save-file,save-envelope,world-ir}.schema.json
//   Emitter:          tools/codegen/emit-cpp.mjs (quicktype, nlohmann::json, C++17)
//
//   These are PLAIN structs, NOT UE UStructs. The hand-written UStruct mapping
//   layer lives in InsimulTypes.h and converts at the boundary — see README.md.
//   Requires the vendored single header: ../../ThirdParty/nlohmann/json.hpp
// -----------------------------------------------------------------------------
//  To parse this JSON data, first install
//
//      json.hpp  https://github.com/nlohmann/json
//
//  Then include this file, and then do
//
//     InsimulSchemas data = nlohmann::json::parse(jsonString);

#pragma once

#include <optional>
#include "nlohmann/json.hpp"

#ifndef NLOHMANN_OPT_HELPER
#define NLOHMANN_OPT_HELPER
namespace nlohmann {
    template <typename T>
    struct adl_serializer<std::shared_ptr<T>> {
        static void to_json(json & j, const std::shared_ptr<T> & opt) {
            if (!opt) j = nullptr; else j = *opt;
        }

        static std::shared_ptr<T> from_json(const json & j) {
            if (j.is_null()) return std::make_shared<T>(); else return std::make_shared<T>(j.get<T>());
        }
    };
    template <typename T>
    struct adl_serializer<std::optional<T>> {
        static void to_json(json & j, const std::optional<T> & opt) {
            if (!opt) j = nullptr; else j = *opt;
        }

        static std::optional<T> from_json(const json & j) {
            if (j.is_null()) return std::make_optional<T>(); else return std::make_optional<T>(j.get<T>());
        }
    };
}
#endif

namespace Insimul {
namespace Generated {
    using nlohmann::json;

    #ifndef NLOHMANN_UNTYPED_Insimul_Generated_HELPER
    #define NLOHMANN_UNTYPED_Insimul_Generated_HELPER
    inline json get_untyped(const json & j, const char * property) {
        if (j.find(property) != j.end()) {
            return j.at(property).get<json>();
        }
        return json();
    }

    inline json get_untyped(const json & j, std::string property) {
        return get_untyped(j, property.data());
    }
    #endif

    #ifndef NLOHMANN_OPTIONAL_Insimul_Generated_HELPER
    #define NLOHMANN_OPTIONAL_Insimul_Generated_HELPER
    template <typename T>
    inline std::shared_ptr<T> get_heap_optional(const json & j, const char * property) {
        auto it = j.find(property);
        if (it != j.end() && !it->is_null()) {
            return j.at(property).get<std::shared_ptr<T>>();
        }
        return std::shared_ptr<T>();
    }

    template <typename T>
    inline std::shared_ptr<T> get_heap_optional(const json & j, std::string property) {
        return get_heap_optional<T>(j, property.data());
    }
    template <typename T>
    inline std::optional<T> get_stack_optional(const json & j, const char * property) {
        auto it = j.find(property);
        if (it != j.end() && !it->is_null()) {
            return j.at(property).get<std::optional<T>>();
        }
        return std::optional<T>();
    }

    template <typename T>
    inline std::optional<T> get_stack_optional(const json & j, std::string property) {
        return get_stack_optional<T>(j, property.data());
    }
    #endif

    struct CurrentState {
        std::map<std::string, nlohmann::json> extensions;
        std::map<std::string, nlohmann::json> language_progress;
        std::map<std::string, nlohmann::json> npcs;
        std::map<std::string, nlohmann::json> player;
        std::vector<nlohmann::json> prolog_facts;
        std::map<std::string, nlohmann::json> quests;
    };

    enum class Status : int { ABANDONED, ACTIVE, COMPLETED };

    struct World {
        std::string id;
        std::string name;
    };

    struct WorldSnapshot {
        std::optional<std::vector<nlohmann::json>> actions;
        std::optional<std::vector<nlohmann::json>> characters;
        std::optional<std::vector<nlohmann::json>> countries;
        std::optional<std::vector<nlohmann::json>> grammars;
        std::optional<std::vector<nlohmann::json>> lots;
        std::optional<std::vector<nlohmann::json>> quests;
        std::optional<std::vector<nlohmann::json>> rules;
        std::optional<std::vector<nlohmann::json>> settlements;
        World world;
    };

    struct SaveFile {
        std::vector<nlohmann::json> conversations;
        std::string created_at;
        CurrentState current_state;
        std::string id;
        std::string last_saved_at;
        std::string name;
        std::optional<std::vector<nlohmann::json>> previous_snapshots;
        int64_t save_count;
        int64_t slot_index;
        Status status;
        double total_playtime;
        std::string user_id;
        int64_t version;
        std::string world_id;
        WorldSnapshot world_snapshot;
    };

    enum class Format : int { INSIMUL_SAVE_V2 };

    struct SaveFileEnvelope {
        std::string exported_at;
        Format format;
        std::string insimul_version;
        std::string integrity;
        SaveFile save_file;
    };

    struct Meta {
        std::string export_timestamp;
        int64_t export_version;
        std::map<std::string, nlohmann::json> genre_config;
        std::string insimul_version;
        std::string seed;
        std::string world_id;
        std::string world_name;
        std::string world_type;
    };

    struct WorldIr {
        std::map<std::string, nlohmann::json> ai_config;
        std::optional<std::map<std::string, nlohmann::json>> assessment;
        std::map<std::string, nlohmann::json> assets;
        std::map<std::string, nlohmann::json> combat;
        std::map<std::string, nlohmann::json> entities;
        std::map<std::string, nlohmann::json> geography;
        std::optional<std::map<std::string, nlohmann::json>> language_learning;
        Meta meta;
        std::map<std::string, nlohmann::json> player;
        std::optional<std::map<std::string, nlohmann::json>> resources;
        std::optional<std::map<std::string, nlohmann::json>> survival;
        std::map<std::string, nlohmann::json> systems;
        std::map<std::string, nlohmann::json> theme;
        std::map<std::string, nlohmann::json> ui;
    };

    struct InsimulSchemas {
        SaveFile save_file;
        SaveFileEnvelope save_file_envelope;
        WorldIr world_ir;
    };
}
}

namespace Insimul {
namespace Generated {
    void from_json(const json & j, CurrentState & x);
    void to_json(json & j, const CurrentState & x);

    void from_json(const json & j, World & x);
    void to_json(json & j, const World & x);

    void from_json(const json & j, WorldSnapshot & x);
    void to_json(json & j, const WorldSnapshot & x);

    void from_json(const json & j, SaveFile & x);
    void to_json(json & j, const SaveFile & x);

    void from_json(const json & j, SaveFileEnvelope & x);
    void to_json(json & j, const SaveFileEnvelope & x);

    void from_json(const json & j, Meta & x);
    void to_json(json & j, const Meta & x);

    void from_json(const json & j, WorldIr & x);
    void to_json(json & j, const WorldIr & x);

    void from_json(const json & j, InsimulSchemas & x);
    void to_json(json & j, const InsimulSchemas & x);

    void from_json(const json & j, Status & x);
    void to_json(json & j, const Status & x);

    void from_json(const json & j, Format & x);
    void to_json(json & j, const Format & x);

    inline void from_json(const json & j, CurrentState& x) {
        x.extensions = j.at("extensions").get<std::map<std::string, nlohmann::json>>();
        x.language_progress = j.at("languageProgress").get<std::map<std::string, nlohmann::json>>();
        x.npcs = j.at("npcs").get<std::map<std::string, nlohmann::json>>();
        x.player = j.at("player").get<std::map<std::string, nlohmann::json>>();
        x.prolog_facts = j.at("prologFacts").get<std::vector<nlohmann::json>>();
        x.quests = j.at("quests").get<std::map<std::string, nlohmann::json>>();
    }

    inline void to_json(json & j, const CurrentState & x) {
        j = json::object();
        j["extensions"] = x.extensions;
        j["languageProgress"] = x.language_progress;
        j["npcs"] = x.npcs;
        j["player"] = x.player;
        j["prologFacts"] = x.prolog_facts;
        j["quests"] = x.quests;
    }

    inline void from_json(const json & j, World& x) {
        x.id = j.at("id").get<std::string>();
        x.name = j.at("name").get<std::string>();
    }

    inline void to_json(json & j, const World & x) {
        j = json::object();
        j["id"] = x.id;
        j["name"] = x.name;
    }

    inline void from_json(const json & j, WorldSnapshot& x) {
        x.actions = get_stack_optional<std::vector<nlohmann::json>>(j, "actions");
        x.characters = get_stack_optional<std::vector<nlohmann::json>>(j, "characters");
        x.countries = get_stack_optional<std::vector<nlohmann::json>>(j, "countries");
        x.grammars = get_stack_optional<std::vector<nlohmann::json>>(j, "grammars");
        x.lots = get_stack_optional<std::vector<nlohmann::json>>(j, "lots");
        x.quests = get_stack_optional<std::vector<nlohmann::json>>(j, "quests");
        x.rules = get_stack_optional<std::vector<nlohmann::json>>(j, "rules");
        x.settlements = get_stack_optional<std::vector<nlohmann::json>>(j, "settlements");
        x.world = j.at("world").get<World>();
    }

    inline void to_json(json & j, const WorldSnapshot & x) {
        j = json::object();
        j["actions"] = x.actions;
        j["characters"] = x.characters;
        j["countries"] = x.countries;
        j["grammars"] = x.grammars;
        j["lots"] = x.lots;
        j["quests"] = x.quests;
        j["rules"] = x.rules;
        j["settlements"] = x.settlements;
        j["world"] = x.world;
    }

    inline void from_json(const json & j, SaveFile& x) {
        x.conversations = j.at("conversations").get<std::vector<nlohmann::json>>();
        x.created_at = j.at("createdAt").get<std::string>();
        x.current_state = j.at("currentState").get<CurrentState>();
        x.id = j.at("id").get<std::string>();
        x.last_saved_at = j.at("lastSavedAt").get<std::string>();
        x.name = j.at("name").get<std::string>();
        x.previous_snapshots = get_stack_optional<std::vector<nlohmann::json>>(j, "previousSnapshots");
        x.save_count = j.at("saveCount").get<int64_t>();
        x.slot_index = j.at("slotIndex").get<int64_t>();
        x.status = j.at("status").get<Status>();
        x.total_playtime = j.at("totalPlaytime").get<double>();
        x.user_id = j.at("userId").get<std::string>();
        x.version = j.at("version").get<int64_t>();
        x.world_id = j.at("worldId").get<std::string>();
        x.world_snapshot = j.at("worldSnapshot").get<WorldSnapshot>();
    }

    inline void to_json(json & j, const SaveFile & x) {
        j = json::object();
        j["conversations"] = x.conversations;
        j["createdAt"] = x.created_at;
        j["currentState"] = x.current_state;
        j["id"] = x.id;
        j["lastSavedAt"] = x.last_saved_at;
        j["name"] = x.name;
        j["previousSnapshots"] = x.previous_snapshots;
        j["saveCount"] = x.save_count;
        j["slotIndex"] = x.slot_index;
        j["status"] = x.status;
        j["totalPlaytime"] = x.total_playtime;
        j["userId"] = x.user_id;
        j["version"] = x.version;
        j["worldId"] = x.world_id;
        j["worldSnapshot"] = x.world_snapshot;
    }

    inline void from_json(const json & j, SaveFileEnvelope& x) {
        x.exported_at = j.at("exportedAt").get<std::string>();
        x.format = j.at("format").get<Format>();
        x.insimul_version = j.at("insimulVersion").get<std::string>();
        x.integrity = j.at("integrity").get<std::string>();
        x.save_file = j.at("saveFile").get<SaveFile>();
    }

    inline void to_json(json & j, const SaveFileEnvelope & x) {
        j = json::object();
        j["exportedAt"] = x.exported_at;
        j["format"] = x.format;
        j["insimulVersion"] = x.insimul_version;
        j["integrity"] = x.integrity;
        j["saveFile"] = x.save_file;
    }

    inline void from_json(const json & j, Meta& x) {
        x.export_timestamp = j.at("exportTimestamp").get<std::string>();
        x.export_version = j.at("exportVersion").get<int64_t>();
        x.genre_config = j.at("genreConfig").get<std::map<std::string, nlohmann::json>>();
        x.insimul_version = j.at("insimulVersion").get<std::string>();
        x.seed = j.at("seed").get<std::string>();
        x.world_id = j.at("worldId").get<std::string>();
        x.world_name = j.at("worldName").get<std::string>();
        x.world_type = j.at("worldType").get<std::string>();
    }

    inline void to_json(json & j, const Meta & x) {
        j = json::object();
        j["exportTimestamp"] = x.export_timestamp;
        j["exportVersion"] = x.export_version;
        j["genreConfig"] = x.genre_config;
        j["insimulVersion"] = x.insimul_version;
        j["seed"] = x.seed;
        j["worldId"] = x.world_id;
        j["worldName"] = x.world_name;
        j["worldType"] = x.world_type;
    }

    inline void from_json(const json & j, WorldIr& x) {
        x.ai_config = j.at("aiConfig").get<std::map<std::string, nlohmann::json>>();
        x.assessment = get_stack_optional<std::map<std::string, nlohmann::json>>(j, "assessment");
        x.assets = j.at("assets").get<std::map<std::string, nlohmann::json>>();
        x.combat = j.at("combat").get<std::map<std::string, nlohmann::json>>();
        x.entities = j.at("entities").get<std::map<std::string, nlohmann::json>>();
        x.geography = j.at("geography").get<std::map<std::string, nlohmann::json>>();
        x.language_learning = get_stack_optional<std::map<std::string, nlohmann::json>>(j, "languageLearning");
        x.meta = j.at("meta").get<Meta>();
        x.player = j.at("player").get<std::map<std::string, nlohmann::json>>();
        x.resources = get_stack_optional<std::map<std::string, nlohmann::json>>(j, "resources");
        x.survival = get_stack_optional<std::map<std::string, nlohmann::json>>(j, "survival");
        x.systems = j.at("systems").get<std::map<std::string, nlohmann::json>>();
        x.theme = j.at("theme").get<std::map<std::string, nlohmann::json>>();
        x.ui = j.at("ui").get<std::map<std::string, nlohmann::json>>();
    }

    inline void to_json(json & j, const WorldIr & x) {
        j = json::object();
        j["aiConfig"] = x.ai_config;
        j["assessment"] = x.assessment;
        j["assets"] = x.assets;
        j["combat"] = x.combat;
        j["entities"] = x.entities;
        j["geography"] = x.geography;
        j["languageLearning"] = x.language_learning;
        j["meta"] = x.meta;
        j["player"] = x.player;
        j["resources"] = x.resources;
        j["survival"] = x.survival;
        j["systems"] = x.systems;
        j["theme"] = x.theme;
        j["ui"] = x.ui;
    }

    inline void from_json(const json & j, InsimulSchemas& x) {
        x.save_file = j.at("saveFile").get<SaveFile>();
        x.save_file_envelope = j.at("saveFileEnvelope").get<SaveFileEnvelope>();
        x.world_ir = j.at("worldIR").get<WorldIr>();
    }

    inline void to_json(json & j, const InsimulSchemas & x) {
        j = json::object();
        j["saveFile"] = x.save_file;
        j["saveFileEnvelope"] = x.save_file_envelope;
        j["worldIR"] = x.world_ir;
    }

    inline void from_json(const json & j, Status & x) {
        if (j == "abandoned") x = Status::ABANDONED;
        else if (j == "active") x = Status::ACTIVE;
        else if (j == "completed") x = Status::COMPLETED;
        else { throw std::runtime_error("Cannot deserialize to enumeration \"Status\""); }
    }

    inline void to_json(json & j, const Status & x) {
        switch (x) {
            case Status::ABANDONED: j = "abandoned"; break;
            case Status::ACTIVE: j = "active"; break;
            case Status::COMPLETED: j = "completed"; break;
            default: throw std::runtime_error("Unexpected value in enumeration \"Status\": " + std::to_string(static_cast<int>(x)));
        }
    }

    inline void from_json(const json & j, Format & x) {
        if (j == "insimul-save-v2") x = Format::INSIMUL_SAVE_V2;
        else { throw std::runtime_error("Cannot deserialize to enumeration \"Format\""); }
    }

    inline void to_json(json & j, const Format & x) {
        switch (x) {
            case Format::INSIMUL_SAVE_V2: j = "insimul-save-v2"; break;
            default: throw std::runtime_error("Unexpected value in enumeration \"Format\": " + std::to_string(static_cast<int>(x)));
        }
    }
}
}
