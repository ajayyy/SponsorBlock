import Config from "./config";
import { CategorySelection, SponsorTime, FetchResponse, BackgroundScriptContainer, Registration } from "./types";

import * as CompileConfig from "../config.json";

class Utils {
    
    // Contains functions needed from the background script
    backgroundScriptContainer: BackgroundScriptContainer | null = null;

    // Used to add content scripts and CSS required
    js = [
        "./js/vendor.js",
        "./js/content.js"
    ];
    css = [
        "content.css",
        "./libs/Source+Sans+Pro.css",
        "popup.css"
    ];

    constructor(backgroundScriptContainer?: BackgroundScriptContainer) {
        this.backgroundScriptContainer = backgroundScriptContainer;
    }

    /** Function that can be used to wait for a condition before returning. */
    async wait<T>(condition: () => T | false, timeout = 5000, check = 100): Promise<T> {
        return await new Promise((resolve, reject) => {
            setTimeout(() => reject("TIMEOUT"), timeout);

            const intervalCheck = () => {
                const result = condition();
                if (result !== false) {
                    resolve(result);
                    clearInterval(interval);
                }
            };

            const interval = setInterval(intervalCheck, check);
            
            //run the check once first, this speeds it up a lot
            intervalCheck();
        });
    }

    /**
     * Asks for the optional permissions required for all extra sites.
     * It also starts the content script registrations.
     * 
     * For now, it is just SB.config.invidiousInstances.
     * 
     * @param {CallableFunction} callback
     */
    setupExtraSitePermissions(callback: (granted: boolean) => void): void {
        // Request permission
        let permissions = ["declarativeContent"];
        if (this.isFirefox()) permissions = [];        

        chrome.permissions.request({
            origins: this.getInvidiousInstancesRegex(),
            permissions: permissions
        }, async (granted) => {
            if (granted) {
                this.setupExtraSiteContentScripts();
            } else {
                this.removeExtraSiteRegistration();
            }

            callback(granted);
        });
    }

    /**
     * Registers the content scripts for the extra sites.
     * Will use a different method depending on the browser.
     * This is called by setupExtraSitePermissions().
     * 
     * For now, it is just SB.config.invidiousInstances.
     */
    setupExtraSiteContentScripts(): void {

        if (this.isFirefox()) {
            const firefoxJS = [];
            for (const file of this.js) {
                firefoxJS.push({file});
            }
            const firefoxCSS = [];
            for (const file of this.css) {
                firefoxCSS.push({file});
            }

            const registration: Registration = {
                message: "registerContentScript",
                id: "invidious",
                allFrames: true,
                js: firefoxJS,
                css: firefoxCSS,
                matches: this.getInvidiousInstancesRegex()
            };

            if (this.backgroundScriptContainer) {
                this.backgroundScriptContainer.registerFirefoxContentScript(registration);
            } else {
                chrome.runtime.sendMessage(registration);
            }
        } else {
            chrome.declarativeContent.onPageChanged.removeRules(["invidious"], () => {
                const conditions = [];
                for (const regex of this.getInvidiousInstancesRegex()) {
                    conditions.push(new chrome.declarativeContent.PageStateMatcher({
                        pageUrl: { urlMatches: regex }
                    }));
                }

                // Add page rule
                const rule = {
                    id: "invidious",
                    conditions,
                    actions: [new chrome.declarativeContent.RequestContentScript({
                        allFrames: true,
                        js: this.js,
                        css: this.css
                    })]
                };
                
                chrome.declarativeContent.onPageChanged.addRules([rule]);
            });
        }
    }

    /**
     * Removes the permission and content script registration.
     */
    removeExtraSiteRegistration(): void {
        if (this.isFirefox()) {
            const id = "invidious";

            if (this.backgroundScriptContainer) {
                this.backgroundScriptContainer.unregisterFirefoxContentScript(id);
            } else {
                chrome.runtime.sendMessage({
                    message: "unregisterContentScript",
                    id: id
                });
            }
        } else if (chrome.declarativeContent) {
            // Only if we have permission
            chrome.declarativeContent.onPageChanged.removeRules(["invidious"]);
        }

        chrome.permissions.remove({
            origins: this.getInvidiousInstancesRegex()
        });
    }

