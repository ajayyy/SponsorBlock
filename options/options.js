window.addEventListener('DOMContentLoaded', init);

async function init() {
    localizeHtmlPage();

    // Set all of the toggle options to the correct option
    let optionsContainer = document.getElementById("options");
    let optionsElements = optionsContainer.children;

    // How many checks are left to be done
    let checksLeft = 0;

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("option-type")) {
            case "toggle": 
                let option = optionsElements[i].getAttribute("sync-option");
                chrome.storage.sync.get([option], function(result) {
                    let optionResult = result[option];
                    if (optionResult != undefined) {
                        let checkbox = optionsElements[i].querySelector("input");
                        checkbox.checked = optionResult;

                        let reverse = optionsElements[i].getAttribute("toggle-type") === "reverse";

                        if (reverse) {
                            optionsElements[i].querySelector("input").checked = !optionResult;
                        }

                        checkbox.addEventListener("click", () =>{
							SB.config[option] = reverse ? !checkbox.checked : checkbox.checked;
                        });
                    }

                    checksLeft--;
                });

                checksLeft++;
                break;
            case "text-change":
                let button = optionsElements[i].querySelector(".trigger-button");
                button.addEventListener("click", () => activateTextChange(optionsElements[i]));

                break;
            case "keybind-change":
                let keybindButton = optionsElements[i].querySelector(".trigger-button");
                keybindButton.addEventListener("click", () => activateKeybindChange(optionsElements[i]));

                break;
        }
    }

    await wait(() => checksLeft == 0, 1000, 50);

    optionsContainer.classList.remove("hidden");
    optionsContainer.classList.add("animated");
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

    chrome.storage.sync.get([option], function(result) {
        let currentlySet = result[option] !== null ? chrome.i18n.getMessage("keybindCurrentlySet") : "";
        
        let status = element.querySelector(".option-hidden-section > .keybind-status");
        status.innerText = chrome.i18n.getMessage("keybindDescription") + currentlySet;

        if (result[option] !== null) {
            let statusKey = element.querySelector(".option-hidden-section > .keybind-status-key");
            statusKey.innerText = result[option];
        }
    
        element.querySelector(".option-hidden-section").classList.remove("hidden");
        
        document.addEventListener("keydown", (e) => keybindKeyPressed(element, e), {once: true});
    });
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

    let option = element.getAttribute("sync-option");

    chrome.storage.sync.set({[option]: key});

    let status = element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescriptionComplete");

    let statusKey = element.querySelector(".option-hidden-section > .keybind-status-key");
    statusKey.innerText = key;

    let button = element.querySelector(".trigger-button");

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
	
	textBox.value = SB.config[option];

    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", () => {SB.config[option] = textBox.value});

    element.querySelector(".option-hidden-section").classList.remove("hidden");
}
