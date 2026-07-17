// Copyright 2024 Insimul. All Rights Reserved.
//
// FInsimulNotifications implementation — see InsimulNotifications.h.

#include "InsimulNotifications.h"

namespace insimul {

std::string NotificationKindColor(ENotificationKind Kind) {
	switch (Kind) {
		case ENotificationKind::Info:
			return "accent";
		case ENotificationKind::Success:
			return "success";
		case ENotificationKind::Warning:
			return "warning";
		case ENotificationKind::Danger:
			return "danger";
	}
	return "accent";
}

int FInsimulNotifications::Push(const std::string& Text, ENotificationKind Kind, double Lifetime) {
	const int Id = NextId++;
	FNotificationItem Item;
	Item.Id = Id;
	Item.Text = Text;
	Item.Kind = Kind;
	Item.Remaining = Lifetime;
	Item.Color = NotificationKindColor(Kind);
	Items.push_back(std::move(Item));
	return Id;
}

bool FInsimulNotifications::Tick(double Delta) {
	if (Items.empty()) {
		return false;
	}
	const std::size_t Before = Items.size();
	std::vector<FNotificationItem> Kept;
	Kept.reserve(Items.size());
	for (FNotificationItem& Item : Items) {
		Item.Remaining -= Delta;
		if (Item.Remaining > 0.0) {
			Kept.push_back(std::move(Item));
		}
	}
	Items = std::move(Kept);
	return Items.size() != Before;
}

bool FInsimulNotifications::Dismiss(int Id) {
	const std::size_t Before = Items.size();
	for (std::size_t i = 0; i < Items.size(); ++i) {
		if (Items[i].Id == Id) {
			Items.erase(Items.begin() + static_cast<std::ptrdiff_t>(i));
			break;
		}
	}
	return Items.size() != Before;
}

} // namespace insimul
