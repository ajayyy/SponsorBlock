import { TextBox } from "../render/GenericNotice";
import { Category } from "../types";

export function getGuidelineInfo(category: Category): TextBox[] {
    switch (category) {
        case "sponsor":
            return [{
                icon: "icons/money.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
    }
}