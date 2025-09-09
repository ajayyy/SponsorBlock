import * as React from "react";
import { createRoot } from 'react-dom/client';

import Config, { generateDebugDetails } from "./config";
import * as invidiousList from "../ci/invidiouslist.json";

// Make the config public for debugging purposes
window.SB = Config;

import Utils from "./utils";
import CategoryChooser from "./render/CategoryChooser";
import UnsubmittedVideos from "./render/UnsubmittedVideos";
import KeybindComponent from "./components/options/KeybindComponent";
import { showDonationLink } from "./utils/configUtils";
import { localizeHtmlPage } from "../maze-utils/src/setup";
import { StorageChangesObject } from "../maze-utils/src/config";
import { getHash } from "../maze-utils/src/hash";
import { isFirefoxOrSafari } from "../maze-utils/src";
import { isDeArrowInstalled } from "./utils/crossExtension";
import { asyncRequestToServer } from "./utils/requests";
import AdvancedSkipOptions from "./render/AdvancedSkipOptions";
const utils = new Utils();
let embed = false;

const categoryChoosers: CategoryChooser[] = [];
const unsubmittedVideos: UnsubmittedVideos[] = [];

if (document.readyState === "complete") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}

async function init() {
    localizeHtmlPage();

    // selected tab
    if (location.hash != "") {
        const substr = location.hash.slice(1);
        let menuItem = document.querySelector(`[data-for='${substr}']`);
        if (menuItem == null)
            menuItem = document.querySelector(`[data-for='behavior']`);
        menuItem.classList.add("selected");
    } else {
        document.querySelector(`[data-for='behavior']`).classList.add("selected");
    }

    document.getElementById("version").innerText = "v. " + chrome.runtime.getManifest().version;

    // Remove header if needed
    if (window.location.hash === "#embed") {
        embed = true;
        for (const element of document.getElementsByClassName("titleBar")) {
            element.classList.add("hidden");
        }

        document.getElementById("options").classList.add("embed");
        createStickyHeader();
    }

    if (!Config.configSyncListeners.includes(optionsConfigUpdateListener)) {
        Config.configSyncListeners.push(optionsConfigUpdateListener);
    }

    if (!Config.configLocalListeners.includes(optionsLocalConfigUpdateListener)) {
        Config.configLocalListeners.push(optionsLocalConfigUpdateListener);
    }

    await utils.wait(() => Config.config !== null);

    if (!Config.config.darkMode) {
        document.documentElement.setAttribute("data-theme", "light");
    }

    const donate = document.getElementById("sbDonate");
    donate.addEventListener("click", () => Config.config.donateClicked = Config.config.donateClicked + 1);
    if (!showDonationLink()) {
        donate.classList.add("hidden");
    }

    // DeArrow promotion
    if (Config.config.showNewFeaturePopups && Config.config.showUpsells && Config.config.showDeArrowInSettings) {
        isDeArrowInstalled().then((installed) => {
            if (!installed) {
                const deArrowPromotion = document.getElementById("deArrowPromotion");
                deArrowPromotion.classList.remove("hidden");

                deArrowPromotion.addEventListener("click", () => Config.config.showDeArrowPromotion = false);

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

    const skipToHighlightKeybind = document.querySelector(`[data-sync="skipToHighlightKeybind"] .optionLabel`) as HTMLElement;
    skipToHighlightKeybind.innerText = `${chrome.i18n.getMessage("skip_to_category").replace("{0}", chrome.i18n.getMessage("category_poi_highlight")).replace("?", "")}:`;

    // Set all of the toggle options to the correct option
    const optionsContainer = document.getElementById("options");
    const optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        const dependentOnName = optionsElements[i].getAttribute("data-dependent-on");
        const dependentOn = optionsContainer.querySelector(`[data-sync='${dependentOnName}']`);
        let isDependentOnReversed = false;
        if (dependentOn)
            isDependentOnReversed = dependentOn.getAttribute("data-toggle-type") === "reverse" || optionsElements[i].getAttribute("data-dependent-on-inverted") === "true";

        if (await shouldHideOption(optionsElements[i]) || (dependentOn && (isDependentOnReversed ? Config.config[dependentOnName] : !Config.config[dependentOnName]))) {
            optionsElements[i].classList.add("hidden", "hiding");
            if (!dependentOn) {
                if (optionsElements[i].getAttribute("data-no-safari") === "true" && optionsElements[i].id === "support-invidious") {
                    // Put message about being disabled on safari
                    const infoBox = document.createElement("div");
                    infoBox.innerText = chrome.i18n.getMessage("invidiousDisabledSafari");
                    
                    const link = document.createElement("a");
                    link.style.display = "block";
                    const url = "https://bugs.webkit.org/show_bug.cgi?id=290508";
                    link.href = url;
                    link.innerText = url;

                    infoBox.appendChild(link);

                    optionsElements[i].parentElement.insertBefore(infoBox, optionsElements[i].nextSibling);
                }

                continue;
            }
        }

        const option = optionsElements[i].getAttribute("data-sync");

        switch (optionsElements[i].getAttribute("data-type")) {
            case "toggle": {
                const optionResult = Config.config[option];

                const checkbox = optionsElements[i].querySelector("input");
                const reverse = optionsElements[i].getAttribute("data-toggle-type") === "reverse";

                const confirmMessage = optionsElements[i].getAttribute("data-confirm-message");
                const confirmOnTrue = optionsElements[i].getAttribute("data-confirm-on") !== "false";

                if (optionResult != undefined)
                    checkbox.checked =  reverse ? !optionResult : optionResult;

                // See if anything extra should be run first time
                switch (option) {
                    case "supportInvidious":
                        invidiousInit(checkbox, option);
                        break;
                }

                // Add click listener
                checkbox.addEventListener("click", async () => {
                    // Confirm if required
                    if (confirmMessage && ((confirmOnTrue && checkbox.checked) || (!confirmOnTrue && !checkbox.checked))
                            && !confirm(chrome.i18n.getMessage(confirmMessage))){
                        checkbox.checked = !checkbox.checked;
                        return;
                    }

                    Config.config[option] = reverse ? !checkbox.checked : checkbox.checked;

                    // See if anything extra must be run
                    switch (option) {
                        case "supportInvidious":
                            invidiousOnClick(checkbox, option);
                            break;
                        case "disableAutoSkip":
                            if (!checkbox.checked) {
                                // Enable the notice
                                Config.config["dontShowNotice"] = false;

                                const showNoticeSwitch = <HTMLInputElement> document.querySelector("[data-sync='dontShowNotice'] > div > label > input");
                                showNoticeSwitch.checked = true;
                            }
                            break;
                        case "showDonationLink":
                            if (checkbox.checked)
                                document.getElementById("sbDonate").classList.add("hidden");
                            else
                                document.getElementById("sbDonate").classList.remove("hidden");
                            break;
                        case "darkMode":
                            if (checkbox.checked) {
                                document.documentElement.setAttribute("data-theme", "dark");
                            } else {
                                document.documentElement.setAttribute("data-theme", "light");
                            }
                            break;
                        case "trackDownvotes":
                            if (!checkbox.checked) {
                                Config.local.downvotedSegments = {};
                            }
                            break;
                    }

                    // If other options depend on this, hide/show them
                    const dependents = optionsContainer.querySelectorAll(`[data-dependent-on='${option}']`);
                    for (let j = 0; j < dependents.length; j++) {
                        const disableWhenChecked = dependents[j].getAttribute("data-dependent-on-inverted") === "true";
                        if (!await shouldHideOption(dependents[j]) && (!disableWhenChecked && checkbox.checked || disableWhenChecked && !checkbox.checked)) {
                            dependents[j].classList.remove("hidden");
                            setTimeout(() => dependents[j].classList.remove("hiding"), 1);
                        } else {
                            dependents[j].classList.add("hiding");
                            setTimeout(() => dependents[j].classList.add("hidden"), 400);
                        }
                    }
                });
                break;
            }
            case "text-change": {
                const textChangeInput = <HTMLInputElement> optionsElements[i].querySelector(".option-text-box");

                const textChangeSetButton = <HTMLElement> optionsElements[i].querySelector(".text-change-set");

                textChangeInput.value = Config.config[option];

                textChangeSetButton.addEventListener("click", async () => {
                    // See if anything extra must be done
                    switch (option) {
                        case "serverAddress": {
                            const result = validateServerAddress(textChangeInput.value);

                            if (result !== null) {
                                textChangeInput.value = result;
                            } else {
                                return;
                            }

                            // Permission needed on Firefox
                            if (isFirefoxOrSafari()) {
                                const permissionSuccess = await new Promise((resolve) => {
                                    chrome.permissions.request({
                                        origins: [textChangeInput.value + "/"],
                                        permissions: []
                                    }, resolve);
                                });

                                if (!permissionSuccess) return;
                            }

                            break;
                        }
                    }

                    Config.config[option] = textChangeInput.value;
                });

                // Reset to the default if needed
                const textChangeResetButton = <HTMLElement> optionsElements[i].querySelector(".text-change-reset");
                textChangeResetButton.addEventListener("click", () => {
                    if (!confirm(chrome.i18n.getMessage("areYouSureReset"))) return;

                    Config.config[option] = Config.syncDefaults[option];

                    textChangeInput.value = Config.config[option];
                });

                break;
            }
            case "private-text-change": {
                const button = optionsElements[i].querySelector(".trigger-button");
                button.addEventListener("click", () => activatePrivateTextChange(<HTMLElement> optionsElements[i]));

                if (option == "*")  {
                    const downloadButton = optionsElements[i].querySelector(".download-button");
                    downloadButton.addEventListener("click", () => downloadConfig(optionsElements[i]));

                    const uploadButton = optionsElements[i].querySelector(".upload-button");
                    uploadButton.addEventListener("change", (e) => uploadConfig(e, optionsElements[i] as HTMLElement));
                }

                const privateTextChangeOption = optionsElements[i].getAttribute("data-sync");
                // See if anything extra must be done
                switch (privateTextChangeOption) {
                    case "invidiousInstances":
                        invidiousInstanceAddInit(<HTMLElement> optionsElements[i], privateTextChangeOption);
                }

                break;
            }
            case "button-press": {
                const actionButton = optionsElements[i].querySelector(".trigger-button");
                const confirmMessage = optionsElements[i].getAttribute("data-confirm-message");

                actionButton.addEventListener("click", () => {
                    if (confirmMessage !== null && !confirm(chrome.i18n.getMessage(confirmMessage))) {
                        return;
                    }
                    switch (optionsElements[i].getAttribute("data-sync")) {
                        case "copyDebugInformation":
                            copyDebugOutputToClipboard();
                            break;
                        case "resetToDefault":
                            Config.resetToDefault();
                            setTimeout(() => window.location.reload(), 200);
                            break;
                    }
                });

                break;
            }
            case "keybind-change": {
                const root = createRoot(optionsElements[i].querySelector("div"));
                root.render(React.createElement(KeybindComponent, {option: option}));
                break;
            }
            case "display": {
                updateDisplayElement(<HTMLElement> optionsElements[i])
                break;
            }
            case "number-change": {
                const configValue = Config.config[option];
                const numberInput = optionsElements[i].querySelector("input");

                if (isNaN(configValue) || configValue < 0) {
                    numberInput.value = Config.syncDefaults[option];
                } else {
                    numberInput.value = configValue;
                }

                numberInput.addEventListener("input", () => {
                    Config.config[option] = numberInput.value;
                });

                break;
            }
            case "selector": {
                const configValue = Config.config[option];
                const selectorElement = optionsElements[i].querySelector(".selector-element") as HTMLSelectElement;
                selectorElement.value = configValue;

                selectorElement.addEventListener("change", () => {
                    let value: string | number = selectorElement.value;
                    if (!isNaN(Number(value))) value = Number(value);

                    Config.config[option] = value;
                });
                break;
            }
            case "react-CategoryChooserComponent":
                categoryChoosers.push(new CategoryChooser(optionsElements[i]));
                break;
            case "react-AdvancedSkipOptionsComponent":
                new AdvancedSkipOptions(optionsElements[i]);
                break;
            case "react-UnsubmittedVideosComponent":
                unsubmittedVideos.push(new UnsubmittedVideos(optionsElements[i]));
                break;
        }
    }

    // Tab interaction
    const tabElements = document.getElementsByClassName("tab-heading");
    for (let i = 0; i < tabElements.length; i++) {
        const tabFor = tabElements[i].getAttribute("data-for");

        if (tabElements[i].classList.contains("selected"))
            document.getElementById(tabFor).classList.remove("hidden");

        tabElements[i].addEventListener("click", () => {
            if (!embed) location.hash = tabFor;

            createStickyHeader();

            document.querySelectorAll(".tab-heading").forEach(element => { element.classList.remove("selected"); });
            optionsContainer.querySelectorAll(".option-group").forEach(element => { element.classList.add("hidden"); });

            tabElements[i].classList.add("selected");
            document.getElementById(tabFor).classList.remove("hidden");
        });
    }

    window.addEventListener("scroll", () => createStickyHeader());

    optionsContainer.classList.add("animated");
}

function createStickyHeader() {
    const container = document.getElementById("options-container");
    const options = document.getElementById("options");

    if (!embed && window.pageYOffset > 90 && (window.innerHeight <= 770 || window.innerWidth <= 1200)) {
        if (!container.classList.contains("sticky")) {
            options.style.marginTop = options.offsetTop.toString()+"px";
            container.classList.add("sticky");
        }
    } else {
        options.style.marginTop = "unset";
        container.classList.remove("sticky");
    }
}

/**
 * Handle special cases where an option shouldn't show
 *
 * @param {String} element
 */
async function shouldHideOption(element: Element): Promise<boolean> {
    return (element.getAttribute("data-private-only") === "true" && !(await isIncognitoAllowed()))
            || (element.getAttribute("data-no-safari") === "true" && navigator.vendor === "Apple Computer, Inc.");
}

/**
 * Called when the config is updated
 */
function optionsConfigUpdateListener() {
    const optionsContainer = document.getElementById("options");
    const optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("data-type")) {
            case "display":
                updateDisplayElement(<HTMLElement> optionsElements[i])
                break;
        }
    }
}

function optionsLocalConfigUpdateListener(changes: StorageChangesObject) {
    if (changes.unsubmittedSegments) {
        for (const chooser of unsubmittedVideos) {
            chooser.update();
        }
    }
}

/**
 * Will set display elements to the proper text
 *
 * @param element
 */
function updateDisplayElement(element: HTMLElement) {
    const displayOption = element.getAttribute("data-sync")
    const displayText = Config.config[displayOption];
    element.innerText = displayText;

    // See if anything extra must be run
    switch (displayOption) {
        case "invidiousInstances": {
            element.innerText = displayText.join(', ');
            let allEquals = displayText.length == invidiousList.length;
            for (let i = 0; i < invidiousList.length && allEquals; i++) {
                if (displayText[i] != invidiousList[i])
                    allEquals = false;
            }
            if (!allEquals) {
                const resetButton = element.parentElement.querySelector(".invidious-instance-reset");
                resetButton.classList.remove("hidden");
            }
            break;
        }
    }
}

/**
 * Initializes the option to add Invidious instances
 *
 * @param element
 * @param option
 */
function invidiousInstanceAddInit(element: HTMLElement, option: string) {
    const textBox = <HTMLInputElement> element.querySelector(".option-text-box");
    const button = element.querySelector(".trigger-button");

    const setButton = element.querySelector(".text-change-set");
    const cancelButton = element.querySelector(".text-change-reset");
    const resetButton = element.querySelector(".invidious-instance-reset");
    setButton.addEventListener("click", async function() {
        if (textBox.value == "" || textBox.value.includes("/") || textBox.value.includes("http")) {
            alert(chrome.i18n.getMessage("addInvidiousInstanceError"));
        } else {
            // Add this
            let instanceList = Config.config[option];
            if (!instanceList) instanceList = [];

            let domain = textBox.value.trim().toLowerCase();
            if (domain.includes(":")) {
                domain = domain.split(":")[0];
            }

            instanceList.push(domain);

            Config.config[option] = instanceList;

            const checkbox = <HTMLInputElement> document.querySelector("#support-invidious input");
            checkbox.checked = true;

            invidiousOnClick(checkbox, "supportInvidious");

            resetButton.classList.remove("hidden");

            // Hide this section again
            textBox.value = "";
            element.querySelector(".option-hidden-section").classList.add("hidden");
            button.classList.remove("disabled");
        }
    });

    cancelButton.addEventListener("click", async function() {
        textBox.value = "";
        element.querySelector(".option-hidden-section").classList.add("hidden");
        button.classList.remove("disabled");
    });

    resetButton.addEventListener("click", function() {
        if (confirm(chrome.i18n.getMessage("resetInvidiousInstanceAlert"))) {
            // Set to CI populated list
            Config.config[option] = invidiousList;
            resetButton.classList.add("hidden");
        }
    });
}

/**
 * Run when the invidious button is being initialized
 *
 * @param checkbox
 * @param option
 */
function invidiousInit(checkbox: HTMLInputElement, option: string) {
    utils.containsInvidiousPermission().then((result) => {
        if (result != checkbox.checked) {
            Config.config[option] = result;

            checkbox.checked = result;
        }
    });
}

/**
 * Run whenever the invidious checkbox is clicked
 *
 * @param checkbox
 * @param option
 */
async function invidiousOnClick(checkbox: HTMLInputElement, option: string): Promise<void> {
    const enabled = await utils.applyInvidiousPermissions(checkbox.checked, option);
    checkbox.checked = enabled;
}

/**
 * Will trigger the textbox to appear to be able to change an option's text.
 *
 * @param element
 */
function activatePrivateTextChange(element: HTMLElement) {
    const button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    const textBox = <HTMLInputElement> element.querySelector(".option-text-box");
    const option = element.getAttribute("data-sync");
    const optionType = element.getAttribute("data-sync-type");

    // See if anything extra must be done
    switch (option) {
        case "invidiousInstances":
            element.querySelector(".option-hidden-section").classList.remove("hidden");
            return;
    }

    let result = Config.config[option];
    // See if anything extra must be done
    switch (option) {
        case "*": {
            if (optionType === "local") {
                result = JSON.stringify(Config.cachedLocalStorage);
            } else {
                result = JSON.stringify(Config.cachedSyncConfig);
            }
            break;
        }
    }

    textBox.value = result;

    const setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", async () => {
        setTextOption(option, element, textBox.value);
    });

    // See if anything extra must be done
    switch (option) {
        case "userID":
            if (Config.config[option]) {
                asyncRequestToServer("GET", "/api/userInfo", {
                    publicUserID: getHash(Config.config[option]),
                    values: ["warnings", "banned"]
                }).then((result) => {
                    const userInfo = JSON.parse(result.responseText);
                    if (userInfo.warnings > 0 || userInfo.banned) {
                        setButton.classList.add("hidden");
                    }
                }).catch(e => {
                    console.error("[SB] Caught error while fetching user info for the new user ID", e)
                });
            }

            break;
    }

    element.querySelector(".option-hidden-section").classList.remove("hidden");
}

