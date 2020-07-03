import Config from "./config";
import * as CompileConfig from "../config.json";

// Make the config public for debugging purposes
(<any> window).SB = Config;

import Utils from "./utils";
import CategoryChooser from "./render/CategoryChooser";
var utils = new Utils();

window.addEventListener('DOMContentLoaded', init);

async function init() {
    utils.localizeHtmlPage();

    // Remove header if needed
    if (window.location.hash === "#embed") {
        for (const element of document.getElementsByClassName("titleBar")) {
            element.classList.add("hidden");
        }
    }

    if (!Config.configListeners.includes(optionsConfigUpdateListener)) {
        Config.configListeners.push(optionsConfigUpdateListener);
    }

    await utils.wait(() => Config.config !== null);

    // Set all of the toggle options to the correct option
    let optionsContainer = document.getElementById("options");
    let optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("option-type")) {
            case "toggle": 
                let option = optionsElements[i].getAttribute("sync-option");
                let optionResult = Config.config[option];

                let checkbox = optionsElements[i].querySelector("input");
                let reverse = optionsElements[i].getAttribute("toggle-type") === "reverse";

                let confirmMessage = optionsElements[i].getAttribute("confirm-message");

                if (optionResult != undefined) {
                    checkbox.checked = optionResult;

                    if (reverse) {
                        optionsElements[i].querySelector("input").checked = !optionResult;
                    }
                }

                // See if anything extra should be run first time
                switch (option) {
                    case "supportInvidious":
                        invidiousInit(checkbox, option);
                        break;
                }

                // Add click listener
                checkbox.addEventListener("click", () => {
                    // Confirm if required
                    if (checkbox.checked && confirmMessage && !confirm(chrome.i18n.getMessage(confirmMessage))){
                        checkbox.checked = false;
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
                                
                                let showNoticeSwitch = <HTMLInputElement> document.querySelector("[sync-option='dontShowNotice'] > label > label > input");
                                showNoticeSwitch.checked = true;
                            }

                            break;
                    }
                });
                break;
            case "text-change":
                let textChangeOption = optionsElements[i].getAttribute("sync-option");
                let textChangeInput = <HTMLInputElement> optionsElements[i].querySelector(".option-text-box");
                
                let textChangeSetButton = <HTMLElement> optionsElements[i].querySelector(".text-change-set");

                textChangeInput.value = Config.config[textChangeOption];

                textChangeSetButton.addEventListener("click", async () => {
                    // See if anything extra must be done
                    switch (textChangeOption) {
                        case "serverAddress":
                            let result = validateServerAddress(textChangeInput.value);

                            if (result !== null) {
                                textChangeInput.value = result;
                            } else {
                                return;
                            }

                            // Permission needed on Firefox
                            if (utils.isFirefox()) {
                                let permissionSuccess = await new Promise((resolve, reject) => {
                                    chrome.permissions.request({
                                        origins: [textChangeInput.value + "/"],
                                        permissions: []
                                    }, resolve);
                                });

                                if (!permissionSuccess) return;
                            }

                            break;
                    }

                    Config.config[textChangeOption] = textChangeInput.value;
                });

                // Reset to the default if needed
                let textChangeResetButton = <HTMLElement> optionsElements[i].querySelector(".text-change-reset");
                textChangeResetButton.addEventListener("click", () => {
                    if (!confirm(chrome.i18n.getMessage("areYouSureReset"))) return;

                    Config.config[textChangeOption] = Config.defaults[textChangeOption];

                    textChangeInput.value = Config.config[textChangeOption];
                });

                break;
            case "private-text-change":
                let button = optionsElements[i].querySelector(".trigger-button");
                button.addEventListener("click", () => activatePrivateTextChange(<HTMLElement> optionsElements[i]));

                let privateTextChangeOption = optionsElements[i].getAttribute("sync-option");
                // See if anything extra must be done
                switch (privateTextChangeOption) {
                    case "invidiousInstances":
                        invidiousInstanceAddInit(<HTMLElement> optionsElements[i], privateTextChangeOption);
                }

                break;
            case "button-press":
                let actionButton = optionsElements[i].querySelector(".trigger-button");

                switch(optionsElements[i].getAttribute("sync-option")) {
                    case "copyDebugInformation":
                        actionButton.addEventListener("click", copyDebugOutputToClipboard);
                        break;
                }

                break;
            case "keybind-change":
                let keybindButton = optionsElements[i].querySelector(".trigger-button");
                keybindButton.addEventListener("click", () => activateKeybindChange(<HTMLElement> optionsElements[i]));

                break;
            case "display":
                updateDisplayElement(<HTMLElement> optionsElements[i])

                break;
            case "number-change":
                let numberChangeOption = optionsElements[i].getAttribute("sync-option");
                let configValue = Config.config[numberChangeOption];
                let numberInput = optionsElements[i].querySelector("input");

                if (isNaN(configValue) || configValue < 0) {
                    numberInput.value = Config.defaults[numberChangeOption];
                } else {
                    numberInput.value = configValue;
                }

                numberInput.addEventListener("input", () => {
                    Config.config[numberChangeOption] = numberInput.value;
                });

                break;
            case "react-CategoryChooserComponent":
                new CategoryChooser(optionsElements[i]);
            break;
        }
    }

    optionsContainer.classList.remove("hidden");
    optionsContainer.classList.add("animated");
}

