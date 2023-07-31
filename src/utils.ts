import Config, { VideoDownvotes } from "./config";
import { CategorySelection, SponsorTime, BackgroundScriptContainer, Registration, VideoID, SponsorHideType, CategorySkipOption } from "./types";

import { getHash, HashedValue } from "./maze-utils/hash";
import * as CompileConfig from "../config.json";
import { isFirefoxOrSafari, waitFor } from "./maze-utils";
import { findValidElementFromSelector } from "./maze-utils/dom";
import { FetchResponse, sendRequestToCustomServer } from "./maze-utils/background-request-proxy"
import { isSafari } from "./maze-utils/config";

export default class Utils {
    
    // Contains functions needed from the background script
    backgroundScriptContainer: BackgroundScriptContainer | null;

    // Used to add content scripts and CSS required
    js = [
        "./js/content.js"
    ];
    css = [
        "content.css",
        "./libs/Source+Sans+Pro.css",
        "popup.css",
        "shared.css"
    ];

    constructor(backgroundScriptContainer: BackgroundScriptContainer = null) {
        this.backgroundScriptContainer = backgroundScriptContainer;
    }

    async wait<T>(condition: () => T, timeout = 5000, check = 100): Promise<T> {
        return waitFor(condition, timeout, check);
    }

    containsPermission(permissions: chrome.permissions.Permissions): Promise<boolean> {
        return new Promise((resolve) => {
            chrome.permissions.contains(permissions, resolve)
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
        let permissions = ["webNavigation"];
        if (!isSafari()) permissions.push("declarativeContent");
        if (isFirefoxOrSafari() && !isSafari()) permissions = [];

        chrome.permissions.request({
            origins: this.getPermissionRegex(),
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
            matches: this.getPermissionRegex()
        };

        if (this.backgroundScriptContainer) {
            this.backgroundScriptContainer.registerFirefoxContentScript(registration);
        } else {
            chrome.runtime.sendMessage({message: "registerContentScript"});
        }
    }

    /**
     * Removes the permission and content script registration.
     */
    removeExtraSiteRegistration(): void {
        const id = "invidious";

        if (this.backgroundScriptContainer) {
            this.backgroundScriptContainer.unregisterFirefoxContentScript(id);
        } else {
            chrome.runtime.sendMessage({
                message: "unregisterContentScript",
                id: id
            });
        }

        if (!isFirefoxOrSafari() && chrome.declarativeContent) {
            // Only if we have permission
            chrome.declarativeContent.onPageChanged.removeRules(["invidious"]);
        }

        chrome.permissions.remove({
            origins: this.getPermissionRegex()
        });
    }

    applyInvidiousPermissions(enable: boolean, option = "supportInvidious"): Promise<boolean> {
        return new Promise((resolve) => {
            if (enable) {
                this.setupExtraSitePermissions((granted) => {
                    if (!granted) {
                        Config.config[option] = false;
                    }

                    resolve(granted);
                });
            } else {
                this.removeExtraSiteRegistration();
                resolve(false);
            }
        });
    }

    containsInvidiousPermission(): Promise<boolean> {
        return new Promise((resolve) => {
            let permissions = ["declarativeContent"];
            if (isFirefoxOrSafari()) permissions = [];

            chrome.permissions.contains({
                origins: this.getPermissionRegex(),
                permissions: permissions
            }, function (result) {
                resolve(result);
            });
        })
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
        return { name: category, option: CategorySkipOption.Disabled} as CategorySelection;
    }

    /**
     * @returns {String[]} Domains in regex form
     */
    getPermissionRegex(domains: string[] = []): string[] {
        const permissionRegex: string[] = [];
        if (domains.length === 0) {
            domains = [...Config.config.invidiousInstances];
        }

        for (const url of domains) {
            permissionRegex.push("https://*." + url + "/*");
            permissionRegex.push("http://*." + url + "/*");
        }

        return permissionRegex;
    }

    /**
     * Sends a request to a custom server
     * 
     * @param type The request type. "GET", "POST", etc.
     * @param address The address to add to the SponsorBlock server address
     * @param callback 
     */    
    asyncRequestToCustomServer(type: string, url: string, data = {}): Promise<FetchResponse> {
        return sendRequestToCustomServer(type, url, data);
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

    findReferenceNode(): HTMLElement {
        const selectors = [
            "#player-container-id", // Mobile YouTube
            "#movie_player",
            ".html5-video-player", // May 2023 Card-Based YouTube Layout
            "#c4-player", // Channel Trailer
            "#player-container", // Preview on hover
            "#main-panel.ytmusic-player-page", // YouTube music
            "#player-container .video-js", // Invidious
            ".main-video-section > .video-container", // Cloudtube
            ".shaka-video-container", // Piped
            "#player-container.ytk-player", // YT Kids
        ];

        let referenceNode = findValidElementFromSelector(selectors)
        if (referenceNode == null) {
            //for embeds
            const player = document.getElementById("player");
            referenceNode = player?.firstChild as HTMLElement;
            if (referenceNode) {
                let index = 1;

                //find the child that is the video player (sometimes it is not the first)
                while (index < player.children.length && (!referenceNode.classList?.contains("html5-video-player") || !referenceNode.classList?.contains("ytp-embed"))) {
                    referenceNode = player.children[index] as HTMLElement;

                    index++;
                }
            }
        }

        return referenceNode;
    }

    isContentScript(): boolean {
        return window.location.protocol === "http:" || window.location.protocol === "https:";
    }

    isHex(num: string): boolean {
        return Boolean(num.match(/^[0-9a-f]+$/i));
    }

    async addHiddenSegment(videoID: VideoID, segmentUUID: string, hidden: SponsorHideType) {
        if (chrome.extension.inIncognitoContext || !Config.config.trackDownvotes) return;

        const hashedVideoID = (await getHash(videoID, 1)).slice(0, 4) as VideoID & HashedValue;
        const UUIDHash = await getHash(segmentUUID, 1);

        const allDownvotes = Config.local.downvotedSegments;
        const currentVideoData = allDownvotes[hashedVideoID] || { segments: [], lastAccess: 0 };

        currentVideoData.lastAccess = Date.now();
        const existingData = currentVideoData.segments.find((segment) => segment.uuid === UUIDHash);
        if (hidden === SponsorHideType.Visible) {
            currentVideoData.segments.splice(currentVideoData.segments.indexOf(existingData), 1);

            if (currentVideoData.segments.length === 0) {
                delete allDownvotes[hashedVideoID];
            }
        } else {
            if (existingData) {
                existingData.hidden = hidden;
            } else {
                currentVideoData.segments.push({
                    uuid: UUIDHash,
                    hidden
                });
            }

            allDownvotes[hashedVideoID] = currentVideoData;
        }

        const entries = Object.entries(allDownvotes);
        if (entries.length > 10000) {
            let min: [string, VideoDownvotes] = null;
            for (let i = 0; i < entries[0].length; i++) {
                if (min === null || entries[i][1].lastAccess < min[1].lastAccess) {
                    min = entries[i];
                }
            }

            delete allDownvotes[min[0]];
        }

        Config.forceLocalUpdate("downvotedSegments");
    }
}
