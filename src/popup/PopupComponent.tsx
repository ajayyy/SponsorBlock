import * as React from "react";
import { YourWorkComponent } from "./YourWorkComponent";
import { isSafari } from "../../maze-utils/src/config";
import { showDonationLink } from "../utils/configUtils";
import Config, { ConfigurationID, generateDebugDetails } from "../config";
import { IsInfoFoundMessageResponse, LogResponse, Message, MessageResponse, PopupMessage } from "../messageTypes";
import { AnimationUtils } from "../../maze-utils/src/animationUtils";
import { SegmentListComponent } from "./SegmentListComponent";
import { ActionType, SegmentUUID, SponsorSourceType, SponsorTime } from "../types";
import { SegmentSubmissionComponent } from "./SegmentSubmissionComponent";
import { copyToClipboardPopup } from "./popupUtils";
import { getSkipProfileID, getSkipProfileIDForChannel, getSkipProfileIDForTab, getSkipProfileIDForTime, getSkipProfileIDForVideo, setCurrentTabSkipProfile } from "../utils/skipProfiles";
import { SelectOptionComponent } from "../components/options/SelectOptionComponent";
import * as Video from "../../maze-utils/src/video";

export enum LoadingStatus {
    Loading,
    SegmentsFound,
    NoSegmentsFound,
    ConnectionError,
    JSError,
    StillLoading,
    NoVideo
}

export interface LoadingData {
    status: LoadingStatus;
    code?: number;
    error?: Error | string;
}

type SkipProfileAction = "forJustThisVideo" | "forThisChannel" | "forThisTab" | "forAnHour" | null;
interface SkipProfileOption {
    name: SkipProfileAction;
    active: () => boolean;
}

interface SegmentsLoadedProps {
    setStatus: (status: LoadingData) => void;
    setVideoID: (videoID: string | null) => void;
    setCurrentTime: (time: number) => void;
    setSegments: (segments: SponsorTime[]) => void;
    setLoopedChapter: (loopedChapter: SegmentUUID | null) => void;
}

interface LoadSegmentsProps extends SegmentsLoadedProps {
    updating: boolean;
}

interface SkipProfileRadioButtonsProps {
    selected: SkipProfileAction;
    setSelected: (s: SkipProfileAction, updateConfig: boolean) => void;
    disabled: boolean;
    configID: ConfigurationID | null;
    videoID: string;
}

interface SkipOptionActionComponentProps {
    selected: boolean;
    setSelected: (s: boolean) => void;
    highlighted: boolean;
    disabled: boolean;
    overridden: boolean;
    label: string;
}

let loadRetryCount = 0;

