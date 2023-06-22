import * as CompileConfig from "../config.json";
import * as invidiousList from "../ci/invidiouslist.json";
import { Category, CategorySelection, CategorySkipOption, NoticeVisbilityMode, PreviewBarOption, SponsorTime, VideoID, SponsorHideType } from "./types";
import { Keybind, ProtoConfig, keybindEquals } from "@ajayyy/maze-utils/lib/config";
import { HashedValue } from "@ajayyy/maze-utils/lib/hash";

export interface Permission {
    canSubmit: boolean;
}

interface SBConfig {
    userID: string;
    isVip: boolean;
    permissions: Record<Category, Permission>;
    /* Contains unsubmitted segments that the user has created. */
    unsubmittedSegments: Record<string, SponsorTime[]>;
    defaultCategory: Category;
    renderSegmentsAsChapters: boolean;
    whitelistedChannels: string[];
    forceChannelCheck: boolean;
    minutesSaved: number;
    skipCount: number;
    sponsorTimesContributed: number;
    submissionCountSinceCategories: number; // New count used to show the "Read The Guidelines!!" message
    showTimeWithSkips: boolean;
    disableSkipping: boolean;
    muteSegments: boolean;
    fullVideoSegments: boolean;
    fullVideoLabelsOnThumbnails: boolean;
    manualSkipOnFullVideo: boolean;
    trackViewCount: boolean;
    trackViewCountInPrivate: boolean;
    trackDownvotes: boolean;
    dontShowNotice: boolean;
    noticeVisibilityMode: NoticeVisbilityMode;
    hideVideoPlayerControls: boolean;
    hideInfoButtonPlayerControls: boolean;
    hideDeleteButtonPlayerControls: boolean;
    hideUploadButtonPlayerControls: boolean;
    hideSkipButtonPlayerControls: boolean;
    hideDiscordLaunches: number;
    hideDiscordLink: boolean;
    invidiousInstances: string[];
    supportInvidious: boolean;
    serverAddress: string;
    minDuration: number;
    skipNoticeDuration: number;
    audioNotificationOnSkip: boolean;
    checkForUnlistedVideos: boolean;
    testingServer: boolean;
    refetchWhenNotFound: boolean;
    ytInfoPermissionGranted: boolean;
    allowExpirements: boolean;
    showDonationLink: boolean;
    showPopupDonationCount: number;
    showUpsells: boolean;
    showNewFeaturePopups: boolean;
    donateClicked: number;
    autoHideInfoButton: boolean;
    autoSkipOnMusicVideos: boolean;
    colorPalette: {
        red: string;
        white: string;
        locked: string;
    };
    scrollToEditTimeUpdate: boolean;
    categoryPillUpdate: boolean;
    showChapterInfoMessage: boolean;
    darkMode: boolean;
    showCategoryGuidelines: boolean;
    showCategoryWithoutPermission: boolean;
    showSegmentNameInChapterBar: boolean;
    useVirtualTime: boolean;
    showSegmentFailedToFetchWarning: boolean;
    allowScrollingToEdit: boolean;
    deArrowInstalled: boolean;
    showDeArrowPromotion: boolean;

    // Used to cache calculated text color info
    categoryPillColors: {
        [key in Category]: {
            lastColor: string;
            textColor: string;
        }
    };

    skipKeybind: Keybind;
    startSponsorKeybind: Keybind;
    submitKeybind: Keybind;
    nextChapterKeybind: Keybind;
    previousChapterKeybind: Keybind;

    // What categories should be skipped
    categorySelections: CategorySelection[];

    payments: {
        licenseKey: string;
        lastCheck: number;
        lastFreeCheck: number;
        freeAccess: boolean;
        chaptersAllowed: boolean;
    };

    // Preview bar
    barTypes: {
        "preview-chooseACategory": PreviewBarOption;
        "sponsor": PreviewBarOption;
        "preview-sponsor": PreviewBarOption;
        "selfpromo": PreviewBarOption;
        "preview-selfpromo": PreviewBarOption;
        "exclusive_access": PreviewBarOption;
        "interaction": PreviewBarOption;
        "preview-interaction": PreviewBarOption;
        "intro": PreviewBarOption;
        "preview-intro": PreviewBarOption;
        "outro": PreviewBarOption;
        "preview-outro": PreviewBarOption;
        "preview": PreviewBarOption;
        "preview-preview": PreviewBarOption;
        "music_offtopic": PreviewBarOption;
        "preview-music_offtopic": PreviewBarOption;
        "poi_highlight": PreviewBarOption;
        "preview-poi_highlight": PreviewBarOption;
        "filler": PreviewBarOption;
        "preview-filler": PreviewBarOption;
    };
}

export type VideoDownvotes = { segments: { uuid: HashedValue; hidden: SponsorHideType }[]; lastAccess: number };

interface SBStorage {
    /* VideoID prefixes to UUID prefixes */
    downvotedSegments: Record<VideoID & HashedValue, VideoDownvotes>;
    navigationApiAvailable: boolean;
}

