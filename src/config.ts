import * as CompileConfig from "../config.json";
import * as invidiousList from "../ci/invidiouslist.json";
import { Category, CategorySelection, CategorySkipOption, NoticeVisbilityMode, PreviewBarOption, SponsorTime, StorageChangesObject, Keybind, HashedValue, VideoID, SponsorHideType } from "./types";
import { keybindEquals } from "./utils/configUtils";

interface SBConfig {
    userID: string,
    isVip: boolean,
    /* Contains unsubmitted segments that the user has created. */
    unsubmittedSegments: Record<string, SponsorTime[]>,
    defaultCategory: Category,
    whitelistedChannels: string[],
    forceChannelCheck: boolean,
    minutesSaved: number,
    skipCount: number,
    sponsorTimesContributed: number,
    submissionCountSinceCategories: number, // New count used to show the "Read The Guidelines!!" message
    showTimeWithSkips: boolean,
    disableSkipping: boolean,
    muteSegments: boolean,
    fullVideoSegments: boolean,
    trackViewCount: boolean,
    trackViewCountInPrivate: boolean,
    trackDownvotes: boolean,
    dontShowNotice: boolean,
    noticeVisibilityMode: NoticeVisbilityMode,
    hideVideoPlayerControls: boolean,
    hideInfoButtonPlayerControls: boolean,
    hideDeleteButtonPlayerControls: boolean,
    hideUploadButtonPlayerControls: boolean,
    hideSkipButtonPlayerControls: boolean,
    hideDiscordLaunches: number,
    hideDiscordLink: boolean,
    invidiousInstances: string[],
    supportInvidious: boolean,
    serverAddress: string,
    minDuration: number,
    skipNoticeDuration: number,
    audioNotificationOnSkip: boolean,
    checkForUnlistedVideos: boolean,
    testingServer: boolean,
    refetchWhenNotFound: boolean,
    ytInfoPermissionGranted: boolean,
    allowExpirements: boolean,
    showDonationLink: boolean,
    showPopupDonationCount: number,
    donateClicked: number,
    autoHideInfoButton: boolean,
    autoSkipOnMusicVideos: boolean,
    colorPalette: {
        red: string,
        white: string,
        locked: string
    },
    scrollToEditTimeUpdate: boolean,
    categoryPillUpdate: boolean,
    darkMode: boolean,

    // Used to cache calculated text color info
    categoryPillColors: {
        [key in Category]: {
            lastColor: string,
            textColor: string
        }
    }

    skipKeybind: Keybind,
    startSponsorKeybind: Keybind,
    submitKeybind: Keybind,

    // What categories should be skipped
    categorySelections: CategorySelection[],

    // Preview bar
    barTypes: {
        "preview-chooseACategory": PreviewBarOption,
        "sponsor": PreviewBarOption,
        "preview-sponsor": PreviewBarOption,
        "selfpromo": PreviewBarOption,
        "preview-selfpromo": PreviewBarOption,
        "exclusive_access": PreviewBarOption,
        "interaction": PreviewBarOption,
        "preview-interaction": PreviewBarOption,
        "intro": PreviewBarOption,
        "preview-intro": PreviewBarOption,
        "outro": PreviewBarOption,
        "preview-outro": PreviewBarOption,
        "preview": PreviewBarOption,
        "preview-preview": PreviewBarOption,
        "music_offtopic": PreviewBarOption,
        "preview-music_offtopic": PreviewBarOption,
        "poi_highlight": PreviewBarOption,
        "preview-poi_highlight": PreviewBarOption,
        "filler": PreviewBarOption,
        "preview-filler": PreviewBarOption,
    }
}

export type VideoDownvotes = { segments: { uuid: HashedValue, hidden: SponsorHideType }[] , lastAccess: number };

interface SBStorage {
    /* VideoID prefixes to UUID prefixes */
    downvotedSegments: Record<VideoID & HashedValue, VideoDownvotes>,
}

export interface SBObject {
    configSyncListeners: Array<(changes: StorageChangesObject) => unknown>;
    syncDefaults: SBConfig;
    localDefaults: SBStorage;
    cachedSyncConfig: SBConfig;
    cachedLocalStorage: SBStorage;
    config: SBConfig;
    local: SBStorage;
    forceSyncUpdate(prop: string): void;
    forceLocalUpdate(prop: string): void;
    resetToDefault(): void;
}

