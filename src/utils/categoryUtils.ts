import { ActionType, Category, SponsorTime } from "../types";

export function getSkippingText(segments: SponsorTime[], autoSkip: boolean): string {
    const categoryName = chrome.i18n.getMessage(segments.length > 1 ? "multipleSegments" 
        : "category_" + segments[0].category + "_short") || chrome.i18n.getMessage("category_" + segments[0].category);
    if (autoSkip) {
        let messageId = "";
        switch (segments[0].actionType) {
            case ActionType.Skip:
                messageId = "skipped";
                break;
            case ActionType.Mute:
                messageId = "muted";
                break;
            case ActionType.Poi:
                messageId = "skipped_to_category";
                break;
        }
            
        return chrome.i18n.getMessage(messageId).replace("{0}", categoryName);
    } else {
        let messageId = "";
        switch (segments[0].actionType) {
            case ActionType.Skip:
                messageId = "skip_category";
                break;
            case ActionType.Mute:
                messageId = "mute_category";
                break;
            case ActionType.Poi:
                messageId = "skip_to_category";
                break;
        }

        return chrome.i18n.getMessage(messageId).replace("{0}", categoryName);
    }
}

export function getCategorySuffix(category: Category): string {
    if (category.startsWith("poi_")) {
        return "_POI";
    } else if (category === "exclusive_access") {
        return "_full";
    } else if (category === "chapter") {
        return "_chapter";
    } else {
        return "";
    }
}

export function shortCategoryName(categoryName: string): string {
    return chrome.i18n.getMessage("category_" + categoryName + "_short") || chrome.i18n.getMessage("category_" + categoryName);
}

export const DEFAULT_CATEGORY = "chooseACategory";