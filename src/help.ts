import { showDonationLink } from "./utils/configUtils";

window.addEventListener('DOMContentLoaded', init);

async function init() {
    if (!showDonationLink()) {
        document.getElementById("sbDonate").style.display = "none";
    }
}