export const PopupComponent = () => {
    const [status, setStatus] = React.useState<LoadingData>({
        status: LoadingStatus.Loading
    });
    const [extensionEnabled, setExtensionEnabled] = React.useState(!Config.config!.disableSkipping);
    const [showForceChannelCheckWarning, setShowForceChannelCheckWarning] = React.useState(false);
    const [showNoticeButton, setShowNoticeButton] = React.useState(Config.config!.dontShowNotice);

    const [currentTime, setCurrentTime] = React.useState<number>(0);
    const [segments, setSegments] = React.useState<SponsorTime[]>([]);
    const [loopedChapter, setLoopedChapter] = React.useState<SegmentUUID | null>(null);

    const [videoID, setVideoID] = React.useState<string | null>(null);

    React.useEffect(() => {
        loadSegments({
            updating: false,
            setStatus,
            setVideoID,
            setCurrentTime,
            setSegments,
            setLoopedChapter
        });

        setupComPort({
            setStatus,
            setVideoID,
            setCurrentTime,
            setSegments,
            setLoopedChapter
        });

        forwardClickEvents(sendMessage);
    }, []);

    return (
        <div id="sponsorblockPopup">
            {
                window !== window.top &&
                <button id="sbCloseButton" title="__MSG_closePopup__" className="sbCloseButton" onClick={() => {
                    sendMessage({ message: "closePopup" });
                }}>
                    <img src="icons/close.png" width="15" height="15" alt="Close icon"/>
                </button>
            }

            {
                Config.config!.testingServer &&
                <div id="sbBetaServerWarning"
                        title={chrome.i18n.getMessage("openOptionsPage")}
                        onClick={() => {
                            chrome.runtime.sendMessage({ "message": "openConfig", "hash": "advanced" });
                        }}>
                    {chrome.i18n.getMessage("betaServerWarning")}
                </div>
            }

            <header className={"sbPopupLogo " + (Config.config.cleanPopup ? "hidden" : "")}>
                <img src="icons/IconSponsorBlocker256px.png" alt="SponsorBlock Logo" width="40" height="40" id="sponsorBlockPopupLogo"/>
                <p className="u-mZ">
                    SponsorBlock
                </p>
            </header>

            <p id="videoFound" 
                    className={"u-mZ grey-text " + (Config.config.cleanPopup ? "cleanPopupMargin" : "")}>
                {getVideoStatusText(status)}
            </p>

            <button id="refreshSegmentsButton" title={chrome.i18n.getMessage("refreshSegments")} onClick={(e) => {
                const stopAnimation = AnimationUtils.applyLoadingAnimation(e.currentTarget, 0.3);

                sendMessage({ message: "refreshSegments" }).then(() => {
                    loadSegments({
                        updating: true,
                        setStatus,
                        setVideoID,
                        setCurrentTime,
                        setSegments,
                        setLoopedChapter
                    }).then(() => stopAnimation());
                });

            }}>
                <img src="/icons/refresh.svg" alt="Refresh icon" id="refreshSegments" />
            </button>

            <SegmentListComponent
                videoID={videoID}
                currentTime={currentTime}
                status={status.status}
                segments={segments}
                loopedChapter={loopedChapter}
                sendMessage={sendMessage} />

            {/* Toggle Box */}
            <div className="sbControlsMenu">
                {
                    videoID &&
                        <SkipProfileButton
                            videoID={videoID}
                            setShowForceChannelCheckWarning={setShowForceChannelCheckWarning}
                        />
                }
                <label id="disableExtension" htmlFor="toggleSwitch" className="toggleSwitchContainer sbControlsMenu-item" role="button" tabIndex={0}>
                    <span className="toggleSwitchContainer-switch">
                        <input type="checkbox" 
                            style={{ "display": "none" }} 
                            id="toggleSwitch" 
                            checked={extensionEnabled}
                            onChange={(e) => {
                                Config.config!.disableSkipping = !e.target.checked;
                                setExtensionEnabled(e.target.checked)
                            }}/>
                        <span className="switchBg shadow"></span>
                        <span className="switchBg white"></span>
                        <span className="switchBg green"></span>
                        <span className="switchDot"></span>
                    </span>
                    <span id="disableSkipping" className={extensionEnabled ? " hidden" : ""}>
                        {chrome.i18n.getMessage("enableSkipping")}
                    </span>
                    <span id="enableSkipping" className={!extensionEnabled ? " hidden" : ""}>
                        {chrome.i18n.getMessage("disableSkipping")}
                    </span>
                </label>
                <button id="optionsButton" 
                    className="sbControlsMenu-item" 
                    title={chrome.i18n.getMessage("Options")}
                    onClick={() => {
                        chrome.runtime.sendMessage({ "message": "openConfig" });
                    }}>
                <img src="/icons/settings.svg" alt="Settings icon" width="23" height="23" className="sbControlsMenu-itemIcon" id="sbPopupIconSettings" />
                    {chrome.i18n.getMessage("Options")}
                </button>
            </div>

            {
                showForceChannelCheckWarning &&
                <a id="whitelistForceCheck" onClick={() => {
                    chrome.runtime.sendMessage({ "message": "openConfig", "hash": "behavior" });
                }}>
                    {chrome.i18n.getMessage("forceChannelCheckPopup")}
                </a>
            }

            {
                !Config.config.cleanPopup && !Config.config.hideSegmentCreationInPopup &&
                <SegmentSubmissionComponent
                    videoID={videoID || ""}
                    status={status.status}
                    sendMessage={sendMessage} />
            }
            

            {/* Your Work box */}
            {
                !Config.config.cleanPopup &&
                <YourWorkComponent/>
            }

            {/* Footer */}
            {
                !Config.config.cleanPopup &&
                <footer id="sbFooter">
                    <a id="helpButton"
                        onClick={() => {
                            chrome.runtime.sendMessage({ "message": "openHelp" });
                        }}>
                            {chrome.i18n.getMessage("help")}
                    </a>
                    <a href="https://sponsor.ajay.app" target="_blank" rel="noreferrer">
                        {chrome.i18n.getMessage("website")}
                    </a>
                    <a href="https://sponsor.ajay.app/stats" target="_blank" rel="noreferrer" className={isSafari() ? " hidden" : ""}>
                        {chrome.i18n.getMessage("viewLeaderboard")}
                    </a>
                    <a href="https://sponsor.ajay.app/donate" target="_blank" rel="noreferrer" className={!showDonationLink() ? " hidden" : ""} onClick={() => {
                        Config.config!.donateClicked = Config.config!.donateClicked + 1;
                    }}>
                        {chrome.i18n.getMessage("Donate")}
                    </a>
                    <br />
                    <a href="https://github.com/ajayyy/SponsorBlock" target="_blank" rel="noreferrer">
                        GitHub
                    </a>
                    <a href="https://discord.gg/SponsorBlock" target="_blank" rel="noreferrer">
                        Discord
                    </a>
                    <a href="https://matrix.to/#/#sponsor:ajay.app?via=ajay.app&via=matrix.org&via=mozilla.org" target="_blank" rel="noreferrer">
                        Matrix
                    </a>
                    <a href="https://wiki.sponsor.ajay.app/w/Guidelines" target="_blank" rel="noreferrer">
                        {chrome.i18n.getMessage("guidelines")}
                    </a>
                    <br />
                    <a id="debugLogs"
                            onClick={async () => {
                                const logs = await sendMessage({ message: "getLogs" }) as LogResponse;

                                copyToClipboardPopup(`${generateDebugDetails()}\n\nWarn:\n${logs.warn.join("\n")}\n\nDebug:\n${logs.debug.join("\n")}`, sendMessage);
                            }}>
                        {chrome.i18n.getMessage("copyDebugLogs")}
                    </a>
                </footer>
            }

            {
                showNoticeButton &&
                <button id="showNoticeAgain" onClick={() => {
                    Config.config!.dontShowNotice = false;
                    setShowNoticeButton(false);
                }}>
                    { chrome.i18n.getMessage("showNotice") }
                </button>
            }
        </div>
    );
};