/**
 * Function to run when a textbox change is submitted
 *
 * @param option data-sync value
 * @param element main container div
 * @param value new text
 * @param callbackOnError function to run if confirmMessage was denied
 */
async function setTextOption(option: string, element: HTMLElement, value: string, callbackOnError?: () => void) {
    const confirmMessage = element.getAttribute("data-confirm-message");
    const optionType = element.getAttribute("data-sync-type");

    if (confirmMessage === null || confirm(chrome.i18n.getMessage(confirmMessage))) {

        // See if anything extra must be done
        switch (option) {
            case "*":
                try {
                    const newConfig = JSON.parse(value);
                    for (const key in newConfig) {
                        if (optionType === "local") {
                            Config.local[key] = newConfig[key];
                        } else {
                            Config.config[key] = newConfig[key];
                        }
                    }

                    if (optionType !== "local" && newConfig.supportInvidious) {
                        const checkbox = <HTMLInputElement> document.querySelector("#support-invidious > div > label > input");

                        checkbox.checked = true;
                        await invidiousOnClick(checkbox, "supportInvidious");
                    }

                    setTimeout(() => window.location.reload(), 200);
                } catch (e) {
                    alert(chrome.i18n.getMessage("incorrectlyFormattedOptions"));
                }

                break;
            default:
                Config.config[option] = value;
        }
    } else {
        if (typeof callbackOnError == "function")
            callbackOnError();
    }
}

