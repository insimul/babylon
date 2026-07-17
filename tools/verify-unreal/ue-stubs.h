// ue-stubs.h — Unreal Engine reflection-macro no-op stubs (US-EP3).
//
// STATUS: artifact for a FUTURE full-compile gate, NOT consumed by the current
// structural gate. In this harness the Unreal Build Tool and the engine headers
// (CoreMinimal.h, Engine/*, GameFramework/*, …) are unavailable, so
// `clang++ -fsyntax-only` on an Insimul translation unit cannot succeed: every
// `#include "CoreMinimal.h"` is a fatal missing-header error and clean code could
// never pass. tools/verify-unreal/check.mjs therefore runs a STRUCTURAL scan
// instead (see tools/README.md).
//
// When a real UE SDK IS present, a gross-breakage syntax pass becomes possible by
// force-including this file so the UnrealHeaderTool reflection macros expand to
// nothing:
//
//   clang++ -std=c++17 -fsyntax-only -ferror-limit=0 \
//           -include tools/verify-unreal/ue-stubs.h \
//           -I "$UE_ROOT/Engine/Source/Runtime/Core/Public" ... \
//           packages/unreal/Source/InsimulRuntime/Private/*.cpp
//
// It intentionally catches gross breakage only (balanced braces, macro misuse),
// never the semantic errors a genuine UBT build would.
#pragma once

// Class / struct / interface / enum reflection markers — swallow their args.
#define UCLASS(...)
#define USTRUCT(...)
#define UINTERFACE(...)
#define UENUM(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define UPARAM(...)
#define UDELEGATE(...)
#define UMETA(...)

// Body-injection macros expand to nothing (no generated members in a stub build).
#define GENERATED_BODY(...)
#define GENERATED_UCLASS_BODY(...)
#define GENERATED_USTRUCT_BODY(...)
#define GENERATED_IINTERFACE_BODY(...)

// Module / export decorations.
#define UE_DEPRECATED(Version, Message)
#define DECLARE_LOG_CATEGORY_EXTERN(...)
#define DEFINE_LOG_CATEGORY(...)
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE(...)
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(...)
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(...)
#define IMPLEMENT_MODULE(...)

// Common macro-ish helpers used in bodies (keep args so parens stay balanced).
#ifndef TEXT
#define TEXT(x) x
#endif
#ifndef INVTEXT
#define INVTEXT(x) x
#endif
