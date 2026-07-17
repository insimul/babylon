# Insimul Unreal runtime — host-test harness (tools/verify-unreal)
#
# Compiles the PORTABLE (std-only) slice of the InsimulRuntime module — the
# parts that carry cross-runtime semantics — and runs host tests against the
# golden fixtures in packages/core/conformance. UE-coupled files (the UStruct
# boundary layer) are syntax-gated (#if WITH_ENGINE) and intentionally excluded
# here; they are verified by a human Unreal build.
#
#   cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
#
# or just run the built binary directly: ./build/insimul_verify_unreal

cmake_minimum_required(VERSION 3.16)
project(insimul_verify_unreal CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Portable runtime-core sources (must stay UE-free).
set(RUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../Source/InsimulRuntime")
set(PORTABLE_SOURCES
    "${RUNTIME_DIR}/Portable/InsimulJson.cpp"
    "${RUNTIME_DIR}/Portable/InsimulWorldSource.cpp"
)

# Golden fixtures shipped by packages/core (semantics authority).
set(FIXTURE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../core/conformance/saves")

add_executable(insimul_verify_unreal
    test_world_source.cpp
    ${PORTABLE_SOURCES}
)

target_include_directories(insimul_verify_unreal PRIVATE
    "${RUNTIME_DIR}/Portable"
    "${RUNTIME_DIR}/Generated"
)

target_compile_definitions(insimul_verify_unreal PRIVATE
    INSIMUL_FIXTURE_DIR="${FIXTURE_DIR}"
)

if (MSVC)
    target_compile_options(insimul_verify_unreal PRIVATE /W4)
else()
    target_compile_options(insimul_verify_unreal PRIVATE -Wall -Wextra)
endif()

enable_testing()
add_test(NAME world_source COMMAND insimul_verify_unreal)
