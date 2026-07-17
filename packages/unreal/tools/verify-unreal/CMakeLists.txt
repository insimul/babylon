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
    "${RUNTIME_DIR}/Portable/InsimulSha256.cpp"
    "${RUNTIME_DIR}/Portable/InsimulCanonicalJson.cpp"
    "${RUNTIME_DIR}/Portable/InsimulSaveSystem.cpp"
)

# Golden fixtures shipped by packages/core (semantics authority).
set(FIXTURE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../core/conformance/saves")
# Committed cross-check artifacts (C++-produced envelope pinned to the TS check).
set(CROSSCHECK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../cross-check")

set(INCLUDE_DIRS
    "${RUNTIME_DIR}/Portable"
    "${RUNTIME_DIR}/Generated"
)

if (MSVC)
    set(WARN_FLAGS /W4)
else()
    set(WARN_FLAGS -Wall -Wextra)
endif()

enable_testing()

# ── World source host tests (US-XC1) ──
add_executable(insimul_verify_unreal
    test_world_source.cpp
    ${PORTABLE_SOURCES}
)
target_include_directories(insimul_verify_unreal PRIVATE ${INCLUDE_DIRS})
target_compile_definitions(insimul_verify_unreal PRIVATE
    INSIMUL_FIXTURE_DIR="${FIXTURE_DIR}"
)
target_compile_options(insimul_verify_unreal PRIVATE ${WARN_FLAGS})
add_test(NAME world_source COMMAND insimul_verify_unreal)

# ── Save system host tests (US-XC2) ──
add_executable(insimul_verify_save
    test_save_system.cpp
    ${PORTABLE_SOURCES}
)
target_include_directories(insimul_verify_save PRIVATE ${INCLUDE_DIRS})
target_compile_definitions(insimul_verify_save PRIVATE
    INSIMUL_FIXTURE_DIR="${FIXTURE_DIR}"
    INSIMUL_CROSSCHECK_DIR="${CROSSCHECK_DIR}"
    INSIMUL_GEN_DIR="${CMAKE_CURRENT_BINARY_DIR}"
)
target_compile_options(insimul_verify_save PRIVATE ${WARN_FLAGS})
add_test(NAME save_system COMMAND insimul_verify_save)
