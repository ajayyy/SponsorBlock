import * as React from "react";
import { getHash } from "../../maze-utils/src/hash";
import { formatJSErrorMessage, getShortErrorMessage } from "../../maze-utils/src/formating";
import Config from "../config";
import { asyncRequestToServer } from "../utils/requests";
import PencilIcon from "../svg-icons/pencilIcon";
import ClipboardIcon from "../svg-icons/clipboardIcon";
import CheckIcon from "../svg-icons/checkIcon";
import { showDonationLink } from "../utils/configUtils";
import { FetchResponse, logRequest } from "../../maze-utils/src/background-request-proxy";

export const YourWorkComponent = () => {
    const [isSettingUsername, setIsSettingUsername] = React.useState(false);
    const [username, setUsername] = React.useState("");
    const [newUsername, setNewUsername] = React.useState("");
    const [usernameSubmissionStatus, setUsernameSubmissionStatus] = React.useState("");
    const [submissionCount, setSubmissionCount] = React.useState("");
    const [viewCount, setViewCount] = React.useState(0);
    const [minutesSaved, setMinutesSaved] = React.useState(0);
    const [showDonateMessage, setShowDonateMessage] = React.useState(false);

    React.useEffect(() => {
        (async () => {
            const values = ["userName", "viewCount", "minutesSaved", "vip", "permissions", "segmentCount"];
            let result: FetchResponse;
            try {
                result = await asyncRequestToServer("GET", "/api/userInfo", {
                    publicUserID: await getHash(Config.config!.userID!),
                    values
                });
            } catch (e) {
                console.error("[SB] Caught error while fetching user info", e);
                return
            }

            if (result.ok) {
                const userInfo = JSON.parse(result.responseText);
                setUsername(userInfo.userName);
                setSubmissionCount(Math.max(Config.config.sponsorTimesContributed ?? 0, userInfo.segmentCount).toLocaleString());
                setViewCount(userInfo.viewCount);
                setMinutesSaved(userInfo.minutesSaved);

                if (username === "sponege") {
                    Config.config.prideTheme = true;
                }

                Config.config!.isVip = userInfo.vip;
                Config.config!.permissions = userInfo.permissions;

                setShowDonateMessage(Config.config.showDonationLink && Config.config.donateClicked <= 0 && Config.config.showPopupDonationCount < 5
                    && viewCount < 50000 && !Config.config.isVip && Config.config.skipCount > 10 && showDonationLink());
            } else {
                logRequest(result, "SB", "user info");
            }
        })();
    }, []);

    return (
        <div className="sbYourWorkBox">
            <h2 className="sbHeader" style={{ "padding": "8px 15px" }}>
                {chrome.i18n.getMessage("yourWork")}
            </h2>
            <div className="sbYourWorkCols">
                {/* Username */}
                <div id="usernameElement">
                    <p className="u-mZ grey-text">
                        {chrome.i18n.getMessage("Username")}:
                        {/* loading/errors */}
                        <span id="setUsernameStatus" 
                            className={`u-mZ white-text${!usernameSubmissionStatus ? " hidden" : ""}`}>
                            {usernameSubmissionStatus}
                        </span>
                    </p>
                    <div id="setUsernameContainer" className={isSettingUsername ? " hidden" : ""}>
                        <p id="usernameValue">{username}</p>
                        <button id="setUsernameButton" 
                            title={chrome.i18n.getMessage("setUsername")}
                            onClick={() => {
                                setNewUsername(username);
                                setIsSettingUsername(!isSettingUsername);
                            }}>
                            <PencilIcon id="sbPopupIconEdit" className="sbPopupButton" />
                        </button>
                        <button id="copyUserID" 
                            title={chrome.i18n.getMessage("copyPublicID")}
                            onClick={async () => {
                                window.navigator.clipboard.writeText(await getHash(Config.config!.userID!));
                            }}>
                            <ClipboardIcon id="sbPopupIconCopyUserID" className="sbPopupButton" />
                        </button>
                    </div>
                    <div id="setUsername" className={!isSettingUsername ? " hidden" : " SBExpanded"}>
                        <input id="usernameInput" 
                            placeholder={chrome.i18n.getMessage("Username")}
                            value={newUsername}
                            onChange={(e) => {
                                setNewUsername(e.target.value);
                            }}/>
                        <button id="submitUsername"
                            onClick={() => {
                                if (newUsername.length > 0) {
                                    setUsernameSubmissionStatus(chrome.i18n.getMessage("Loading"));
                                    asyncRequestToServer("POST", `/api/setUsername?userID=${Config.config!.userID}&username=${newUsername}`)
                                    .then((result) => {
                                        if (result.ok) {
                                            setUsernameSubmissionStatus("");
                                            setUsername(newUsername);
                                            setIsSettingUsername(!isSettingUsername);
                                        } else {
                                            logRequest(result, "SB", "username change");
                                            setUsernameSubmissionStatus(getShortErrorMessage(result.status, result.responseText));
                                        }
                                    }).catch((e) => {
                                        console.error("[SB] Caught error while requesting a username change", e)
                                        setUsernameSubmissionStatus(formatJSErrorMessage(e));
                                    });
                                }
                            }}>
                            <CheckIcon id="sbPopupIconCheck" className="sbPopupButton" />
                        </button>
                    </div>
                </div>
                <SubmissionCounts
                    isSettingUsername={isSettingUsername}
                    submissionCount={submissionCount}
                />
            </div>

            <TimeSavedMessage
                viewCount={viewCount}
                minutesSaved={minutesSaved}
            />

            {showDonateMessage && <DonateMessage onClose={() => {
                setShowDonateMessage(false);
                Config.config.showPopupDonationCount = 100;
            }} />}

        </div>
    );
};

