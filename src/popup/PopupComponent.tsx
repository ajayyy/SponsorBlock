import * as React from "react";
import { YourWorkComponent } from "./YourWorkComponent";
// import { ToggleOptionComponent } from "./ToggleOptionComponent";
// import { FormattingOptionsComponent } from "./FormattingOptionsComponent";
import { isSafari } from "../../maze-utils/src/config";
import { showDonationLink } from "../utils/configUtils";
import Config from "../config";
import { GetChannelIDResponse, IsInfoFoundMessageResponse, Message, MessageResponse, PopupMessage } from "../messageTypes";
import { AnimationUtils } from "../../maze-utils/src/animationUtils";
import { SegmentListComponent } from "./SegmentListComponent";
import { ActionType, SegmentUUID, SponsorSourceType, SponsorTime } from "../types";
import { SegmentSubmissionComponent } from "./SegmentSubmissionComponent";

export enum LoadingStatus {
    Loading,
    SegmentsFound,
    NoSegmentsFound,
    ConnectionError,
    StillLoading,
    NoVideo
}

export interface LoadingData {
    status: LoadingStatus;
    code?: number;
}

let loadRetryCount = 0;

export const PopupComponent = () => {
    const [status, setStatus] = React.useState<LoadingData>({
        status: LoadingStatus.Loading
    });
    const [extensionEnabled, setExtensionEnabled] = React.useState(!Config.config!.disableSkipping);
    const [channelWhitelisted, setChannelWhitelisted] = React.useState<boolean | null>(null);
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
            setChannelWhitelisted,
            setVideoID,
            setCurrentTime,
            setSegments,
            setLoopedChapter
        });

        setupComPort({
            setStatus,
            setChannelWhitelisted,
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

                loadSegments({
                    updating: true,
                    setStatus,
                    setChannelWhitelisted,
                    setVideoID,
                    setCurrentTime,
                    setSegments,
                    setLoopedChapter
                }).then(() => stopAnimation());
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
                {/* github: mbledkowski/toggle-switch */}
                {channelWhitelisted !== null && (
                    <label id="whitelistButton" htmlFor="whitelistToggle" className="toggleSwitchContainer sbControlsMenu-item" role="button" tabIndex={0}>
                        <input type="checkbox" 
                            style={{ "display": "none" }} 
                            id="whitelistToggle" 
                            checked={channelWhitelisted}
                            onChange={async (e) => {
                                const response = await sendMessage({ message: 'getChannelID' }) as GetChannelIDResponse;
                                if (!response.channelID) {
                                    if (response.isYTTV) {
                                        alert(chrome.i18n.getMessage("yttvNoChannelWhitelist"));
                                    } else {
                                        alert(chrome.i18n.getMessage("channelDataNotFound") + " https://github.com/ajayyy/SponsorBlock/issues/753");
                                    }

                                    return;
                                }

                                const whitelistedChannels = Config.config.whitelistedChannels ?? [];
                                if (e.target.checked) {
                                    whitelistedChannels.splice(whitelistedChannels.indexOf(response.channelID), 1);
                                } else {
                                    whitelistedChannels.push(response.channelID);
                                }
                                Config.config.whitelistedChannels = whitelistedChannels;

                                setChannelWhitelisted(!e.target.checked);
                                if (!Config.config.forceChannelCheck) setShowForceChannelCheckWarning(true);

                                // Send a message to the client
                                sendMessage({
                                    message: 'whitelistChange',
                                    value: !e.target.checked
                                });

                            }}/>
                        <svg viewBox="0 0 24 24" width="23" height="23" className={"SBWhitelistIcon sbControlsMenu-itemIcon " + (channelWhitelisted ? " rotated" : "")}>
                            <path d="M24 10H14V0h-4v10H0v4h10v10h4V14h10z" />
                        </svg>
                        <span id="whitelistChannel" className={channelWhitelisted ? " hidden" : ""}>
                            {chrome.i18n.getMessage("whitelistChannel")}
                        </span>
                        <span id="unwhitelistChannel" className={!channelWhitelisted ? " hidden" : ""}>
                            {chrome.i18n.getMessage("removeFromWhitelist")}
                        </span>
                    </label>
                )}
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
                !Config.config.cleanPopup &&
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
            return chrome.i18n.getMessage("connectionError") + status.code;
        case LoadingStatus.StillLoading:
            return chrome.i18n.getMessage("segmentsStillLoading");
        case LoadingStatus.NoVideo:
            return chrome.i18n.getMessage("noVideoID");
    }
}

interface SegmentsLoadedProps {
    setStatus: (status: LoadingData) => void;
    setChannelWhitelisted: (whitelisted: boolean | null) => void;
    setVideoID: (videoID: string | null) => void;
    setCurrentTime: (time: number) => void;
    setSegments: (segments: SponsorTime[]) => void;
    setLoopedChapter: (loopedChapter: SegmentUUID | null) => void;
}

interface LoadSegmentsProps extends SegmentsLoadedProps {
    updating: boolean;
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
    props.setCurrentTime(response.time);
    props.setChannelWhitelisted(response.channelWhitelisted);
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

interface ComPortProps extends SegmentsLoadedProps {
}

function setupComPort(props: ComPortProps): void {
    const port = chrome.runtime.connect({ name: "popup" });
    port.onDisconnect.addListener(() => setupComPort(props));
    port.onMessage.addListener((msg) => onMessage(props, msg));
}

function onMessage(props: ComPortProps, msg: PopupMessage) {
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
            props.setChannelWhitelisted(msg.whitelisted);
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