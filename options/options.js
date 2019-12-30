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
                let option = optionsElements[i].getAttribute("toggle-sync-option");
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
                            optionToggled(option, reverse ? !checkbox.checked : checkbox.checked)
                        });
                    }

                    checksLeft--;
                });

                checksLeft++;
                break;
        }
    }

    await wait(() => checksLeft == 0, 1000, 50);

    optionsContainer.style.display = "inherit";
    optionsContainer.classList.add("animated");
}

/**
 * Called when an option has been toggled.
 * 
 * @param {HTMLElement} element 
 */
function optionToggled(option, value) {
    console.log(option)
    console.log(value)

    chrome.storage.sync.set({[option]: value});
}