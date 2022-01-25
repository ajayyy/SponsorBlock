import Config from "./config";
import { showDonationLink } from "./utils/configUtils";

import Utils from "./utils";
const utils = new Utils();

window.addEventListener('DOMContentLoaded', init);

async function init() {
    utils.localizeHtmlPage();

    await utils.wait(() => Config.config !== null);

    if (!Config.config.darkMode) {
        document.documentElement.setAttribute("data-theme", "light");
    }

    if (!showDonationLink()) {
        document.getElementById("sbDonate").style.display = "none";
    }
}