function getVideoStatusText(status: LoadingData): string {
    switch (status.status) {
        case LoadingStatus.Loading:
            return chrome.i18n.getMessage("Loading");
        case LoadingStatus.SegmentsFound:
            return chrome.i18n.getMessage("sponsorFound");
        case LoadingStatus.NoSegmentsFound:
            return chrome.i18n.getMessage("sponsor404");
        case LoadingStatus.ConnectionError:
            return `${chrome.i18n.getMessage("connectionError")} ${chrome.i18n.getMessage("errorCode").replace("{code}", `${status.code}`)}`;
        case LoadingStatus.JSError:
            return `${chrome.i18n.getMessage("connectionError")} ${status.error}`;
        case LoadingStatus.StillLoading:
            return chrome.i18n.getMessage("segmentsStillLoading");
        case LoadingStatus.NoVideo:
            return chrome.i18n.getMessage("noVideoID");
    }
}

async function loadSegments(props: LoadSegmentsProps): Promise<void> {
    const response = await sendMessage({ message: "isInfoFound", updating: props.updating }) as IsInfoFoundMessageResponse;

    if (response && response.videoID) {
        segmentsLoaded(response, props);
    } else {
        // Handle error if it exists
        chrome.runtime.lastError;

        props.setStatus({
            status: LoadingStatus.NoVideo,
        });

        if (!props.updating) {
            loadRetryCount++;
            if (loadRetryCount < 6) {
                setTimeout(() => loadSegments(props), 100 * loadRetryCount);
            }
        }
    }
}

