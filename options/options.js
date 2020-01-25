window.addEventListener('DOMContentLoaded', init);

async function init() {
    localizeHtmlPage();

    if (!SB.configListeners.includes(optionsConfigUpdateListener)) {
        SB.configListeners.push(optionsConfigUpdateListener);
    }

    await wait(() => SB.config !== undefined);

    // Set all of the toggle options to the correct option
    let optionsContainer = document.getElementById("options");
    let optionsElements = optionsContainer.querySelectorAll("*");

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("option-type")) {
            case "toggle": 
                let option = optionsElements[i].getAttribute("sync-option");
                let optionResult = SB.config[option];

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
                    SB.config[option] = reverse ? !checkbox.checked : checkbox.checked;

                    // See if anything extra must be run
                    switch (option) {
                        case "supportInvidious":
                            invidiousOnClick(checkbox, option);
                            break;
                    }
                });
                break;
            case "text-change":
                let button = optionsElements[i].querySelector(".trigger-button");
                button.addEventListener("click", () => activateTextChange(optionsElements[i]));

                let textChangeOption = optionsElements[i].getAttribute("sync-option");
                // See if anything extra must be done
                switch (textChangeOption) {
                    case "invidiousInstances":
                        invidiousInstanceAddInit(optionsElements[i], textChangeOption);
                }

                break;
            case "keybind-change":
                let keybindButton = optionsElements[i].querySelector(".trigger-button");
                keybindButton.addEventListener("click", () => activateKeybindChange(optionsElements[i]));

                break;
            case "display":
                updateDisplayElement(optionsElements[i])

                break;
            case "number-change":
                let numberChangeOption = optionsElements[i].getAttribute("sync-option");
                let configValue = SB.config[numberChangeOption];
                let numberInput = optionsElements[i].querySelector("input");

                if (isNaN(configValue) || configValue < 0) {
                    numberInput.value = SB.defaults[numberChangeOption];
                } else {
                    numberInput.value = configValue;
                }

                numberInput.addEventListener("input", () => {
                    SB.config[numberChangeOption] = numberInput.value;
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
                updateDisplayElement(optionsElements[i])
        }
    }
}

/**
 * Will set display elements to the proper text
 * 
 * @param {HTMLElement} element 
 */
function updateDisplayElement(element) {
    let displayOption = element.getAttribute("sync-option")
    let displayText = SB.config[displayOption];
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
 * @param {HTMLElement} element 
 * @param {String} option 
 */
function invidiousInstanceAddInit(element, option) {
    let textBox = element.querySelector(".option-text-box");
    let button = element.querySelector(".trigger-button");

    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", async function(e) {
        if (textBox.value == "" || textBox.value.includes("/") || textBox.value.includes("http") || textBox.value.includes(":")) {
            alert(chrome.i18n.getMessage("addInvidiousInstanceError"));
        } else {
            // Add this
            let instanceList = SB.config[option];
            if (!instanceList) instanceList = [];

            instanceList.push(textBox.value);

            SB.config[option] = instanceList;

            let checkbox = document.querySelector("#support-invidious input");
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
            SB.config[option] = SB.defaults[option].slice(0);
        }
    });
}

/**
 * Run when the invidious button is being initialized
 * 
 * @param {HTMLElement} checkbox 
 * @param {string} option 
 */
function invidiousInit(checkbox, option) {
    let permissions = ["declarativeContent"];
    if (isFirefox()) permissions = [];

    chrome.permissions.contains({
        origins: getInvidiousInstancesRegex(),
        permissions: permissions
    }, function (result) {
        if (result != checkbox.checked) {
            SB.config[option] = result;

            checkbox.checked = result;
        }
    });
}

/**
 * Run whenever the invidious checkbox is clicked
 * 
 * @param {HTMLElement} checkbox 
 * @param {string} option 
 */
function invidiousOnClick(checkbox, option) {
    if (checkbox.checked) {
        setupExtraSitePermissions(function (granted) {
            if (!granted) {
                SB.config[option] = false;
                checkbox.checked = false;
            }
        });
    } else {
        removeExtraSiteRegistration();
    }
}

/**
 * Will trigger the container to ask the user for a keybind.
 * 
 * @param {HTMLElement} element 
 */
function activateKeybindChange(element) {
    let button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let option = element.getAttribute("sync-option");

    let currentlySet = SB.config[option] !== null ? chrome.i18n.getMessage("keybindCurrentlySet") : "";
    
    let status = element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescription") + currentlySet;

    if (SB.config[option] !== null) {
        let statusKey = element.querySelector(".option-hidden-section > .keybind-status-key");
        statusKey.innerText = SB.config[option];
    }

    element.querySelector(".option-hidden-section").classList.remove("hidden");
    
    document.addEventListener("keydown", (e) => keybindKeyPressed(element, e), {once: true});
}

/**
 * Called when a key is pressed in an activiated keybind change option.
 * 
 * @param {HTMLElement} element 
 * @param {KeyboardEvent} e
 */
function keybindKeyPressed(element, e) {
    e = e || window.event;
    var key = e.key;

    let button = element.querySelector(".trigger-button");

    // cancel setting a keybind
    if (key === "Escape") {
        element.querySelector(".option-hidden-section").classList.add("hidden");
        button.classList.remove("disabled");
        return;
    }

    let option = element.getAttribute("sync-option");

    SB.config[option] = key;

    let status = element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescriptionComplete");

    let statusKey = element.querySelector(".option-hidden-section > .keybind-status-key");
    statusKey.innerText = key;

    button.classList.remove("disabled");
}

/**
 * Will trigger the textbox to appear to be able to change an option's text.
 * 
 * @param {HTMLElement} element 
 */
function activateTextChange(element) {
    let button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let textBox = element.querySelector(".option-text-box");
    let option = element.getAttribute("sync-option");

    // See if anything extra must be done
    switch (option) {
        case "invidiousInstances":
            element.querySelector(".option-hidden-section").classList.remove("hidden");
            return;
    }
	
    textBox.value = SB.config[option];
    
    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", () => {
        let confirmMessage = element.getAttribute("confirm-message");

        if (confirmMessage === null || confirm(chrome.i18n.getMessage(confirmMessage))) {
            SB.config[option] = textBox.value;
        }
    });

    element.querySelector(".option-hidden-section").classList.remove("hidden");
}
