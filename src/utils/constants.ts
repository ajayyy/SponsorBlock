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
        case "selfpromo":
            return [{
                icon: "icons/money.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/campaign.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline3`)
            }, {
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
        case "exclusive_access":
            return [{
                icon: "icons/money.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }];
        case "interaction":
            return [{
                icon: "icons/lightbulb.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/lightbulb.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline3`)
            }, {
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
        case "intro":
            return [{
                icon: "icons/check-smaller.svg",
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
        case "outro":
            return [{
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
        case "preview":
            return [{
                icon: "icons/check-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/check-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline3`)
            }, {
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
        case "filler":
            return [{
                icon: "icons/stopwatch.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/stopwatch.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline3`)
            }, {
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
        case "music_offtopic":
            return [{
                icon: "icons/music-note.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/music-note.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
        case "poi_highlight":
            return [{
                icon: "icons/star.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/bolt.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/bolt.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline3`)
            }];
        case "chapter":
            return [{
                icon: "icons/close-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline1`)
            }, {
                icon: "icons/check-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline2`)
            }, {
                icon: "icons/check-smaller.svg",
                text: chrome.i18n.getMessage(`category_${category}_guideline3`)
            }];
        default:
            return [{
                icon: "icons/segway.png",
                text: chrome.i18n.getMessage(`generic_guideline1`)
            }, {
                icon: "icons/right-arrow.svg",
                text: chrome.i18n.getMessage(`generic_guideline2`)
            }];
    }
}