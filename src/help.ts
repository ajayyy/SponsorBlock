import { localizeHtmlPage } from "../maze-utils/src/setup";
import Config from "./config";
import { showDonationLink } from "./utils/configUtils";

import { waitFor } from "../maze-utils/src";
import { isDeArrowInstalled } from "./utils/crossExtension";

if (document.readyState === "complete") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}

// DeArrow promotion
waitFor(() => Config.isReady()).then(() => {
    if (Config.config.showNewFeaturePopups && Config.config.showUpsells) {
        isDeArrowInstalled().then((installed) => {
            if (!installed) {
                const deArrowPromotion = document.getElementById("dearrow-link");
                deArrowPromotion.classList.remove("hidden");

                deArrowPromotion.addEventListener("click", () => Config.config.showDeArrowPromotion = false);

                const text = deArrowPromotion.querySelector("#dearrow-link-text");
                text.textContent = `${chrome.i18n.getMessage("DeArrowPromotionMessage2").split("?")[0]}? ${chrome.i18n.getMessage("DeArrowPromotionMessage3")}`;

                const closeButton = deArrowPromotion.querySelector(".close-button");
                closeButton.addEventListener("click", (e) => {
                    e.preventDefault();

                    deArrowPromotion.classList.add("hidden");
                    Config.config.showDeArrowPromotion = false;
                    Config.config.showDeArrowInSettings = false;
                });
            }
        });
    }
});

async function init() {
    localizeHtmlPage();

    await waitFor(() => Config.config !== null);

    if (!Config.config.darkMode) {
        document.documentElement.setAttribute("data-theme", "light");
    }

    if (!showDonationLink()) {
        document.getElementById("donate-component").style.display = "none";
    }
}