function SubmissionCounts(props: { isSettingUsername: boolean; submissionCount: string }): JSX.Element {
    return <>
        <div id="sponsorTimesContributionsContainer" className={props.isSettingUsername ? " hidden" : ""}>
            <p className="u-mZ grey-text">
                {chrome.i18n.getMessage("Submissions")}:
            </p>
            <p id="sponsorTimesContributionsDisplay" className="u-mZ">{props.submissionCount}</p>
        </div>
    </>
}

function TimeSavedMessage({ viewCount, minutesSaved }: { viewCount: number; minutesSaved: number }): JSX.Element {
    return (
        <>
            {
                viewCount > 0 &&
                <p id="sponsorTimesViewsContainer" className="u-mZ sbStatsSentence">
                    {chrome.i18n.getMessage("savedPeopleFrom")}
                    <b>
                        <span id="sponsorTimesViewsDisplay">{viewCount.toLocaleString()}</span>{" "}
                    </b>
                    <span id="sponsorTimesViewsDisplayEndWord">{viewCount !== 1 ? chrome.i18n.getMessage("Segments") : chrome.i18n.getMessage("Segment")}</span>
                    <br />
                    <span className="sbExtraInfo">
                        {"("}{" "}
                        <b>
                            <span id="sponsorTimesOthersTimeSavedDisplay">{getFormattedHours(minutesSaved)}</span>{" "}
                            <span id="sponsorTimesOthersTimeSavedEndWord">{minutesSaved !== 1 ? chrome.i18n.getMessage("minsLower") : chrome.i18n.getMessage("minLower")}</span>{" "}
                        </b>
                        <span>{chrome.i18n.getMessage("youHaveSavedTimeEnd")}</span>{" "}
                        {" )"}
                    </span>
                </p>
            }
            <p id="sponsorTimesSkipsDoneContainer" className="u-mZ sbStatsSentence">
                {chrome.i18n.getMessage("youHaveSkipped")}
                <b>
                    <span id="sponsorTimesSkipsDoneDisplay">{Config.config.skipCount}</span>{" "}
                </b>
                <span id="sponsorTimesSkipsDoneEndWord">{Config.config.skipCount > 1 ? chrome.i18n.getMessage("Segments") : chrome.i18n.getMessage("Segment")}</span>{" "}
                <span className="sbExtraInfo">
                    {"("}{" "}
                    <b>
                        <span id="sponsorTimeSavedDisplay">{getFormattedHours(Config.config.minutesSaved)}</span>{" "}
                        <span id="sponsorTimeSavedEndWord">{Config.config.minutesSaved !== 1 ? chrome.i18n.getMessage("minsLower") : chrome.i18n.getMessage("minLower")}</span>{" "}
                    </b>
                    {")"}
                </span>
            </p>
        </>
    );
}

function DonateMessage(props: { onClose: () => void }): JSX.Element {
    return (
        <div id="sponsorTimesDonateContainer" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
            <img className="sbHeart" src="/icons/heart.svg" alt="Heart icon" />
            <a id="sbConsiderDonateLink" href="https://sponsor.ajay.app/donate" target="_blank" rel="noreferrer" onClick={() => {
                Config.config.donateClicked = Config.config.donateClicked + 1;
            }}>
                {chrome.i18n.getMessage("considerDonating")}
            </a>
            <img id="sbCloseDonate" src="/icons/close.png" alt={chrome.i18n.getMessage("closeIcon")} height="8" style={{ paddingLeft: "5px", cursor: "pointer" }} onClick={props.onClose} />
        </div>
    );
}

/**
 * Converts time in minutes to 2d 5h 25.1
 * If less than 1 hour, just returns minutes
 *
 * @param {float} minutes
 * @returns {string}
 */
function getFormattedHours(minutes) {
    minutes = Math.round(minutes * 10) / 10;
    const years = Math.floor(minutes / 525600); // Assumes 365.0 days in a year
    const days = Math.floor(minutes / 1440) % 365;
    const hours = Math.floor(minutes / 60) % 24;
    return (years > 0 ? years + chrome.i18n.getMessage("yearAbbreviation") + " " : "") + (days > 0 ? days + chrome.i18n.getMessage("dayAbbreviation") + " " : "") + (hours > 0 ? hours + chrome.i18n.getMessage("hourAbbreviation") + " " : "") + (minutes % 60).toFixed(1);
}
