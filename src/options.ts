import * as React from "react";
import { createRoot } from 'react-dom/client';

import Config from "./config";
import * as CompileConfig from "../config.json";
import * as invidiousList from "../ci/invidiouslist.json";

// Make the config public for debugging purposes
window.SB = Config;

import Utils from "./utils";
import CategoryChooser from "./render/CategoryChooser";
import UnsubmittedVideos from "./render/UnsubmittedVideos";
import KeybindComponent from "./components/options/KeybindComponent";
import { showDonationLink } from "./utils/configUtils";
import { localizeHtmlPage } from "./utils/pageUtils";
import { StorageChangesObject } from "@ajayyy/maze-utils/lib/config";
import { getHash } from "@ajayyy/maze-utils/lib/hash";
const utils = new Utils();
let embed = false;

const categoryChoosers: CategoryChooser[] = [];
const unsubmittedVideos: UnsubmittedVideos[] = [];

window.addEventListener('DOMContentLoaded', init);

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

    await utils.wait(() => Config.config !== null);

    if (!Config.config.darkMode) {
        document.documentElement.setAttribute("data-theme", "light");
    }

    const donate = document.getElementById("sbDonate");
    donate.addEventListener("click", () => Config.config.donateClicked = Config.config.donateClicked + 1);
    if (!showDonationLink()) {
        donate.classList.add("hidden");
    }

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
            if (!dependentOn)
                continue;
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
                            if (utils.isFirefox()) {
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
                    downloadButton.addEventListener("click", downloadConfig);

                    const uploadButton = optionsElements[i].querySelector(".upload-button");
                    uploadButton.addEventListener("change", (e) => uploadConfig(e));
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
                            window.location.reload();
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
function optionsConfigUpdateListener(changes: StorageChangesObject) {
    const optionsContainer = document.getElementById("options");
    const optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("data-type")) {
            case "display":
                updateDisplayElement(<HTMLElement> optionsElements[i])
                break;
        }
    }

    if (changes.categorySelections || changes.payments) {
        for (const chooser of categoryChoosers) {
            chooser.update();
        }
    } else if (changes.unsubmittedSegments) {
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

            instanceList.push(textBox.value.trim().toLowerCase());

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
            result = JSON.stringify(Config.cachedSyncConfig);
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
                utils.asyncRequestToServer("GET", "/api/userInfo", {
                    publicUserID: getHash(Config.config[option]),
                    values: ["warnings", "banned"]
                }).then((result) => {
                    const userInfo = JSON.parse(result.responseText);
                    if (userInfo.warnings > 0 || userInfo.banned) {
                        setButton.classList.add("hidden");
                    }
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

    if (confirmMessage === null || confirm(chrome.i18n.getMessage(confirmMessage))) {

        // See if anything extra must be done
        switch (option) {
            case "*":
                try {
                    const newConfig = JSON.parse(value);
                    for (const key in newConfig) {
                        Config.config[key] = newConfig[key];
                    }

                    if (newConfig.supportInvidious) {
                        const checkbox = <HTMLInputElement> document.querySelector("#support-invidious > div > label > input");

                        checkbox.checked = true;
                        await invidiousOnClick(checkbox, "supportInvidious");
                    }

                    window.location.reload();

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

function downloadConfig() {
    const file = document.createElement("a");
    const jsonData = JSON.parse(JSON.stringify(Config.cachedSyncConfig));
    const dateTimeString = new Date().toJSON().replace("T", "_").replace(/:/g, ".").replace(/.\d+Z/g, "")
    file.setAttribute("href", `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(jsonData))}`);
    file.setAttribute("download", `SponsorBlockConfig_${dateTimeString}.json`);
    document.body.append(file);
    file.click();
    file.remove();
}

function uploadConfig(e) {
    if (e.target.files.length == 1) {
        const file = e.target.files[0];
        const reader = new FileReader();
        const element = document.querySelector("[data-sync='*']") as HTMLElement;
        reader.onload = function(ev) {
            setTextOption("*", element, ev.target.result as string, () => {
                e.target.value = null;
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
    // Build output debug information object
    const output = {
        debug: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            extensionVersion: chrome.runtime.getManifest().version
        },
        config: JSON.parse(JSON.stringify(Config.cachedSyncConfig)) // Deep clone config object
    };

    // Sanitise sensitive user config values
    delete output.config.userID;
    output.config.serverAddress = (output.config.serverAddress === CompileConfig.serverAddress)
        ? "Default server address" : "Custom server address";
    output.config.invidiousInstances = output.config.invidiousInstances.length;
    output.config.whitelistedChannels = output.config.whitelistedChannels.length;

    // Copy object to clipboard
    navigator.clipboard.writeText(JSON.stringify(output, null, 4))
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