const Config: SBObject = {
    /**
     * Callback function when an option is updated
     */
    configSyncListeners: [],
    syncDefaults: {
        userID: null,
        isVip: false,
        unsubmittedSegments: {},
        defaultCategory: "chooseACategory" as Category,
        whitelistedChannels: [],
        forceChannelCheck: false,
        minutesSaved: 0,
        skipCount: 0,
        sponsorTimesContributed: 0,
        submissionCountSinceCategories: 0,
        showTimeWithSkips: true,
        disableSkipping: false,
        muteSegments: true,
        fullVideoSegments: true,
        trackViewCount: true,
        trackViewCountInPrivate: true,
        trackDownvotes: true,
        dontShowNotice: false,
        noticeVisibilityMode: NoticeVisbilityMode.FadedForAutoSkip,
        hideVideoPlayerControls: false,
        hideInfoButtonPlayerControls: false,
        hideDeleteButtonPlayerControls: false,
        hideUploadButtonPlayerControls: false,
        hideSkipButtonPlayerControls: false,
        hideDiscordLaunches: 0,
        hideDiscordLink: false,
        invidiousInstances: ["invidious.snopyta.org"], // leave as default
        supportInvidious: false,
        serverAddress: CompileConfig.serverAddress,
        minDuration: 0,
        skipNoticeDuration: 4,
        audioNotificationOnSkip: false,
        checkForUnlistedVideos: false,
        testingServer: false,
        refetchWhenNotFound: true,
        ytInfoPermissionGranted: false,
        allowExpirements: true,
        showDonationLink: true,
        showPopupDonationCount: 0,
        donateClicked: 0,
        autoHideInfoButton: true,
        autoSkipOnMusicVideos: false,
        scrollToEditTimeUpdate: false, // false means the tooltip will be shown
        categoryPillUpdate: false,
        darkMode: true,

        categoryPillColors: {},

        /**
         * Default keybinds should not set "code" as that's gonna be different based on the user's locale. They should also only use EITHER ctrl OR alt modifiers (or none).
         * Using ctrl+alt, or shift may produce a different character that we will not be able to recognize in different locales.
         * The exception for shift is letters, where it only capitalizes. So shift+A is fine, but shift+1 isn't.
         * Don't forget to add the new keybind to the checks in "KeybindDialogComponent.isKeybindAvailable()" and in "migrateOldFormats()"!
         *      TODO: Find a way to skip having to update these checks. Maybe storing keybinds in a Map?
         */
        skipKeybind: {key: "Enter"},
        startSponsorKeybind: {key: ";"},
        submitKeybind: {key: "'"},

        categorySelections: [{
            name: "sponsor" as Category,
            option: CategorySkipOption.AutoSkip
        }, {
            name: "poi_highlight" as Category,
            option: CategorySkipOption.ManualSkip
        }, {
            name: "exclusive_access" as Category,
            option: CategorySkipOption.ShowOverlay
        }],

        colorPalette: {
            red: "#780303",
            white: "#ffffff",
            locked: "#ffc83d"
        },

        // Preview bar
        barTypes: {
            "preview-chooseACategory": {
                color: "#ffffff",
                opacity: "0.7"
            },
            "sponsor": {
                color: "#00d400",
                opacity: "0.7"
            },
            "preview-sponsor": {
                color: "#007800",
                opacity: "0.7"
            },
            "selfpromo": {
                color: "#ffff00",
                opacity: "0.7"
            },
            "preview-selfpromo": {
                color: "#bfbf35",
                opacity: "0.7"
            },
            "exclusive_access": {
                color: "#008a5c",
                opacity: "0.7"
            },
            "interaction": {
                color: "#cc00ff",
                opacity: "0.7"
            },
            "preview-interaction": {
                color: "#6c0087",
                opacity: "0.7"
            },
            "intro": {
                color: "#00ffff",
                opacity: "0.7"
            },
            "preview-intro": {
                color: "#008080",
                opacity: "0.7"
            },
            "outro": {
                color: "#0202ed",
                opacity: "0.7"
            },
            "preview-outro": {
                color: "#000070",
                opacity: "0.7"
            },
            "preview": {
                color: "#008fd6",
                opacity: "0.7"
            },
            "preview-preview": {
                color: "#005799",
                opacity: "0.7"
            },
            "music_offtopic": {
                color: "#ff9900",
                opacity: "0.7"
            },
            "preview-music_offtopic": {
                color: "#a6634a",
                opacity: "0.7"
            },
            "poi_highlight": {
                color: "#ff1684",
                opacity: "0.7"
            },
            "preview-poi_highlight": {
                color: "#9b044c",
                opacity: "0.7"
            },
            "filler": {
                color: "#7300FF",
                opacity: "0.9"
            },
            "preview-filler": {
                color: "#2E0066",
                opacity: "0.7"
            }
        }
    },
    localDefaults: {
        downvotedSegments: {}
    },
    cachedSyncConfig: null,
    cachedLocalStorage: null,
    config: null,
    local: null,
    forceSyncUpdate,
    forceLocalUpdate,
    resetToDefault
};

