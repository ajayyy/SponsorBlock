import Config from "../config";

export function runCompatibilityChecks() {
    if (Config.config.showZoomToFillError2 && document.URL.includes("watch?v=")) {
        setTimeout(() => {
            const zoomToFill = document.querySelector(".zoomtofillBtn");
    
            if (zoomToFill) {
                alert(chrome.i18n.getMessage("zoomToFillUnsupported"));
            }

            Config.config.showZoomToFillError2 = false;
        }, 10000);
    }
}