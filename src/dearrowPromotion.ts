import { waitFor } from "../maze-utils/src";
import { getYouTubeTitleNode } from "../maze-utils/src/elements";
import { getHash } from "../maze-utils/src/hash";
import { getVideoID, isOnInvidious, isOnMobileYouTube } from "../maze-utils/src/video";
import Config from "./config";
import { Tooltip } from "./render/Tooltip";
import { isDeArrowInstalled } from "./utils/crossExtension";
import { isVisible } from "./utils/pageUtils";
import { asyncRequestToServer } from "./utils/requests";

let tooltip: Tooltip = null;
const showDeArrowPromotion = false;
export async function tryShowingDeArrowPromotion() {
    if (showDeArrowPromotion
            && Config.config.showDeArrowPromotion
            && !isOnMobileYouTube()
            && !isOnInvidious()
            && document.URL.includes("watch")
            && Config.config.showUpsells 
            && Config.config.showNewFeaturePopups
            && (Config.config.skipCount > 30 || !Config.config.trackViewCount)) {

            if (!await isDeArrowInstalled()) {
                try {
                    const element = await waitFor(() => getYouTubeTitleNode(), 5000, 500, (e) => isVisible(e)) as HTMLElement;
                    if (element && element.innerText && badTitle(element.innerText)) {
                        const hashPrefix = (await getHash(getVideoID(), 1)).slice(0, 4);
                        const deArrowData = await asyncRequestToServer("GET", "/api/branding/" + hashPrefix);
                        if (!deArrowData.ok) return;

                        const deArrowDataJson = JSON.parse(deArrowData.responseText);
                        const title = deArrowDataJson?.[getVideoID()]?.titles?.[0];
                        if (title && title.title && (title.locked || title.votes > 0)) {
                            Config.config.showDeArrowPromotion = false;
        
                            tooltip = new Tooltip({
                                text: chrome.i18n.getMessage("DeArrowTitleReplacementSuggestion") + "\n\n" + title.title,
                                linkOnClick: () => {
                                    window.open("https://dearrow.ajay.app");
                                    Config.config.shownDeArrowPromotion = true;
                                },
                                secondButtonText: chrome.i18n.getMessage("hideNewFeatureUpdates"),
                                referenceNode: element,
                                prependElement: element.firstElementChild as HTMLElement,
                                timeout: 15000,
                                positionRealtive: false,
                                containerAbsolute: true,
                                bottomOffset: "inherit",
                                topOffset: "55px",
                                leftOffset: "0",
                                rightOffset: "0",
                                topTriangle: true,
                                center: true,
                                opacity: 1
                            });
                        }
                    }
                } catch { } // eslint-disable-line no-empty
            } else {
                Config.config.showDeArrowPromotion = false;
            }
        }
}

/**
 * Two upper case words (at least 2 letters long)
 */
function badTitle(title: string): boolean {
    return !!title.match(/\p{Lu}{2,} \p{Lu}{2,}[.!? ]/u);
}

export function hideDeArrowPromotion(): void {
    if (tooltip) tooltip.close();
}