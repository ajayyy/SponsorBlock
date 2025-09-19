import * as React from "react";
import { ActionType, SegmentUUID, SponsorHideType, SponsorTime, VideoID } from "../types";
import Config from "../config";
import { waitFor } from "../../maze-utils/src";
import { shortCategoryName } from "../utils/categoryUtils";
import { formatJSErrorMessage, getFormattedTime, getShortErrorMessage } from "../../maze-utils/src/formating";
import { AnimationUtils } from "../../maze-utils/src/animationUtils";
import { asyncRequestToServer } from "../utils/requests";
import { Message, MessageResponse, VoteResponse } from "../messageTypes";
import { LoadingStatus } from "./PopupComponent";
import GenericNotice from "../render/GenericNotice";
import { exportTimes } from "../utils/exporter";
import { copyToClipboardPopup } from "./popupUtils";
import { logRequest } from "../../maze-utils/src/background-request-proxy";

interface SegmentListComponentProps {
    videoID: VideoID;
    currentTime: number;
    status: LoadingStatus;
    segments: SponsorTime[];
    loopedChapter: SegmentUUID | null;

    sendMessage: (request: Message) => Promise<MessageResponse>;
}

enum SegmentListTab {
    Segments,
    Chapter
}

interface SegmentWithNesting extends SponsorTime {
    innerChapters?: (SegmentWithNesting|SponsorTime)[];
}

export const SegmentListComponent = (props: SegmentListComponentProps) => {
    const [tab, setTab] = React.useState(SegmentListTab.Segments);
    const [isVip, setIsVip] = React.useState(Config.config?.isVip ?? false);

    React.useEffect(() => {
        if (!Config.isReady()) {
            waitFor(() => Config.isReady()).then(() => {
                setIsVip(Config.config.isVip);
            });
        } else {
            setIsVip(Config.config.isVip);
        }
    }, []);

    React.useEffect(() => {
        setTab(SegmentListTab.Segments);
    }, [props.videoID]);

    const tabFilter = (segment: SponsorTime) => {
        if (tab === SegmentListTab.Chapter) {
            return segment.actionType === ActionType.Chapter;
        } else {
            return segment.actionType !== ActionType.Chapter;
        }
    };

    const segmentsWithNesting = React.useMemo(() => {
        const result: SegmentWithNesting[] = [];
        let nbTrailingNonChapters = 0;
        function nestChapters(segments: SegmentWithNesting[], seg: SponsorTime, topLevel?: boolean) {
            if (seg.actionType === ActionType.Chapter && segments.length) {
                    // trailing non-chapters can only exist at top level
                    const lastElement = segments[segments.length - (topLevel ? nbTrailingNonChapters + 1 : 1)]

                    if (lastElement.actionType === ActionType.Chapter
                            && lastElement.segment[0] <= seg.segment[0]
                            && lastElement.segment[1] >= seg.segment[1]) {
                        if (lastElement.innerChapters){
                            nestChapters(lastElement.innerChapters, seg);
                        } else {
                            lastElement.innerChapters = [seg];
                        }
                    } else {
                        if (topLevel) {
                            nbTrailingNonChapters = 0;
                        }

                        segments.push(seg);
                    }
            } else {
                if (seg.actionType !== ActionType.Chapter) {
                    nbTrailingNonChapters++;
                }

                segments.push(seg);
            }
        }
        props.segments.forEach((seg) => nestChapters(result, {...seg}, true));
        return result;
    }, [props.segments])


    return (
        <div id="issueReporterContainer">
            <div id="issueReporterTabs" className={props.segments && props.segments.find(s => s.actionType === ActionType.Chapter) ? "" : "hidden"}>
                <span id="issueReporterTabSegments" className={tab === SegmentListTab.Segments ? "sbSelected" : ""} onClick={() => {
                    setTab(SegmentListTab.Segments);
                }}>
                    <span>{chrome.i18n.getMessage("SegmentsCap")}</span>
                </span>
                <span id="issueReporterTabChapters" className={tab === SegmentListTab.Chapter ? "sbSelected" : ""} onClick={() => {
                    setTab(SegmentListTab.Chapter);
                }}>
                    <span>{chrome.i18n.getMessage("Chapters")}</span>
                </span>
            </div>
            <div id="issueReporterTimeButtons"
                    onMouseLeave={() => selectSegment({
                        segment: null,
                        sendMessage: props.sendMessage
                    })}>
                {
                    segmentsWithNesting.map((segment) => (
                        <SegmentListItem
                            key={segment.UUID}
                            videoID={props.videoID}
                            segment={segment}
                            currentTime={props.currentTime}
                            isVip={isVip}
                            loopedChapter={props.loopedChapter} // UUID instead of boolean so it can be passed down to nested chapters 

                            tabFilter={tabFilter}
                            sendMessage={props.sendMessage}
                        />
                    ))
                }
            </div>
            
            <ImportSegments
                status={props.status}
                segments={props.segments}
                sendMessage={props.sendMessage}
            />
        </div>
    );
};

