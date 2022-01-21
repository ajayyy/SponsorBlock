import { ActionType, Category, CategoryActionType, SponsorTime } from "../types";

export function getSkippingText(segments: SponsorTime[], autoSkip: boolean): string {
    const categoryName = chrome.i18n.getMessage(segments.length > 1 ? "multipleSegments" 
        : "category_" + segments[0].category + "_short") || chrome.i18n.getMessage("category_" + segments[0].category);
    if (autoSkip) {
        let messageId = "";
        if (getCategoryActionType(segments[0].category) === CategoryActionType.Skippable) {
            switch (segments[0].actionType) {
                case ActionType.Skip:
                    messageId = "skipped";
                    break;
                case ActionType.Mute:
                    messageId = "muted";
                    break;
            }
        } else {
            messageId = "skipped_to_category";
        }
        
        return chrome.i18n.getMessage(messageId).replace("{0}", categoryName);
    } else {
        let messageId = "";
        if (getCategoryActionType(segments[0].category) === CategoryActionType.Skippable) {
            switch (segments[0].actionType) {
                case ActionType.Skip:
                    messageId = "skip_category";
                    break;
                case ActionType.Mute:
                    messageId = "mute_category";
                    break;
            }
        } else {
            messageId = "skip_to_category";
        }

        return chrome.i18n.getMessage(messageId).replace("{0}", categoryName);
    }
}

export function getCategoryActionType(category: Category): CategoryActionType {
    if (category.startsWith("poi_")) {
        return CategoryActionType.POI;
    } else {
        return CategoryActionType.Skippable;
    }
}

export function getCategorySuffix(category: Category): string {
    if (category.startsWith("poi_")) {
        return "_POI";
    } else if (category === "exclusive_access") {
        return "_full";
    } else {
        return "";
    }
}