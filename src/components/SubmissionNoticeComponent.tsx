import * as React from "react";
import Config from "../config"
import { ContentContainer } from "../types";

import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import SponsorTimeEditComponent from "./SponsorTimeEditComponent";

export interface SubmissionNoticeProps { 
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => any;

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

    callback: () => any;

    noticeRef: React.MutableRefObject<NoticeComponent>;
    timeEditRefs: React.RefObject<SponsorTimeEditComponent>[];

    constructor(props: SubmissionNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();

        this.contentContainer = props.contentContainer;
        this.callback = props.callback;
    
        let noticeTitle = chrome.i18n.getMessage("confirmNoticeTitle");

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],
            idSuffix: "SubmissionNotice"
        }
    }

    render() {
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
                    className="sponsorTimeMessagesRow">
                    <td style={{width: "100%"}}>
                        {this.getSponsorTimeMessages()}
                    </td>
                </tr>
              
                {/* Last Row */}
                <tr id={"sponsorSkipNoticeSecondRow" + this.state.idSuffix}>

                    <td className="sponsorSkipNoticeRightSection"
                        style={{position: "relative"}}>

                        {/* Cancel Button */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={this.cancel.bind(this)}>

                            {chrome.i18n.getMessage("cancel")}
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
        let elements: JSX.Element[] = [];
        this.timeEditRefs = [];

        let sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;

        for (let i = 0; i < sponsorTimes.length; i++) {
            let timeRef = React.createRef<SponsorTimeEditComponent>();

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
        let elements: JSX.Element[] = [];

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

    cancel() {
        this.noticeRef.current.close(true);

        this.contentContainer().resetSponsorSubmissionNotice();

        this.props.closeListener();
    }

    submit() {
        // save all items
        for (const ref of this.timeEditRefs) {
            ref.current.saveEditTimes();
        }

        this.props.callback();

        this.cancel();
    }
}

export default SubmissionNoticeComponent;