function SegmentListItem({ segment, videoID, currentTime, isVip, loopedChapter, tabFilter, sendMessage }: {
    segment: SegmentWithNesting;
    videoID: VideoID;
    currentTime: number;
    isVip: boolean;
    loopedChapter: SegmentUUID;
    
    tabFilter: (segment: SponsorTime) => boolean;
    sendMessage: (request: Message) => Promise<MessageResponse>;
}) {
    const [voteMessage, setVoteMessage] = React.useState<string | null>(null);
    const [hidden, setHidden] = React.useState(segment.hidden ?? SponsorHideType.Visible); // undefined ?? undefined lol
    const [isLooped, setIsLooped] = React.useState(loopedChapter === segment.UUID);

    // Update internal state if the hidden property of the segment changes
    React.useEffect(() => {
        setHidden(segment.hidden ?? SponsorHideType.Visible);
    }, [segment.hidden])

    let extraInfo: string;
    switch (hidden) {
        case SponsorHideType.Visible:
            extraInfo = "";
            break;
        case SponsorHideType.Downvoted:
            extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
            break;
        case SponsorHideType.MinimumDuration:
            extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
            break;
        case SponsorHideType.Hidden:
            extraInfo = " (" + chrome.i18n.getMessage("manuallyHidden") + ")";
            break;
        default:
            // hidden satisfies never; // need to upgrade TS
            console.warn(`[SB] Unhandled variant of SponsorHideType in SegmentListItem: ${hidden}`);
            extraInfo = "";
    }

    return (
        <div className={"segmentWrapper " + (!tabFilter(segment) ? "hidden" : "")}>
            <details data-uuid={segment.UUID}
                    onDoubleClick={() => skipSegment({
                        segment,
                        sendMessage
                    })}
                    onMouseEnter={() => {
                        selectSegment({
                            segment,
                            sendMessage
                        });
                    }}
                    className={"votingButtons"}
                    >
                <summary className={"segmentSummary " + (
                    currentTime >= segment.segment[0] ? (
                        currentTime < segment.segment[1] ? "segmentActive" : "segmentPassed"
                    ) : ""
                )}>
                    <div>
                        {
                            segment.actionType !== ActionType.Chapter &&
                            <span className="sponsorTimesCategoryColorCircle dot" style={{ backgroundColor: Config.config.barTypes[segment.category]?.color }}></span>
                        }
                        <span className="summaryLabel">{(segment.description || shortCategoryName(segment.category)) + extraInfo}</span>
                    </div>

                    <div style={{ margin: "5px" }}>
                        {
                            segment.actionType === ActionType.Full ? chrome.i18n.getMessage("full") :
                            (getFormattedTime(segment.segment[0], true) +
                                (segment.actionType !== ActionType.Poi
                                    ? " " + chrome.i18n.getMessage("to") + " " + getFormattedTime(segment.segment[1], true)
                                    : ""))
                        }
                    </div>
                </summary>

                <div className={"sbVoteButtonsContainer " + (voteMessage ? "hidden" : "")}>
                    <img
                        className="voteButton"
                        title="Upvote"
                        src={chrome.runtime.getURL("icons/thumbs_up.svg")}
                        onClick={() => {
                            vote({
                                type: 1,
                                UUID: segment.UUID,
                                setVoteMessage: setVoteMessage,
                                sendMessage
                            });
                        }}/>
                    <img
                        className="voteButton"
                        title="Downvote"
                        src={segment.locked && isVip ? chrome.runtime.getURL("icons/thumbs_down_locked.svg") : chrome.runtime.getURL("icons/thumbs_down.svg")}
                        onClick={() => {
                            vote({
                                type: 0,
                                UUID: segment.UUID,
                                setVoteMessage: setVoteMessage,
                                sendMessage
                            });
                        }}/>
                    <img
                        className="voteButton"
                        title="Copy Segment ID"
                        src={chrome.runtime.getURL("icons/clipboard.svg")}
                        onClick={async (e) => {
                            const stopAnimation = AnimationUtils.applyLoadingAnimation(e.currentTarget, 0.3);

                            try {
                                if (segment.UUID.length > 60) {
                                    copyToClipboardPopup(segment.UUID, sendMessage);
                                } else {
                                    const segmentIDData = await asyncRequestToServer("GET", "/api/segmentID", {
                                        UUID: segment.UUID,
                                        videoID: videoID
                                    });
                                    if (segmentIDData.ok && segmentIDData.responseText) {
                                        copyToClipboardPopup(segmentIDData.responseText, sendMessage);
                                    } else {
                                        logRequest(segmentIDData, "SB", "segment UUID resolution");
                                    }
                                }
                            } catch (e) {
                                console.error("[SB] Caught error while attempting to resolve and copy segment UUID", e);
                            } finally {
                                stopAnimation();
                            }

                        }}/>
                    {
                        segment.actionType === ActionType.Chapter &&
                        <img
                            className="voteButton"
                            title={isLooped ? chrome.i18n.getMessage("unloopChapter") : chrome.i18n.getMessage("loopChapter")}
                            src={isLooped ? chrome.runtime.getURL("icons/looped.svg") : chrome.runtime.getURL("icons/loop.svg")}
                            onClick={(e) => {
                                if (isLooped) {
                                    loopChapter({
                                        segment: null,
                                        element: e.currentTarget,
                                        sendMessage
                                    });
                                } else {
                                    loopChapter({
                                        segment,
                                        element: e.currentTarget,
                                        sendMessage
                                    });
                                }

                                setIsLooped(!isLooped);
                            }}/>
                    }
                    {
                        (segment.actionType === ActionType.Skip || segment.actionType === ActionType.Mute
                            || segment.actionType === ActionType.Poi
                            && [SponsorHideType.Visible, SponsorHideType.Hidden].includes(hidden)) &&
                        <img
                            className="voteButton"
                            title={chrome.i18n.getMessage("hideSegment")}
                            src={hidden === SponsorHideType.Hidden ? chrome.runtime.getURL("icons/not_visible.svg") : chrome.runtime.getURL("icons/visible.svg")}
                            onClick={(e) => {
                                const stopAnimation = AnimationUtils.applyLoadingAnimation(e.currentTarget, 0.4);
                                stopAnimation();

                                const newState = hidden === SponsorHideType.Hidden ? SponsorHideType.Visible : SponsorHideType.Hidden;
                                setHidden(newState);
                                sendMessage({
                                    message: "hideSegment",
                                    type: newState,
                                    UUID: segment.UUID
                                });
                            }}/>
                    }
                    {
                        segment.actionType !== ActionType.Full &&
                        <img
                            className="voteButton"
                            title={segment.actionType === ActionType.Chapter ? chrome.i18n.getMessage("playChapter") : chrome.i18n.getMessage("skipSegment")}
                            src={chrome.runtime.getURL("icons/skip.svg")}
                            onClick={(e) => {
                                skipSegment({
                                    segment,
                                    element: e.currentTarget,
                                    sendMessage
                                });
                            }}/>
                    }
                </div>

                <div className={"sponsorTimesVoteStatusContainer " + (voteMessage ? "" : "hidden")}>
                    <div className="sponsorTimesThanksForVotingText">
                        {voteMessage}
                    </div>
                </div>
            </details>

            {
                segment.innerChapters
                && <InnerChapterList
                    chapters={segment.innerChapters}
                    videoID={videoID}
                    currentTime={currentTime}
                    isVip={isVip}
                    loopedChapter={loopedChapter}
                    tabFilter={tabFilter}
                    sendMessage={sendMessage}
                />
            }
        </div>
    );
}