    /**
     * Merges any overlapping timestamp ranges into single segments and returns them as a new array.
     */
    getMergedTimestamps(timestamps: number[][]): [number, number][] {
        let deduped: [number, number][] = [];

        // Cases ([] = another segment, <> = current range):
        // [<]>, <[>], <[]>, [<>], [<][>]
        timestamps.forEach((range) => {
            // Find segments the current range overlaps
            const startOverlaps = deduped.findIndex((other) => range[0] >= other[0] && range[0] <= other[1]);
            const endOverlaps = deduped.findIndex((other) => range[1] >= other[0] && range[1] <= other[1]);

            if (~startOverlaps && ~endOverlaps) {
                // [<][>] Both the start and end of this range overlap another segment
                // [<>] This range is already entirely contained within an existing segment
                if (startOverlaps === endOverlaps) return;

                // Remove the range with the higher index first to avoid the index shifting
                const other1 = deduped.splice(Math.max(startOverlaps, endOverlaps), 1)[0];
                const other2 = deduped.splice(Math.min(startOverlaps, endOverlaps), 1)[0];

                // Insert a new segment spanning the start and end of the range
                deduped.push([Math.min(other1[0], other2[0]), Math.max(other1[1], other2[1])]);
            } else if (~startOverlaps) {
                // [<]> The start of this range overlaps another segment, extend its end
                deduped[startOverlaps][1] = range[1];
            } else if (~endOverlaps) {
                // <[>] The end of this range overlaps another segment, extend its beginning
                deduped[endOverlaps][0] = range[0];
            } else {
                // No overlaps, just push in a copy
                deduped.push(range.slice() as [number, number]);
            }

            // <[]> Remove other segments contained within this range
            deduped = deduped.filter((other) => !(other[0] > range[0] && other[1] < range[1]));
        });

        return deduped;
    }

    /**
     * Returns the total duration of the timestamps, taking into account overlaps.
     */
    getTimestampsDuration(timestamps: number[][]): number {
        return this.getMergedTimestamps(timestamps).reduce((acc, range) => {
            return acc + range[1] - range[0];
        }, 0);
    }

    getSponsorIndexFromUUID(sponsorTimes: SponsorTime[], UUID: string): number {
        for (let i = 0; i < sponsorTimes.length; i++) {
            if (sponsorTimes[i].UUID === UUID) {
                return i;
            }
        }

        return -1;
    }

    getSponsorTimeFromUUID(sponsorTimes: SponsorTime[], UUID: string): SponsorTime {
        return sponsorTimes[this.getSponsorIndexFromUUID(sponsorTimes, UUID)];
    }

    getCategorySelection(category: string): CategorySelection {
        for (const selection of Config.config.categorySelections) {
            if (selection.name === category) {
                return selection;
            }
        }
    }

    localizeHtmlPage(): void {
        //Localize by replacing __MSG_***__ meta tags
        const objects = document.getElementsByClassName("sponsorBlockPageBody")[0].children;
        for (let j = 0; j < objects.length; j++) {
            const obj = objects[j];
            
            const localizedMessage = this.getLocalizedMessage(obj.innerHTML.toString());
            if (localizedMessage) obj.innerHTML = localizedMessage;
        }
    }

    getLocalizedMessage(text: string): string | false {
        const valNewH = text.replace(/__MSG_(\w+)__/g, function(match, v1) {
            return v1 ? chrome.i18n.getMessage(v1).replace("\n", "<br/>") : "";
        });

        if(valNewH != text) {
            return valNewH;
        } else {
            return false;
        }
    }

    /**
     * @returns {String[]} Invidious Instances in regex form
     */
    getInvidiousInstancesRegex(): string[] {
        const invidiousInstancesRegex: string[] = [];
        for (const url of Config.config.invidiousInstances) {
            invidiousInstancesRegex.push("https://*." + url + "/*");
            invidiousInstancesRegex.push("http://*." + url + "/*");
        }

        return invidiousInstancesRegex;
    }

    generateUserID(length = 36): string {
        const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        if (window.crypto && window.crypto.getRandomValues) {
                const values = new Uint32Array(length);
                window.crypto.getRandomValues(values);
                for (let i = 0; i < length; i++) {
                        result += charset[values[i] % charset.length];
                }
                return result;
        } else {
                for (let i = 0; i < length; i++) {
                    result += charset[Math.floor(Math.random() * charset.length)];
                }
                return result;
        }
    }

