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
                chrome.storage.sync.get([optionsElements[i].getAttribute("toggle-sync-option")], function(result) {
                    let optionResult = result[optionsElements[i].getAttribute("toggle-sync-option")];
                    if (optionResult != undefined) {
                        optionsElements[i].querySelector("input").checked = optionResult;

                        if (optionsElements[i].getAttribute("toggle-type") == "reverse") {
                            optionsElements[i].querySelector("input").checked = !optionResult;
                        }
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