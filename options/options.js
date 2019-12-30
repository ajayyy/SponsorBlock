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
                            setOptionValue(option, reverse ? !checkbox.checked : checkbox.checked)
                        });
                    }

                    checksLeft--;
                });

                checksLeft++;
                break;
            case "text-change":
                let button = optionsElements[i].querySelector(".text-change-trigger");
                button.addEventListener("click", () => activateTextChange(optionsElements[i]));

                break;
        }
    }

    await wait(() => checksLeft == 0, 1000, 50);

    optionsContainer.classList.remove("hidden");
    optionsContainer.classList.add("animated");
}

/**
 * Will trigger the textbox to appear to be able to change an option's text.
 * 
 * @param {HTMLElement} element 
 */
function activateTextChange(element) {
    let button = element.querySelector(".text-change-trigger");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let textBox = element.querySelector(".option-text-box");
    let option = element.getAttribute("sync-option");

    chrome.storage.sync.get([option], function(result) {
        textBox.value = result[option];

        let setButton = element.querySelector(".text-change-set");
        setButton.addEventListener("click", () => setOptionValue(option, textBox.value));

        element.querySelector(".option-hidden-hidden").classList.remove("hidden");
    });
}

/**
 * Called when an option has been changed.
 * 
 * @param {string} option 
 * @param {*} value 
 */
function setOptionValue(option, value) {
    chrome.storage.sync.set({[option]: value});
}