// Function setup

function configProxy(): { sync: SBConfig, local: SBStorage } {
    chrome.storage.onChanged.addListener((changes: {[key: string]: chrome.storage.StorageChange}, areaName) => {
        if (areaName === "sync") {
            for (const key in changes) {
                Config.cachedSyncConfig[key] = changes[key].newValue;
            }

            for (const callback of Config.configSyncListeners) {
                callback(changes);
            }
        } else if (areaName === "local") {
            for (const key in changes) {
                Config.cachedLocalStorage[key] = changes[key].newValue;
            }
        }
    });

    const syncHandler: ProxyHandler<SBConfig> = {
        set<K extends keyof SBConfig>(obj: SBConfig, prop: K, value: SBConfig[K]) {
            Config.cachedSyncConfig[prop] = value;

            chrome.storage.sync.set({
                [prop]: value
            });

            return true;
        },

        get<K extends keyof SBConfig>(obj: SBConfig, prop: K): SBConfig[K] {
            const data = Config.cachedSyncConfig[prop];

            return obj[prop] || data;
        },

        deleteProperty(obj: SBConfig, prop: keyof SBConfig) {
            chrome.storage.sync.remove(<string> prop);

            return true;
        }

    };

    const localHandler: ProxyHandler<SBStorage> = {
        set<K extends keyof SBStorage>(obj: SBStorage, prop: K, value: SBStorage[K]) {
            Config.cachedLocalStorage[prop] = value;

            chrome.storage.local.set({
                [prop]: value
            });

            return true;
        },

        get<K extends keyof SBStorage>(obj: SBStorage, prop: K): SBStorage[K] {
            const data = Config.cachedLocalStorage[prop];

            return obj[prop] || data;
        },

        deleteProperty(obj: SBStorage, prop: keyof SBStorage) {
            chrome.storage.local.remove(<string> prop);

            return true;
        }

    };

    return {
        sync: new Proxy<SBConfig>({ handler: syncHandler } as unknown as SBConfig, syncHandler),
        local: new Proxy<SBStorage>({ handler: localHandler } as unknown as SBStorage, localHandler)
    };
}

function forceSyncUpdate(prop: string): void {
    chrome.storage.sync.set({
        [prop]: Config.cachedSyncConfig[prop]
    });
}

function forceLocalUpdate(prop: string): void {
    chrome.storage.local.set({
        [prop]: Config.cachedLocalStorage[prop]
    });
}

async function fetchConfig(): Promise<void> {
    await Promise.all([new Promise<void>((resolve) => {
        chrome.storage.sync.get(null, function(items) {
            Config.cachedSyncConfig = <SBConfig> <unknown> items;
            resolve();
        });
    }), new Promise<void>((resolve) => {
        chrome.storage.local.get(null, function(items) {
            Config.cachedLocalStorage = <SBStorage> <unknown> items;
            resolve();
        });
    })]);
}