function InnerChapterList({ chapters, videoID, currentTime, isVip, loopedChapter, tabFilter, sendMessage }: {
    chapters: (SegmentWithNesting)[];
    videoID: VideoID;
    currentTime: number;
    isVip: boolean;
    loopedChapter: SegmentUUID;

    tabFilter: (segment: SponsorTime) => boolean;
    sendMessage: (request: Message) => Promise<MessageResponse>;
}) {
    return <details className="innerChapterList" open>
        <summary
            onClick={(e) => {
                e.currentTarget.firstChild.textContent = (e.currentTarget.parentElement as HTMLDetailsElement).open ? chrome.i18n.getMessage("expandChapters").replace("{0}", String(chapters.length)) : chrome.i18n.getMessage("collapseChapters");
            }}>
            {chrome.i18n.getMessage("collapseChapters")}
        </summary>
        <div className="innerChaptersContainer">
            {
                chapters.map((chapter) => {
                    return <SegmentListItem
                        key={chapter.UUID}
                        videoID={videoID}
                        segment={chapter}
                        currentTime={currentTime}
                        isVip={isVip}
                        loopedChapter={loopedChapter}

                        tabFilter={tabFilter}
                        sendMessage={sendMessage}
                    />
                })
            }
        </div>
    </details>
}