    /**
     * Gets the error message in a nice string
     * 
     * @param {int} statusCode 
     * @returns {string} errorMessage
     */
    getErrorMessage(statusCode: number, responseText: string): string {
        let errorMessage = "";
        const postFix = (responseText ? "\n\n" + responseText : "");
                            
        if([400, 429, 409, 502, 0].includes(statusCode)) {
            //treat them the same
            if (statusCode == 503) statusCode = 502;

            errorMessage = chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode
                            + "\n\n" + chrome.i18n.getMessage("statusReminder");
        } else {
            errorMessage = chrome.i18n.getMessage("connectionError") + statusCode;
        }

        return errorMessage + postFix;
    }

    /**
     * Sends a request to a custom server
     * 
     * @param type The request type. "GET", "POST", etc.
     * @param address The address to add to the SponsorBlock server address
     * @param callback 
     */    
    async asyncRequestToCustomServer(type: string, url: string, data = {}): Promise<FetchResponse> {
        return new Promise((resolve) => {
            // Ask the background script to do the work
            chrome.runtime.sendMessage({
                message: "sendRequest",
                type,
                url,
                data
            }, (response) => {
                resolve(response);
            });
        })
    }

    /**
     * Sends a request to the SponsorBlock server with address added as a query
     * 
     * @param type The request type. "GET", "POST", etc.
     * @param address The address to add to the SponsorBlock server address
     * @param callback 
     */    
    async asyncRequestToServer(type: string, address: string, data = {}): Promise<FetchResponse> {
        const serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

        return await (this.asyncRequestToCustomServer(type, serverAddress + address, data));
    }

    /**
     * Sends a request to the SponsorBlock server with address added as a query
     * 
     * @param type The request type. "GET", "POST", etc.
     * @param address The address to add to the SponsorBlock server address
     * @param callback 
     */
    sendRequestToServer(type: string, address: string, callback?: (response: FetchResponse) => void): void {
        const serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

        // Ask the background script to do the work
        chrome.runtime.sendMessage({
            message: "sendRequest",
            type,
            url: serverAddress + address
        }, (response) => {
            callback(response);
        });
    }

    getFormattedTime(seconds: number, precise?: boolean): string {
        const hours = Math.floor(seconds / 60 / 60);
        const minutes = Math.floor(seconds / 60) % 60;
        let minutesDisplay = String(minutes);
        let secondsNum = seconds % 60;
        if (!precise) {
            secondsNum = Math.floor(secondsNum);
        }

        let secondsDisplay = String(precise ? secondsNum.toFixed(3) : secondsNum);
        
        if (secondsNum < 10) {
            //add a zero
            secondsDisplay = "0" + secondsDisplay;
        }
        if (hours && minutes < 10) {
            //add a zero
            minutesDisplay = "0" + minutesDisplay;
        }

        const formatted = (hours ? hours + ":" : "") + minutesDisplay + ":" + secondsDisplay;

        return formatted;
    }

    getFormattedTimeToSeconds(formatted: string): number | null {
        const fragments = /^(?:(?:(\d+):)?(\d+):)?(\d*(?:[.,]\d+)?)$/.exec(formatted);

        if (fragments === null) {
            return null;
        }

        const hours = fragments[1] ? parseInt(fragments[1]) : 0;
        const minutes = fragments[2] ? parseInt(fragments[2] || '0') : 0;
        const seconds = fragments[3] ? parseFloat(fragments[3].replace(',', '.')) : 0;

        return hours * 3600 + minutes * 60 + seconds;
    }

    shortCategoryName(categoryName: string): string {
        return chrome.i18n.getMessage("category_" + categoryName + "_short") || chrome.i18n.getMessage("category_" + categoryName);
    }

    isContentScript(): boolean {
        return window.location.protocol === "http:" || window.location.protocol === "https:";
    }

    isHex(num: string): boolean {
        return Boolean(num.match(/^[0-9a-f]+$/i));
    }

    /**
     * Is this Firefox (web-extensions)
     */
    isFirefox(): boolean {
        return typeof(browser) !== "undefined";
    }

    async getHash(value: string, times = 5000): Promise<string> {
        if (times <= 0) return "";

        let hashBuffer = new TextEncoder().encode(value).buffer;

        for (let i = 0; i < times; i++) {
            hashBuffer = await crypto.subtle.digest('SHA-256', hashBuffer);
        }

        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return hashHex;
    }

}

export default Utils;
