// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulUITheme — the UE seam over the shared design-token set (US-XU1). A
// UDataAsset exposing the tokens from packages/core/conformance/ui/theme-tokens.json
// (mirrored UE-free in Portable/InsimulUIThemeTokens.h) as FLinearColor / int, so
// every default-UI widget reads ONE theme. The default asset ships the shared
// values; a creator re-skins by editing them (a value that diverges from a token
// in theme-tokens.json is a parity bug — keep the two in lockstep).
//
// Referenced from UInsimulSettings alongside the panel registry. This is a thin,
// syntax-gated boundary; the token VALUES are the source of truth in the portable
// core, and the host test proves the two agree.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "InsimulUITheme.generated.h"

/**
 * The shared UI theme. Field names mirror theme-tokens.json token names; the
 * defaults below are the shared values (a creator may re-skin them).
 */
UCLASS(BlueprintType)
class INSIMULRUNTIME_API UInsimulUITheme : public UDataAsset
{
	GENERATED_BODY()

public:
	// ── Colors (mirror theme-tokens.json → colors) ───────────────────────────
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Background = FLinearColor::FromSRGBColor(FColor(0x12, 0x14, 0x1c));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Surface = FLinearColor::FromSRGBColor(FColor(0x1b, 0x1e, 0x2a));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor SurfaceAlt = FLinearColor::FromSRGBColor(FColor(0x24, 0x28, 0x38));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Overlay = FLinearColor::FromSRGBColor(FColor(0x0a, 0x0b, 0x10, 0xcc));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Border = FLinearColor::FromSRGBColor(FColor(0x33, 0x3a, 0x52));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor TextPrimary = FLinearColor::FromSRGBColor(FColor(0xee, 0xf1, 0xf8));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor TextSecondary = FLinearColor::FromSRGBColor(FColor(0x9a, 0xa3, 0xbd));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor TextDisabled = FLinearColor::FromSRGBColor(FColor(0x5a, 0x60, 0x76));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Accent = FLinearColor::FromSRGBColor(FColor(0x5b, 0x8c, 0xff));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor AccentHover = FLinearColor::FromSRGBColor(FColor(0x7a, 0xa2, 0xff));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor AccentPressed = FLinearColor::FromSRGBColor(FColor(0x3f, 0x6f, 0xe0));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Success = FLinearColor::FromSRGBColor(FColor(0x4e, 0xcb, 0x8d));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Warning = FLinearColor::FromSRGBColor(FColor(0xe6, 0xb3, 0x4d));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Danger = FLinearColor::FromSRGBColor(FColor(0xe0, 0x5a, 0x6a));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Colors")
	FLinearColor Quest = FLinearColor::FromSRGBColor(FColor(0xc9, 0xa2, 0x4b));

	// ── Spacing (px, mirror theme-tokens.json → spacing) ─────────────────────
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Spacing")
	int32 SpacingXS = 4;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Spacing")
	int32 SpacingSM = 8;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Spacing")
	int32 SpacingMD = 12;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Spacing")
	int32 SpacingLG = 16;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Spacing")
	int32 SpacingXL = 24;

	// ── Corner radii (px) ────────────────────────────────────────────────────
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Radius")
	int32 RadiusSM = 4;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Radius")
	int32 RadiusMD = 8;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Radius")
	int32 RadiusLG = 12;

	// ── Font sizes (px) ──────────────────────────────────────────────────────
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Font")
	int32 FontCaption = 12;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Font")
	int32 FontBody = 16;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Font")
	int32 FontTitle = 22;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Theme|Font")
	int32 FontDisplay = 32;
};
