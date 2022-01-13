import Config from "./config";
import { showDonationLink } from "./utils/configUtils";

import Utils from "./utils";
const utils = new Utils();

window.addEventListener('DOMContentLoaded', init);

async function init() {
    utils.localizeHtmlPage();

    //switch to light mode when requested, except for Chrome on Linux or older Windows/Mac versions, where Chrome doesn't support themes
    if (window.matchMedia("(prefers-color-scheme: light)")?.matches &&
            !(navigator.vendor == "Google Inc." && (navigator.userAgent.includes("Linux") ||
                                                    navigator.userAgent.includes("Windows NT 6") ||
                                                    navigator.userAgent.includes("Mac OS X") && navigator.userAgent.match(/Mac OS X [^)]+/)[0] < "Mac OS X 10_14") &&
            !navigator.userAgent.includes("OPR/") && !navigator.userAgent.includes("Edg/")))
        document.documentElement.setAttribute("data-theme", "light");

    await utils.wait(() => Config.config !== null);

    if (!showDonationLink()) {
        document.getElementById("sbDonate").style.display = "none";
    }
}