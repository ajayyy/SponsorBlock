import Config from "./config";

import Utils from "./utils";
var utils = new Utils();

window.addEventListener('DOMContentLoaded', init);

async function init() {
    utils.localizeHtmlPage();

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
                    Config.config[option] = reverse ? !checkbox.checked : checkbox.checked;

                    // See if anything extra must be run
                    switch (option) {
                        case "supportInvidious":
                            invidiousOnClick(checkbox, option);
                            break;
                    }
                });
                break;
            case "text-change":
                let textChangeOption = optionsElements[i].getAttribute("sync-option");
                let textInput = <HTMLInputElement> optionsElements[i].querySelector(".option-text-box");
                
                let setButton = <HTMLElement> optionsElements[i].querySelector(".text-change-set");

                textInput.value = Config.config[textChangeOption];

                setButton.addEventListener("click", () => {
                    // See if anything extra must be done
                    switch (textChangeOption) {
                        case "serverAddress":
                            let result = validateServerAddress(textInput.value);

                            if (result !== null) {
                                textInput.value = result;
                            } else {
                                return;
                            }

                            break;
                    }

                    Config.config[textChangeOption] = textInput.value;
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
        if (textBox.value == "" || textBox.value.includes("/") || textBox.value.includes("http") || textBox.value.includes(":")) {
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
function invidiousOnClick(checkbox: HTMLInputElement, option: string) {
    if (checkbox.checked) {
        utils.setupExtraSitePermissions(function (granted) {
            if (!granted) {
                Config.config[option] = false;
                checkbox.checked = false;
            }
        });
    } else {
        utils.removeExtraSiteRegistration();
    }
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

    let button = element.querySelector(".trigger-button");

    // cancel setting a keybind
    if (key === "Escape") {
        element.querySelector(".option-hidden-section").classList.add("hidden");
        button.classList.remove("disabled");
        return;
    }

    let option = element.getAttribute("sync-option");

    Config.config[option] = key;

    let status = <HTMLElement> element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescriptionComplete");

    let statusKey = <HTMLElement> element.querySelector(".option-hidden-section > .keybind-status-key");
    statusKey.innerText = key;

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
	
    textBox.value = Config.config[option];
    
    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", () => {
        let confirmMessage = element.getAttribute("confirm-message");

        if (confirmMessage === null || confirm(chrome.i18n.getMessage(confirmMessage))) {
            Config.config[option] = textBox.value;
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
    // Trim the last slash if needed
    if (input.endsWith("/")) {
        input = input.substring(0, input.length - 1);
    }

    // Isn't HTTP protocol or has extra slashes
    if ((!input.startsWith("https://") && !input.startsWith("http://")) 
        || input.replace("://", "").includes("/")) {

        alert(chrome.i18n.getMessage("customAddressError"));

        return null;
    }

    return input;
}