class ConfigClass extends ProtoConfig<SBConfig, SBStorage> {
    resetToDefault() {
        chrome.storage.sync.set({
            ...this.syncDefaults,
            userID: this.config.userID,
            minutesSaved: this.config.minutesSaved,
            skipCount: this.config.skipCount,
            sponsorTimesContributed: this.config.sponsorTimesContributed
        });
    }
}

function migrateOldSyncFormats(config: SBConfig) {
    if (!config["chapterCategoryAdded"]) {
        config["chapterCategoryAdded"] = true;

        if (!config.categorySelections.some((s) => s.name === "chapter")) {
            config.categorySelections.push({
                name: "chapter" as Category,
                option: CategorySkipOption.ShowOverlay
            });
    
            config.categorySelections = config.categorySelections;
        }
    }

    if (config["segmentTimes"]) {
        const unsubmittedSegments = {};
        for (const item of config["segmentTimes"]) {
            unsubmittedSegments[item[0]] = item[1];
        }

        chrome.storage.sync.remove("segmentTimes", () => config.unsubmittedSegments = unsubmittedSegments);
    }

    if (config["exclusive_accessCategoryAdded"] !== undefined) {
        chrome.storage.sync.remove("exclusive_accessCategoryAdded");
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
        config["skipKeybind"] = { key: config["skipKeybind"] };
    }

    if (typeof config["startSponsorKeybind"] == "string") {
        config["startSponsorKeybind"] = { key: config["startSponsorKeybind"] };
    }

    if (typeof config["submitKeybind"] == "string") {
        config["submitKeybind"] = { key: config["submitKeybind"] };
    }

    // Unbind key if it matches a previous one set by the user (should be ordered oldest to newest)
    const keybinds = ["skipKeybind", "startSponsorKeybind", "submitKeybind"];
    for (let i = keybinds.length - 1; i >= 0; i--) {
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
    if (!config["supportInvidious"] && config["invidiousInstances"].length < invidiousList.length) {
        config["invidiousInstances"] = [...new Set([...invidiousList, ...config["invidiousInstances"]])];
    }

    if (config["lastIsVipUpdate"]) {
        chrome.storage.sync.remove("lastIsVipUpdate");
    }
}

const syncDefaults = {
    userID: null,
    isVip: false,
    permissions: {},
    unsubmittedSegments: {},
    defaultCategory: "chooseACategory" as Category,
    renderSegmentsAsChapters: false,
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
    fullVideoLabelsOnThumbnails: true,
    manualSkipOnFullVideo: false,
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
    showUpsells: true,
    showNewFeaturePopups: true,
    donateClicked: 0,
    autoHideInfoButton: true,
    autoSkipOnMusicVideos: false,
    scrollToEditTimeUpdate: false, // false means the tooltip will be shown
    categoryPillUpdate: false,
    showChapterInfoMessage: true,
    darkMode: true,
    showCategoryGuidelines: true,
    showCategoryWithoutPermission: false,
    showSegmentNameInChapterBar: true,
    useVirtualTime: true,
    showSegmentFailedToFetchWarning: true,
    allowScrollingToEdit: true,
    deArrowInstalled: false,
    showDeArrowPromotion: true,

    categoryPillColors: {},

    /**
     * Default keybinds should not set "code" as that's gonna be different based on the user's locale. They should also only use EITHER ctrl OR alt modifiers (or none).
     * Using ctrl+alt, or shift may produce a different character that we will not be able to recognize in different locales.
     * The exception for shift is letters, where it only capitalizes. So shift+A is fine, but shift+1 isn't.
     * Don't forget to add the new keybind to the checks in "KeybindDialogComponent.isKeybindAvailable()" and in "migrateOldFormats()"!
     *      TODO: Find a way to skip having to update these checks. Maybe storing keybinds in a Map?
     */
    skipKeybind: { key: "Enter" },
    startSponsorKeybind: { key: ";" },
    submitKeybind: { key: "'" },
    nextChapterKeybind: { key: "ArrowRight", ctrl: true },
    previousChapterKeybind: { key: "ArrowLeft", ctrl: true },

    categorySelections: [{
        name: "sponsor" as Category,
        option: CategorySkipOption.AutoSkip
    }, {
        name: "poi_highlight" as Category,
        option: CategorySkipOption.ManualSkip
    }, {
        name: "exclusive_access" as Category,
        option: CategorySkipOption.ShowOverlay
    }, {
        name: "chapter" as Category,
        option: CategorySkipOption.ShowOverlay
    }],

    payments: {
        licenseKey: null,
        lastCheck: 0,
        lastFreeCheck: 0,
        freeAccess: false,
        chaptersAllowed: false
    },

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
};

const localDefaults = {
    downvotedSegments: {},
    navigationApiAvailable: null
};

const Config = new ConfigClass(syncDefaults, localDefaults, migrateOldSyncFormats);
export default Config;