function downloadConfig(element: Element) {
    const optionType = element.getAttribute("data-sync-type");

    const file = document.createElement("a");
    const jsonData = JSON.parse(JSON.stringify(optionType === "local" ? Config.cachedLocalStorage : Config.cachedSyncConfig));
    const dateTimeString = new Date().toJSON().replace("T", "_").replace(/:/g, ".").replace(/.\d+Z/g, "")
    file.setAttribute("href", `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(jsonData))}`);
    file.setAttribute("download", `SponsorBlock${optionType === "local" ? "OtherData" : "Config"}_${dateTimeString}.json`);
    document.body.append(file);
    file.click();
    file.remove();
}

function uploadConfig(e: Event, element: HTMLElement) {
    const target = e.target as HTMLInputElement;
    if (target.files.length == 1) {
        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = function(ev) {
            setTextOption("*", element, ev.target.result as string, () => {
                target.value = null;
            });
        };
        reader.readAsText(file);
    }
}

/**
 * Validates the value used for the database server address.
 * Returns null and alerts the user if there is an issue.
 *
 * @param input Input server address
 */
function validateServerAddress(input: string): string {
    input = input.trim();

    // Trim the trailing slashes
    input = input.replace(/\/+$/, "");

    // If it isn't HTTP protocol
    if ((!input.startsWith("https://") && !input.startsWith("http://"))) {

        alert(chrome.i18n.getMessage("customAddressError"));

        return null;
    }

    return input;
}

function copyDebugOutputToClipboard() {
    // Copy object to clipboard
    navigator.clipboard.writeText(generateDebugDetails())
    .then(() => {
        alert(chrome.i18n.getMessage("copyDebugInformationComplete"));
    })
    .catch(() => {
        alert(chrome.i18n.getMessage("copyDebugInformationFailed"));
    });
}

function isIncognitoAllowed(): Promise<boolean> {
    return new Promise((resolve) => chrome.extension.isAllowedIncognitoAccess(resolve));
}
