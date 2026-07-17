// main.cpp — host-compiler smoke check for the generated C++ DTOs.
//
// A full Unreal Engine build isn't available in this harness, so we prove the
// generated header is syntactically valid C++17 and links its from_json/to_json
// against the vendored nlohmann::json single header with `clang++ -fsyntax-only`
// (see tools/codegen/verify-cpp/run.mjs, `npm run codegen:verify-cpp`).
//
// Instantiating each top-level DTO forces the compiler through the struct bodies
// and their generated (de)serializers, catching any malformed member/helper.

#include "InsimulGenerated.h"

using namespace Insimul::Generated;

int main() {
    // Force instantiation of every top-level DTO the schemas cover.
    SaveFile saveFile{};
    SaveFileEnvelope envelope{};
    WorldIr worldIr{};
    InsimulSchemas bundle{};

    // Exercise the generated serializers so from_json/to_json are compiled too.
    nlohmann::json j;
    to_json(j, saveFile);
    to_json(j, envelope);
    to_json(j, worldIr);
    to_json(j, bundle);

    (void)saveFile;
    (void)envelope;
    (void)worldIr;
    (void)bundle;
    return 0;
}