/**
 * Called when the config is updated
 * 
 * @param {String} element 
 */
function optionsConfigUpdateListener(changes) {
    let optionsContainer = document.getElementById("options");
    let optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("option-type")) {
            case "display":
                updateDisplayElement(<HTMLElement> optionsElements[i])
        }
    }
}

/**
 * Will set display elements to the proper text
 * 
 * @param element 
 */
function updateDisplayElement(element: HTMLElement) {
    let displayOption = element.getAttribute("sync-option")
    let displayText = Config.config[displayOption];
    element.innerText = displayText;

    // See if anything extra must be run
    switch (displayOption) {
        case "invidiousInstances":
            element.innerText = displayText.join(', ');
            break;
    }
}

/**
 * Initializes the option to add Invidious instances
 * 
 * @param element 
 * @param option 
 */
function invidiousInstanceAddInit(element: HTMLElement, option: string) {
    let textBox = <HTMLInputElement> element.querySelector(".option-text-box");
    let button = element.querySelector(".trigger-button");

    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", async function(e) {
        if (textBox.value == "" || textBox.value.includes("/") || textBox.value.includes("http")) {
            alert(chrome.i18n.getMessage("addInvidiousInstanceError"));
        } else {
            // Add this
            let instanceList = Config.config[option];
            if (!instanceList) instanceList = [];

            instanceList.push(textBox.value);

            Config.config[option] = instanceList;

            let checkbox = <HTMLInputElement> document.querySelector("#support-invidious input");
            checkbox.checked = true;

            invidiousOnClick(checkbox, "supportInvidious");

            textBox.value = "";

            // Hide this section again
            element.querySelector(".option-hidden-section").classList.add("hidden");
            button.classList.remove("disabled");
        }
    });

    let resetButton = element.querySelector(".invidious-instance-reset");
    resetButton.addEventListener("click", function(e) {
        if (confirm(chrome.i18n.getMessage("resetInvidiousInstanceAlert"))) {
            // Set to a clone of the default
            Config.config[option] = Config.defaults[option].slice(0);
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
    let permissions = ["declarativeContent"];
    if (utils.isFirefox()) permissions = [];

    chrome.permissions.contains({
        origins: utils.getInvidiousInstancesRegex(),
        permissions: permissions
    }, function (result) {
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
async function invidiousOnClick(checkbox: HTMLInputElement, option: string) {
    return new Promise((resolve) => {
        if (checkbox.checked) {
            utils.setupExtraSitePermissions(function (granted) {
                if (!granted) {
                    Config.config[option] = false;
                    checkbox.checked = false;
                } else {
                    checkbox.checked = true;
                }

                resolve();
            });
        } else {
            utils.removeExtraSiteRegistration();
        }
    });
}

/**
 * Will trigger the container to ask the user for a keybind.
 * 
 * @param element 
 */
function activateKeybindChange(element: HTMLElement) {
    let button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let option = element.getAttribute("sync-option");

    let currentlySet = Config.config[option] !== null ? chrome.i18n.getMessage("keybindCurrentlySet") : "";
    
    let status = <HTMLElement> element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescription") + currentlySet;

    if (Config.config[option] !== null) {
        let statusKey = <HTMLElement> element.querySelector(".option-hidden-section > .keybind-status-key");
        statusKey.innerText = Config.config[option];
    }

    element.querySelector(".option-hidden-section").classList.remove("hidden");
    
    document.addEventListener("keydown", (e) => keybindKeyPressed(element, e), {once: true}); 
}

/**
 * Called when a key is pressed in an activiated keybind change option.
 * 
 * @param element 
 * @param e
 */
function keybindKeyPressed(element: HTMLElement, e: KeyboardEvent) {
    var key = e.key;

    if (["Shift", "Control", "Meta", "Alt", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].indexOf(key) !== -1) {

        // Wait for more
        document.addEventListener("keydown", (e) => keybindKeyPressed(element, e), {once: true});
    } else {
        let button: HTMLElement = element.querySelector(".trigger-button");
        let option = element.getAttribute("sync-option");

        // Don't allow keys which are already listened for by youtube 
        let restrictedKeys = "1234567890,.jklftcibmJKLFTCIBMNP/<> -+";
        if (restrictedKeys.indexOf(key) !== -1 ) {
            closeKeybindOption(element, button);

            alert(chrome.i18n.getMessage("theKey") + " " + key + " " + chrome.i18n.getMessage("keyAlreadyUsedByYouTube"));
            return;
        }

        // Make sure keybind isn't used by the other listener
        // TODO: If other keybindings are going to be added, we need a better way to find the other keys used.
        let otherKeybind = (option === "startSponsorKeybind") ? Config.config['submitKeybind'] : Config.config['startSponsorKeybind'];
        if (key === otherKeybind) {
            closeKeybindOption(element, button);

            alert(chrome.i18n.getMessage("theKey") + " " + key + " " + chrome.i18n.getMessage("keyAlreadyUsed"));
            return;
        }

        // cancel setting a keybind
        if (key === "Escape") {
            closeKeybindOption(element, button);

            return;
        }
        
        Config.config[option] = key;

        let status = <HTMLElement> element.querySelector(".option-hidden-section > .keybind-status");
        status.innerText = chrome.i18n.getMessage("keybindDescriptionComplete");

        let statusKey = <HTMLElement> element.querySelector(".option-hidden-section > .keybind-status-key");
        statusKey.innerText = key;

        button.classList.remove("disabled");
    }
}

/**
 * Closes the menu for editing the keybind
 * 
 * @param element 
 * @param button 
 */
function closeKeybindOption(element: HTMLElement, button: HTMLElement) {
    element.querySelector(".option-hidden-section").classList.add("hidden");
    button.classList.remove("disabled");
}

/**
 * Will trigger the textbox to appear to be able to change an option's text.
 * 
 * @param element 
 */
function activatePrivateTextChange(element: HTMLElement) {
    let button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let textBox = <HTMLInputElement> element.querySelector(".option-text-box");
    let option = element.getAttribute("sync-option");

    // See if anything extra must be done
    switch (option) {
        case "invidiousInstances":
            element.querySelector(".option-hidden-section").classList.remove("hidden");
            return;
    }
    
    let result = Config.config[option];

    // See if anything extra must be done
    switch (option) {
        case "*":
            let jsonData = JSON.parse(JSON.stringify(Config.localConfig));

            // Fix sponsorTimes data as it is destroyed from the JSON stringify
            jsonData.sponsorTimes = Config.encodeStoredItem(Config.localConfig.sponsorTimes);

            result = JSON.stringify(jsonData);
            break;
    }

    textBox.value = result;
    
    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", async () => {
        let confirmMessage = element.getAttribute("confirm-message");

        if (confirmMessage === null || confirm(chrome.i18n.getMessage(confirmMessage))) {
            
            // See if anything extra must be done
            switch (option) {
                case "*":
                    try {
                        let newConfig = JSON.parse(textBox.value);
                        for (const key in newConfig) {
                            Config.config[key] = newConfig[key];
                        }
                        Config.convertJSON();

                        if (newConfig.supportInvidious) {
                            let checkbox = <HTMLInputElement> document.querySelector("#support-invidious > label > label > input");
                            
                            checkbox.checked = true;
                            await invidiousOnClick(checkbox, "supportInvidious");
                        }

                        window.location.reload();
                        
                    } catch (e) {
                        alert(chrome.i18n.getMessage("incorrectlyFormattedOptions"));
                    }

                    break;
                default:
                    Config.config[option] = textBox.value;
            }
        }
    });

    element.querySelector(".option-hidden-section").classList.remove("hidden");
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
    let output = {
        debug: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            extensionVersion: chrome.runtime.getManifest().version
        },
        config: JSON.parse(JSON.stringify(Config.localConfig)) // Deep clone config object
    };

    // Fix sponsorTimes data as it is destroyed from the JSON stringify
    output.config.sponsorTimes = Config.encodeStoredItem(Config.localConfig.sponsorTimes);
    
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
      .catch(err => {
        alert(chrome.i18n.getMessage("copyDebugInformationFailed"));
      });;
}