function segmentsLoaded(response: IsInfoFoundMessageResponse, props: SegmentsLoadedProps): void {
    if (response.found) {
        props.setStatus({
            status: LoadingStatus.SegmentsFound
        });
    } else if (typeof response.status !== "number") {
        props.setStatus({
            status: LoadingStatus.JSError,
            error: response.status,
        })
    } else if (response.status === 404 || response.status === 200) {
        props.setStatus({
            status: LoadingStatus.NoSegmentsFound
        });
    } else if (response.status) {
        props.setStatus({
            status: LoadingStatus.ConnectionError,
            code: response.status
        });
    } else {
        props.setStatus({
            status: LoadingStatus.StillLoading
        });
    }

    
    props.setVideoID(response.videoID);
    Video.setVideoID(response.videoID as Video.VideoID);
    props.setCurrentTime(response.time);
    Video.setChanelIDInfo(response.channelID, response.channelAuthor);
    setCurrentTabSkipProfile(response.currentTabSkipProfileID);
    props.setSegments((response.sponsorTimes || [])
        .filter((segment) => segment.source === SponsorSourceType.Server)
        .sort((a, b) => b.segment[1] - a.segment[1])
        .sort((a, b) => a.segment[0] - b.segment[0])
        .sort((a, b) => a.actionType === ActionType.Full ? -1 : b.actionType === ActionType.Full ? 1 : 0));
    props.setLoopedChapter(response.loopedChapter);
}

function sendMessage(request: Message): Promise<MessageResponse> {
    return new Promise((resolve) => {
        if (chrome.tabs) {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => chrome.tabs.sendMessage(tabs[0].id, request, resolve));
        } else {
            chrome.runtime.sendMessage({ message: "tabs", data: request }, resolve);
        }
    });
}

function setupComPort(props: SegmentsLoadedProps): void {
    const port = chrome.runtime.connect({ name: "popup" });
    port.onDisconnect.addListener(() => setupComPort(props));
    port.onMessage.addListener((msg) => onMessage(props, msg));
}

function onMessage(props: SegmentsLoadedProps, msg: PopupMessage) {
    switch (msg.message) {
        case "time":
            props.setCurrentTime(msg.time);
            break;
        case "infoUpdated":
            segmentsLoaded(msg, props);
            break;
        case "videoChanged":
            props.setStatus({
                status: LoadingStatus.StillLoading
            });
            props.setVideoID(msg.videoID);
            Video.setVideoID(msg.videoID as Video.VideoID);
            Video.setChanelIDInfo(msg.channelID, msg.channelAuthor);
            props.setSegments([]);
            break;
    }
}

function forwardClickEvents(sendMessage: (request: Message) => Promise<MessageResponse>): void {
    if (window !== window.top) {
        document.addEventListener("keydown", (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT"
                || target.tagName === "TEXTAREA"
                || e.key === "ArrowUp"
                || e.key === "ArrowDown") {
                return;
            }

            if (e.key === " ") {
                // No scrolling
                e.preventDefault();
            }

            sendMessage({
                message: "keydown",
                key: e.key,
                keyCode: e.keyCode,
                code: e.code,
                which: e.which,
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                metaKey: e.metaKey
            });
        });
    }
}

// Copy over styles from parent window
window.addEventListener("message", async (e): Promise<void> => {
    if (e.source !== window.parent) return;
    if (e.origin.endsWith(".youtube.com") && e.data && e.data?.type === "style") {
        const style = document.createElement("style");
        style.textContent = e.data.css;
        document.head.appendChild(style);
    }
});

