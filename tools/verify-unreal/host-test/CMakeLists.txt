# Host-side unit tests for the plain C++ InsimulKB wrapper (US-XP1).
#
# Compiles packages/unreal/.../Prolog/InsimulKB.cpp against a locally built
# libinsimul and runs the wrapper unit tests — no Unreal SDK involved (the
# wrapper is deliberately UE-free). This is how the marshalling / JSON-binding
# layer is proven on the host clang toolchain.
#
# Inputs (any one path form works):
#   -DINSIMUL_NATIVE_ROOT=/path/to/insimul-native   (auto-finds build/libinsimul.a)
#   -DINSIMUL_LIB=/path/to/libinsimul.a  -DINSIMUL_INCLUDE_DIR=/path/to/include
# The runner script (../run-host-tests.sh) fills these in automatically.
cmake_minimum_required(VERSION 3.16)
project(insimul_unreal_host_test CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Repo root = three levels up from this file (tools/verify-unreal/host-test).
get_filename_component(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
set(WRAPPER_DIR "${REPO_ROOT}/packages/unreal/Source/InsimulRuntime/Private/Prolog")

# --- Public ABI header ------------------------------------------------------
if(NOT DEFINED INSIMUL_INCLUDE_DIR)
  # Default to the committed ThirdParty copy of insimul.h.
  set(INSIMUL_INCLUDE_DIR "${REPO_ROOT}/packages/unreal/Source/ThirdParty/InsimulLibrary/include")
endif()
if(NOT EXISTS "${INSIMUL_INCLUDE_DIR}/insimul.h")
  message(FATAL_ERROR "insimul.h not found under INSIMUL_INCLUDE_DIR=${INSIMUL_INCLUDE_DIR}")
endif()

# --- libinsimul (prefer the static archive to avoid runtime rpath) ----------
if(NOT DEFINED INSIMUL_LIB)
  if(NOT DEFINED INSIMUL_NATIVE_ROOT)
    message(FATAL_ERROR "Pass -DINSIMUL_LIB=/path/to/libinsimul.a or -DINSIMUL_NATIVE_ROOT=/path/to/insimul-native")
  endif()
  set(CMAKE_FIND_LIBRARY_SUFFIXES ".a") # static first — no dylib rpath needed
  find_library(INSIMUL_LIB NAMES insimul PATHS "${INSIMUL_NATIVE_ROOT}/build" NO_DEFAULT_PATH)
  if(NOT INSIMUL_LIB)
    message(FATAL_ERROR "libinsimul.a not found under ${INSIMUL_NATIVE_ROOT}/build — build it first (cmake --build build --target insimul)")
  endif()
endif()

add_executable(insimul_kb_tests
  test_insimul_kb.cpp
  "${WRAPPER_DIR}/InsimulKB.cpp")

target_include_directories(insimul_kb_tests PRIVATE
  "${WRAPPER_DIR}"
  "${INSIMUL_INCLUDE_DIR}")

target_link_libraries(insimul_kb_tests PRIVATE "${INSIMUL_LIB}")

# libinsimul.a embeds Trealla, which needs libm + pthread (see the native
# CMakeLists INTERFACE deps).
find_package(Threads REQUIRED)
target_link_libraries(insimul_kb_tests PRIVATE Threads::Threads)
if(NOT WIN32)
  target_link_libraries(insimul_kb_tests PRIVATE m)
endif()

enable_testing()
add_test(NAME insimul_kb COMMAND insimul_kb_tests)
