import * as React from "react";
import { VideoID } from "../types";
import Config from "../config";
import { Message, MessageResponse } from "../messageTypes";
import { LoadingStatus } from "./PopupComponent";

interface SegmentSubmissionComponentProps {
    videoID: VideoID;
    status: LoadingStatus;

    sendMessage: (request: Message) => Promise<MessageResponse>;
}

export const SegmentSubmissionComponent = (props: SegmentSubmissionComponentProps) => {
    const segments = Config.local.unsubmittedSegments[props.videoID];

    const [showSubmitButton, setShowSubmitButton] = React.useState(segments && segments.length > 0);
    const [showStartSegment, setShowStartSegment] = React.useState(!segments || segments[segments.length - 1].segment.length === 2);

    return (
        <div id="mainControls" className={props.status === LoadingStatus.Loading ? "hidden" : ""}>
            <h1 className="sbHeader">
                {chrome.i18n.getMessage("recordTimesDescription")}
            </h1>
            <sub className="sponsorStartHint grey-text">
                {chrome.i18n.getMessage("popupHint")}
            </sub>
            <div style={{ textAlign: "center", margin: "8px 0" }}>
                <button id="sponsorStart" 
                        className="sbMediumButton"
                        style={{ marginRight: "8px" }}
                        onClick={() => {
                            props.sendMessage({
                                from: "popup",
                                message: "sponsorStart"
                            });

                            setShowStartSegment(!showStartSegment);
                            setShowSubmitButton(true);

                            // Once data is saved, make sure it is correct
                            setTimeout(() => {
                                const segments = Config.local.unsubmittedSegments[props.videoID];
                                setShowStartSegment(!segments || segments[segments.length - 1].segment.length === 2);

                                setShowSubmitButton(segments && segments.length > 0);
                            }, 200);
                        }}>
                    {showStartSegment ? chrome.i18n.getMessage("sponsorStart") : chrome.i18n.getMessage("sponsorEnd")}
                </button>
                <button id="submitTimes" 
                        className={"sbMediumButton " + (showSubmitButton ? "" : "hidden")}
                        onClick={() => {
                            props.sendMessage({
                                message: "submitTimes"
                            });
                        }}>
                    {chrome.i18n.getMessage("OpenSubmissionMenu")}
                </button>
            </div>
            <span id="submissionHint" className={showSubmitButton ? "" : "hidden"}>
                {chrome.i18n.getMessage("submissionEditHint")}
            </span>
        </div>
    );
};