async function vote(props: {
    type: number;
    UUID: SegmentUUID;
    setVoteMessage: (message: string | null) => void;
    sendMessage: (request: Message) => Promise<MessageResponse>;
}): Promise<void> {
    props.setVoteMessage(chrome.i18n.getMessage("Loading"));

    const response = await props.sendMessage({
        message: "submitVote",
        type: props.type,
        UUID: props.UUID
    }) as VoteResponse;

    if (response != undefined) {
        let messageDuration = 1_500;
        // See if it was a success or failure
        if ("error" in response) {
            // JS error
            console.error("[SB] Caught error while attempting to submit a vote", response.error);
            props.setVoteMessage(formatJSErrorMessage(response.error));
            messageDuration = 10_000;
        }
        else if (response.ok || response.status === 429) {
            // Success (treat rate limits as a success)
            props.setVoteMessage(chrome.i18n.getMessage("voted"));
        } else {
            // Error
            logRequest({headers: null, ...response}, "SB", "vote on segment");
            props.setVoteMessage(getShortErrorMessage(response.status, response.responseText));
            messageDuration = 10_000;
        }
        setTimeout(() => props.setVoteMessage(null), messageDuration);
    }
}

function skipSegment({ segment, element, sendMessage }: {
    segment: SponsorTime;
    element?: HTMLElement;

    sendMessage: (request: Message) => Promise<MessageResponse>;
}): void {
    if (segment.actionType === ActionType.Chapter) {
        sendMessage({
            message: "unskip",
            UUID: segment.UUID
        });
    } else {
        sendMessage({
            message: "reskip",
            UUID: segment.UUID
        });
    }

    if (element) {
        const stopAnimation = AnimationUtils.applyLoadingAnimation(element, 0.3);
        stopAnimation();
    }
}

function selectSegment({ segment, sendMessage }: {
    segment: SponsorTime | null;

    sendMessage: (request: Message) => Promise<MessageResponse>;
}): void {
    sendMessage({
        message: "selectSegment",
        UUID: segment?.UUID
    });
}

function loopChapter({ segment, element, sendMessage }: {
    segment: SponsorTime;
    element: HTMLElement;

    sendMessage: (request: Message) => Promise<MessageResponse>;
}): void {
    sendMessage({
        message: "loopChapter",
        UUID: segment?.UUID
    });

    if (element) {
        const stopAnimation = AnimationUtils.applyLoadingAnimation(element, 0.3);
        stopAnimation();
    }
}

interface ImportSegmentsProps {
    status: LoadingStatus;
    segments: SponsorTime[];

    sendMessage: (request: Message) => Promise<MessageResponse>;
}

function ImportSegments(props: ImportSegmentsProps) {
    const [importMenuVisible, setImportMenuVisible] = React.useState(false);
    const textArea = React.useRef<HTMLTextAreaElement>(null);

    return (
        <div id="issueReporterImportExport" className={props.status === LoadingStatus.Loading ? "hidden" : ""}>
            <div id="importExportButtons">
            <button id="importSegmentsButton"
                    className={props.status === LoadingStatus.SegmentsFound || props.status === LoadingStatus.NoSegmentsFound ? "" : "hidden"}
                    title={chrome.i18n.getMessage("importSegments")}
                    onClick={() => {
                        setImportMenuVisible(!importMenuVisible);
                    }}>
                <img src="/icons/import.svg" alt="Import icon" id="importSegments" />
            </button>
            <button id="exportSegmentsButton"
                    className={props.segments.length === 0 ? "hidden" : ""}
                    title={chrome.i18n.getMessage("exportSegments")}
                    onClick={(e) => {
                        copyToClipboardPopup(exportTimes(props.segments), props.sendMessage);

                        const stopAnimation = AnimationUtils.applyLoadingAnimation(e.currentTarget, 0.3);
                        stopAnimation();
                        new GenericNotice(null, "exportCopied", {
                            title:  chrome.i18n.getMessage(`CopiedExclamation`),
                            timed: true,
                            maxCountdownTime: () => 0.6,
                            referenceNode: e.currentTarget.parentElement,
                            dontPauseCountdown: true,
                            style: {
                                top: 0,
                                bottom: 0,
                                minWidth: 0,
                                right: "30px",
                                margin: "auto",
                                height: "max-content"
                            },
                            hideLogo: true,
                            hideRightInfo: true
                        });
                    }}>
                <img src="/icons/export.svg" alt="Export icon" id="exportSegments" />
            </button>
            </div>

            <span id="importSegmentsMenu" className={importMenuVisible ? "" : "hidden"}>
                <textarea id="importSegmentsText" rows={5} style={{ width: "80%" }} ref={textArea}></textarea>

                <button id="importSegmentsSubmit"
                        title={chrome.i18n.getMessage("importSegments")}
                        onClick={() => {
                            const text = textArea.current.value;

                            props.sendMessage({
                                message: "importSegments",
                                data: text
                            });

                            setImportMenuVisible(false);
                        }}>
                    {chrome.i18n.getMessage("Import")}
                </button>
            </span>
        </div>
    )
}
