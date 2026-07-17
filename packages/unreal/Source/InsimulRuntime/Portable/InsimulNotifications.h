// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulNotifications — the host-testable, portable transient-notification
// (toast) queue (US-XU2). The Unreal mirror of the engine-neutral notifications
// contract (packages/core/src/ui/notifications.ts; the Godot leg is
// addons/insimul/ui/insimul_notifications.gd).
//
// A pure, timing-driven queue: callers Push() a notification with a kind
// (info/success/warning/danger, each mapped to a shared theme token color) and an
// optional lifetime; Tick(delta) ages them out. UI-free so the logic is testable
// headless — the UMG toast Control renders Visible().
//
// This is the "+ notifications" half of US-XU2: the quest journal's push-based
// events (FInsimulQuestJournalModel) drive toasts with NO polling — a listener
// Push()es a toast on accept/complete/radiant-arrival, and the toast Control ages
// them via Tick() on its own timer. The host tests wire a Notifications instance
// to a quest model's event surface to prove the integration end-to-end.
//
// std-only (no Unreal Engine, no CoreMinimal.h).

#pragma once

#include <string>
#include <vector>

namespace insimul {

enum class ENotificationKind { Info, Success, Warning, Danger };

/** Default seconds a notification stays visible before Tick() expires it. */
constexpr double DEFAULT_NOTIFICATION_LIFETIME = 4.0;

/** Kind -> shared theme token color name (see conformance/ui/theme-tokens.json). */
std::string NotificationKindColor(ENotificationKind Kind);

struct FNotificationItem {
	int Id = 0;
	std::string Text;
	ENotificationKind Kind = ENotificationKind::Info;
	double Remaining = 0.0;
	std::string Color;
};

class FInsimulNotifications {
public:
	/** Enqueue a notification. Returns its id (so a caller can Dismiss it early). */
	int Push(const std::string& Text, ENotificationKind Kind = ENotificationKind::Info,
		double Lifetime = DEFAULT_NOTIFICATION_LIFETIME);

	/**
	 * Age every notification by `Delta` seconds, dropping expired ones. Returns
	 * true if the visible set changed (so a view knows to repaint).
	 */
	bool Tick(double Delta);

	/** Dismiss a notification by id early. Returns true if one was removed. */
	bool Dismiss(int Id);

	/** Currently visible notifications (oldest first). */
	const std::vector<FNotificationItem>& Visible() const { return Items; }

	int Count() const { return static_cast<int>(Items.size()); }

	void Clear() { Items.clear(); }

private:
	std::vector<FNotificationItem> Items;
	int NextId = 1;
};

} // namespace insimul
