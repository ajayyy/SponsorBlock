import Config from "./config";
import Utils from "./utils";
const utils = new Utils();

// This is needed, if Config is not imported before Utils, things break.
// Probably due to cyclic dependencies
Config.config;

window.addEventListener('DOMContentLoaded', init);

async function init() {
    utils.localizeHtmlPage();

    const domains = document.location.hash.replace("#", "").split(",");

    const acceptButton = document.getElementById("acceptPermissionButton");
    acceptButton.addEventListener("click", () => {
        chrome.permissions.request({
            origins: utils.getPermissionRegex(domains),
            permissions: []
        }, (granted)  => {
            if (granted) {
                alert(chrome.i18n.getMessage("permissionRequestSuccess"));

                chrome.tabs.getCurrent((tab) => {
                    chrome.tabs.remove(tab.id);
                });
            } else {
                alert(chrome.i18n.getMessage("permissionRequestFailed"));
            }
        });
    });
}