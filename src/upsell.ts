import Config from "./config";
import { checkLicenseKey } from "./utils/licenseKey";
import { localizeHtmlPage } from "./utils/pageUtils";

import * as countries from "../public/res/countries.json";
import Utils from "./utils";
import { Category, CategorySkipOption } from "./types";

// This is needed, if Config is not imported before Utils, things break.
// Probably due to cyclic dependencies
Config.config;

const utils = new Utils();

window.addEventListener('DOMContentLoaded', init);

async function init() {
    localizeHtmlPage();

    const cantAfford = document.getElementById("cantAfford");
    const cantAffordTexts = chrome.i18n.getMessage("cantAfford").split(/{|}/);
    cantAfford.appendChild(document.createTextNode(cantAffordTexts[0]));
    const discountButton = document.createElement("span");
    discountButton.id = "discountButton";
    discountButton.innerText = cantAffordTexts[1];
    cantAfford.appendChild(discountButton);
    cantAfford.appendChild(document.createTextNode(cantAffordTexts[2]));

    const redeemButton = document.getElementById("redeemButton") as HTMLInputElement;
    const redeemInput = document.getElementById("redeemCodeInput") as HTMLInputElement;
    redeemButton.addEventListener("click", async () => {
        const licenseKey = redeemInput.value;

        if (await checkLicenseKey(licenseKey)) {
            Config.config.payments.licenseKey = licenseKey;
            Config.forceSyncUpdate("payments");

            if (!utils.getCategorySelection("chapter")) {
                Config.config.categorySelections.push({
                    name: "chapter" as Category,
                    option: CategorySkipOption.ShowOverlay
                });
            }

            alert(chrome.i18n.getMessage("redeemSuccess"));
        } else {
            alert(chrome.i18n.getMessage("redeemFailed"));
        }
    });

    discountButton.addEventListener("click", async () => {
        const subsidizedSection = document.getElementById("subsidizedPrice");
        subsidizedSection.classList.remove("hidden");

        const oldSelector = document.getElementById("countrySelector");
        if (oldSelector) oldSelector.remove();
        const countrySelector = document.createElement("select");
        countrySelector.id = "countrySelector";
        countrySelector.className = "optionsSelector";
        const defaultOption = document.createElement("option");
        defaultOption.innerText = chrome.i18n.getMessage("chooseACountry");
        countrySelector.appendChild(defaultOption);

        for (const country of Object.keys(countries)) {
            const option = document.createElement("option");
            option.value = country;
            option.innerText = country;
            countrySelector.appendChild(option);
        }

        countrySelector.addEventListener("change", () => {
            if (countries[countrySelector.value]?.allowed) {
                document.getElementById("subsidizedLink").classList.remove("hidden");
                document.getElementById("noSubsidizedLink").classList.add("hidden");
            } else {
                document.getElementById("subsidizedLink").classList.add("hidden");
                document.getElementById("noSubsidizedLink").classList.remove("hidden");
            }
        });

        subsidizedSection.appendChild(countrySelector);
    });
}