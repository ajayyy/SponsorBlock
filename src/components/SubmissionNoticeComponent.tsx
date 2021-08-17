import * as React from "react";
import Config from "../config"
import { ContentContainer } from "../types";

import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import SponsorTimeEditComponent from "./SponsorTimeEditComponent";

export interface SubmissionNoticeProps { 
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => unknown;

    closeListener: () => void
}

export interface SubmissionNoticeeState {
    noticeTitle: string,
    messages: string[],
    idSuffix: string;
}

class SubmissionNoticeComponent extends React.Component<SubmissionNoticeProps, SubmissionNoticeeState> {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => unknown;

    noticeRef: React.MutableRefObject<NoticeComponent>;
    timeEditRefs: React.RefObject<SponsorTimeEditComponent>[];

    videoObserver: MutationObserver;

    constructor(props: SubmissionNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();

        this.contentContainer = props.contentContainer;
        this.callback = props.callback;
    
        const noticeTitle = chrome.i18n.getMessage("confirmNoticeTitle");

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],
            idSuffix: "SubmissionNotice"
        }
    }

    componentDidMount(): void {
        // Catch and rerender when the video size changes
        //TODO: Use ResizeObserver when it is supported in TypeScript
        this.videoObserver = new MutationObserver(() => {
            this.forceUpdate();
        });

        this.videoObserver.observe(this.contentContainer().v, {
            attributes: true
        });
    }

    componentWillUnmount(): void {
        if (this.videoObserver) {
            this.videoObserver.disconnect();
        }
    }

    render(): React.ReactElement {
        return (
            <NoticeComponent noticeTitle={this.state.noticeTitle}
                idSuffix={this.state.idSuffix}
                ref={this.noticeRef}
                closeListener={this.cancel.bind(this)}
                zIndex={50000}>

                {/* Text Boxes */}
                {this.getMessageBoxes()}

                {/* Sponsor Time List */}
                <tr id={"sponsorSkipNoticeMiddleRow" + this.state.idSuffix}
                    className="sponsorTimeMessagesRow"
                    style={{maxHeight: (this.contentContainer().v.offsetHeight - 200) + "px"}}>
                    <td style={{width: "100%"}}>
                        {this.getSponsorTimeMessages()}
                    </td>
                </tr>

                {/* Last Row */}
                <tr id={"sponsorSkipNoticeSecondRow" + this.state.idSuffix}>

                    <td className="sponsorSkipNoticeRightSection"
                        style={{position: "relative"}}>

                        {/* Guidelines button */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={() => window.open("https://wiki.sponsor.ajay.app/index.php/Guidelines")}>

                            {chrome.i18n.getMessage(Config.config.submissionCountSinceCategories > 3 ? "guidelines" : "readTheGuidelines")}
                        </button>

                        {/* Submit Button */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={this.submit.bind(this)}>

                            {chrome.i18n.getMessage("submit")}
                        </button>
                    </td>
                </tr>

            </NoticeComponent>
        );
    }

    getSponsorTimeMessages(): JSX.Element[] | JSX.Element {
        const elements: JSX.Element[] = [];
        this.timeEditRefs = [];

        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;

        for (let i = 0; i < sponsorTimes.length; i++) {
            const timeRef = React.createRef<SponsorTimeEditComponent>();

            elements.push(
                <SponsorTimeEditComponent key={i}
                    idSuffix={this.state.idSuffix + i}
                    index={i}
                    contentContainer={this.props.contentContainer}
                    submissionNotice={this}
                    ref={timeRef}>
                </SponsorTimeEditComponent>
            );

            this.timeEditRefs.push(timeRef);
        }

        return elements;
    }

    getMessageBoxes(): JSX.Element[] | JSX.Element {
        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <NoticeTextSelectionComponent idSuffix={this.state.idSuffix + i}
                    text={this.state.messages[i]}
                    key={i}>
                </NoticeTextSelectionComponent>
            );
        }

        return elements;
    }

    cancel(): void {
        this.noticeRef.current.close(true);

        this.contentContainer().resetSponsorSubmissionNotice();

        this.props.closeListener();
    }

    submit(): void {
        // save all items
        for (const ref of this.timeEditRefs) {
            ref.current.saveEditTimes();
        }

        const sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;
        for (const sponsorTime of sponsorTimesSubmitting) {
            if (sponsorTime.category === "chooseACategory") {
                alert(chrome.i18n.getMessage("youMustSelectACategory"));
                return;
            }
        }

        // Check if any non music categories are being used on a music video
        if (this.contentContainer().videoInfo?.microformat?.playerMicroformatRenderer?.category === "Music") {
            for (const sponsorTime of sponsorTimesSubmitting) {
                if (sponsorTime.category === "sponsor") {
                    if (!confirm(chrome.i18n.getMessage("nonMusicCategoryOnMusic"))) return;

                    break;
                }
            }
        }

        this.props.callback();

        this.cancel();
    }
}

export default SubmissionNoticeComponent;