function migrateOldSyncFormats(config: SBConfig) {
    if (config["segmentTimes"]) {
        const unsubmittedSegments = {};
        for (const item of config["segmentTimes"]) {
            unsubmittedSegments[item[0]] = item[1];
        }

        chrome.storage.sync.remove("segmentTimes", () => config.unsubmittedSegments = unsubmittedSegments);
    }

    if (!config["exclusive_accessCategoryAdded"] && !config.categorySelections.some((s) => s.name === "exclusive_access")) {
        config["exclusive_accessCategoryAdded"] = true;

        config.categorySelections.push({
            name: "exclusive_access" as Category,
            option: CategorySkipOption.ShowOverlay
        });

        config.categorySelections = config.categorySelections;
    }

    if (config["fillerUpdate"] !== undefined) {
        chrome.storage.sync.remove("fillerUpdate");
    }
    if (config["highlightCategoryAdded"] !== undefined) {
        chrome.storage.sync.remove("highlightCategoryAdded");
    }
    if (config["highlightCategoryUpdate"] !== undefined) {
        chrome.storage.sync.remove("highlightCategoryUpdate");
    }

    if (config["askAboutUnlistedVideos"]) {
        chrome.storage.sync.remove("askAboutUnlistedVideos");
    }

    if (!config["autoSkipOnMusicVideosUpdate"]) {
        config["autoSkipOnMusicVideosUpdate"] = true;
        for (const selection of config.categorySelections) {
            if (selection.name === "music_offtopic"
                    && selection.option === CategorySkipOption.AutoSkip) {

                config.autoSkipOnMusicVideos = true;
                break;
            }
        }
    }

    if (config["disableAutoSkip"]) {
        for (const selection of config.categorySelections) {
            if (selection.name === "sponsor") {
                selection.option = CategorySkipOption.ManualSkip;

                chrome.storage.sync.remove("disableAutoSkip");
            }
        }
    }

    if (typeof config["skipKeybind"] == "string") {
        config["skipKeybind"] = {key: config["skipKeybind"]};
    }

    if (typeof config["startSponsorKeybind"] == "string") {
        config["startSponsorKeybind"] = {key: config["startSponsorKeybind"]};
    }

    if (typeof config["submitKeybind"] == "string") {
        config["submitKeybind"] = {key: config["submitKeybind"]};
    }

    // Unbind key if it matches a previous one set by the user (should be ordered oldest to newest)
    const keybinds = ["skipKeybind", "startSponsorKeybind", "submitKeybind"];
    for (let i = keybinds.length-1; i >= 0; i--) {
        for (let j = 0; j < keybinds.length; j++) {
            if (i == j)
                continue;
            if (keybindEquals(config[keybinds[i]], config[keybinds[j]]))
                config[keybinds[i]] = null;
        }
    }

    // Remove some old unused options
    if (config["sponsorVideoID"] !== undefined) {
        chrome.storage.sync.remove("sponsorVideoID");
    }
    if (config["previousVideoID"] !== undefined) {
        chrome.storage.sync.remove("previousVideoID");
    }

    // populate invidiousInstances with new instances if 3p support is **DISABLED**
    if (!config["supportInvidious"] && config["invidiousInstances"].length !== invidiousList.length) {
        config["invidiousInstances"] = invidiousList;
    }
    
    if (config["lastIsVipUpdate"]) {
        chrome.storage.sync.remove("lastIsVipUpdate");
    }
}

async function setupConfig() {
    await fetchConfig();
    addDefaults();
    const config = configProxy();
    migrateOldSyncFormats(config.sync);

    Config.config = config.sync;
    Config.local = config.local;
}

// Add defaults
function addDefaults() {
    for (const key in Config.syncDefaults) {
        if(!Object.prototype.hasOwnProperty.call(Config.cachedSyncConfig, key)) {
            Config.cachedSyncConfig[key] = Config.syncDefaults[key];
        } else if (key === "barTypes") {
            for (const key2 in Config.syncDefaults[key]) {
                if(!Object.prototype.hasOwnProperty.call(Config.cachedSyncConfig[key], key2)) {
                    Config.cachedSyncConfig[key][key2] = Config.syncDefaults[key][key2];
                }
            }
        }
    }

    for (const key in Config.localDefaults) {
        if(!Object.prototype.hasOwnProperty.call(Config.cachedLocalStorage, key)) {
            Config.cachedLocalStorage[key] = Config.localDefaults[key];
        }
    }
}

function resetToDefault() {
    chrome.storage.sync.set({
        ...Config.syncDefaults,
        userID: Config.config.userID,
        minutesSaved: Config.config.minutesSaved,
        skipCount: Config.config.skipCount,
        sponsorTimesContributed: Config.config.sponsorTimesContributed
    });
}

// Sync config
setupConfig();

export default Config;