function SkipProfileButton(props: {videoID: string; setShowForceChannelCheckWarning: (v: boolean) => void}): JSX.Element {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const channelSkipProfileSet = getSkipProfileIDForChannel() !== null;
    const skipProfileSet = getSkipProfileID() !== null;

    React.useEffect(() => {
        setMenuOpen(false);
    }, [props.videoID]);

    return (
        <>
            <label id="skipProfileButton" 
                    htmlFor="skipProfileToggle"
                    className="toggleSwitchContainer sbControlsMenu-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                        if (menuOpen && !Config.config.forceChannelCheck && getSkipProfileID() !== null) {
                            props.setShowForceChannelCheckWarning(true);
                        }

                        setMenuOpen(!menuOpen);
                    }}>
                <svg viewBox="0 0 24 24" width="23" height="23" className={"SBWhitelistIcon sbControlsMenu-itemIcon " + (menuOpen ? " rotated" : "")}>
                    <path d="M24 10H14V0h-4v10H0v4h10v10h4V14h10z" />
                </svg>
                <span id="whitelistChannel" className={!(!menuOpen && !channelSkipProfileSet && !skipProfileSet) ? " hidden" : ""}>
                    {chrome.i18n.getMessage("addChannelToSkipProfile")}
                </span>
                <span id="whitelistChannel" className={!(!menuOpen && channelSkipProfileSet) ? " hidden" : ""}>
                    {chrome.i18n.getMessage("editChannelsSkipProfile")}
                </span>
                <span id="whitelistChannel" className={!(!menuOpen && !channelSkipProfileSet && skipProfileSet) ? " hidden" : ""}>
                    {chrome.i18n.getMessage("editActiveSkipProfile")}
                </span>
                <span id="unwhitelistChannel" className={!menuOpen ? " hidden" : ""}>
                    {chrome.i18n.getMessage("closeSkipProfileMenu")}
                </span>
            </label>

            {
                props.videoID &&
                <SkipProfileMenu open={menuOpen} videoID={props.videoID} />
            }
        </>
    );
}

const skipProfileOptions: SkipProfileOption[] = [{
        name: "forAnHour",
        active: () => getSkipProfileIDForTime() !== null
    }, {
        name: "forThisTab",
        active: () => getSkipProfileIDForTab() !== null
    }, {
        name: "forJustThisVideo",
        active: () => getSkipProfileIDForVideo() !== null
    }, {
        name: "forThisChannel",
        active: () => getSkipProfileIDForChannel() !== null
    }];

function SkipProfileMenu(props: {open: boolean; videoID: string}): JSX.Element {
    const [configID, setConfigID] = React.useState<ConfigurationID | null>(null);
    const [selectedSkipProfileAction, setSelectedSkipProfileAction] = React.useState<SkipProfileAction>(null);
    const [allSkipProfiles, setAllSkipProfiles] = React.useState(Object.entries(Config.local!.skipProfiles));

    React.useEffect(() => {
        if (props.open) {
            const channelInfo = Video.getChannelIDInfo();
            if (!channelInfo) {
                if (Video.isOnYTTV()) {
                    alert(chrome.i18n.getMessage("yttvNoChannelWhitelist"));
                } else {
                    alert(chrome.i18n.getMessage("channelDataNotFound") + " https://github.com/ajayyy/SponsorBlock/issues/753");
                }
            }
        }

        setConfigID(getSkipProfileID());
    }, [props.open, props.videoID]);

    React.useEffect(() => {
        Config.configLocalListeners.push(() => {
            setAllSkipProfiles(Object.entries(Config.local!.skipProfiles));
        });
    }, []);

    return (
        <div id="skipProfileMenu" className={`${!props.open ? " hidden" : ""}`}
            aria-label={chrome.i18n.getMessage("SkipProfileMenu")}>
            <div style={{position: "relative"}}>
                <SelectOptionComponent
                    id="sbSkipProfileSelection"
                    title={chrome.i18n.getMessage("SelectASkipProfile")}
                    onChange={(value) => {
                        if (value === "new") {
                            chrome.runtime.sendMessage({ message: "openConfig", hash: "newProfile" });
                            return;
                        }
                        
                        const configID = value === "null" ? null : value as ConfigurationID;
                        setConfigID(configID);
                        if (configID === null) {
                            setSelectedSkipProfileAction(null);
                        }

                        if (selectedSkipProfileAction) {
                            updateSkipProfileSetting(selectedSkipProfileAction, configID);

                            if (configID === null) {
                                for (const option of skipProfileOptions) {
                                    if (option.name !== selectedSkipProfileAction && option.active()) {
                                        updateSkipProfileSetting(option.name, null);
                                    }
                                }
                            }
                        }
                    }}
                    value={configID ?? "null"}
                    options={[{
                        value: "null",
                        label: chrome.i18n.getMessage("DefaultConfiguration")
                    }].concat(allSkipProfiles.map(([key, value]) => ({
                        value: key,
                        label: value.name
                    }))).concat([{
                        value: "new",
                        label: chrome.i18n.getMessage("CreateNewConfiguration")
                    }])}
                />

                <SkipProfileRadioButtons
                    selected={selectedSkipProfileAction}
                    setSelected={(s, updateConfig) => {
                        if (updateConfig) {
                            if (s === null) {
                                updateSkipProfileSetting(selectedSkipProfileAction, null);
                            } else {
                                updateSkipProfileSetting(s, configID);
                            }
                        } else if (s !== null) {
                            setConfigID(getSkipProfileID());
                        }

                        setSelectedSkipProfileAction(s);
                    }}
                    disabled={configID === null}
                    configID={configID}
                    videoID={props.videoID}
                />
            </div>
        </div>
    );
}

function SkipProfileRadioButtons(props: SkipProfileRadioButtonsProps): JSX.Element {
    const result: JSX.Element[] = [];

    React.useEffect(() => {
        if (props.configID === null) {
            props.setSelected(null, false);
        } else {
            for (const option of skipProfileOptions) {
                if (option.active()) {
                    if (props.selected !== option.name) {
                        props.setSelected(option.name, false);
                    }

                    return;
                }
            }
        }
    }, [props.configID, props.videoID, props.selected]);

    let alreadySelected = false;
    for (const option of skipProfileOptions) {
        const highlighted = option.active() && props.selected !== option.name;
        const overridden = !highlighted && alreadySelected;
        result.push(
            <SkipOptionActionComponent
                highlighted={highlighted}
                label={chrome.i18n.getMessage(`skipProfile_${option.name}`)}
                selected={props.selected === option.name}
                overridden={overridden}
                disabled={props.disabled || overridden}
                key={option.name}
                setSelected={(s) => {
                    props.setSelected(s ? option.name : null, true);
                }}/>
        );

        if (props.selected === option.name) {
            alreadySelected = true;
        }
    }

    return <div id="skipProfileActions">
        {result}
    </div>
}

function SkipOptionActionComponent(props: SkipOptionActionComponentProps): JSX.Element {
    let title = "";
    if (props.selected) {
        title = chrome.i18n.getMessage("clickToNotApplyThisProfile");
    } else if ((props.highlighted && !props.disabled) || props.overridden) {
        title = chrome.i18n.getMessage("skipProfileBeingOverriddenByHigherPriority");
    } else if (!props.highlighted && !props.disabled) {
        title = chrome.i18n.getMessage("clickToApplyThisProfile");
    } else if (props.disabled) {
        title = chrome.i18n.getMessage("selectASkipProfileFirst");
    }

    return (
        <div className={`skipOptionAction ${props.selected ? "selected" : ""} ${props.highlighted ? "highlighted" : ""} ${props.disabled ? "disabled" : ""}`}
            title={title}
            role="button"
            tabIndex={0}
            aria-pressed={props.selected}
            onClick={() => {
                // Need to uncheck or disable a higher priority option first
                if (!props.disabled && !props.highlighted) {
                    props.setSelected(!props.selected);
                }
            }}>
            {props.label}
        </div>
    );
}

function updateSkipProfileSetting(action: SkipProfileAction, configID: ConfigurationID | null) {
    switch (action) {
        case "forAnHour":
            Config.local!.skipProfileTemp = configID ? { time: Date.now(), configID } : null;
            break;
        case "forThisTab":
            setCurrentTabSkipProfile(configID);

            sendMessage({
                message: "setCurrentTabSkipProfile",
                configID
            });
            break;
        case "forJustThisVideo":
            if (configID) {
                Config.local!.channelSkipProfileIDs[Video.getVideoID()!] = configID;
            } else {
                delete Config.local!.channelSkipProfileIDs[Video.getVideoID()!];
            }

            Config.forceLocalUpdate("channelSkipProfileIDs");
            break;
        case "forThisChannel": {
            const channelInfo = Video.getChannelIDInfo();

            if (configID) {
                Config.local!.channelSkipProfileIDs[channelInfo.id] = configID;
                delete Config.local!.channelSkipProfileIDs[channelInfo.author];
            } else {
                delete Config.local!.channelSkipProfileIDs[channelInfo.id];
                delete Config.local!.channelSkipProfileIDs[channelInfo.author];
            }

            Config.forceLocalUpdate("channelSkipProfileIDs");
            break;
        }
    }
}