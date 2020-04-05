import * as React from "react";
import Config from "../config"
import { ContentContainer } from "../types";

import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";

export interface SkipNoticeProps { 
    UUID: string;
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;
}

export interface SkipNoticeState {
    noticeTitle: string,

    messages: string[],

    countdownTime: number,
    maxCountdownTime: () => number;
    countdownText: string,

    unskipText: string,
    unskipCallback: () => void
}

class SkipNoticeComponent extends React.Component<SkipNoticeProps, SkipNoticeState> {
    UUID: string;
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    amountOfPreviousNotices: number;
    
    idSuffix: any;

    noticeRef: React.MutableRefObject<NoticeComponent>;

    constructor(props: SkipNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();

        this.UUID = props.UUID;
        this.autoSkip = props.autoSkip;
        this.contentContainer = props.contentContainer;
    
        let noticeTitle = chrome.i18n.getMessage("noticeTitle");
    
        if (!this.autoSkip) {
            noticeTitle = chrome.i18n.getMessage("noticeTitleNotSkipped");
        }
    
        //add notice
        this.amountOfPreviousNotices = document.getElementsByClassName("sponsorSkipNotice").length;
    
        //this is the suffix added at the end of every id
        this.idSuffix = this.UUID + this.amountOfPreviousNotices;

        if (this.amountOfPreviousNotices > 0) {
            //another notice exists

            let previousNotice = document.getElementsByClassName("sponsorSkipNotice")[0];
            previousNotice.classList.add("secondSkipNotice")
        }

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],

            //the countdown until this notice closes
            maxCountdownTime: () => 4,
            countdownTime: 4,
            countdownText: null,

            unskipText: chrome.i18n.getMessage("unskip"),
            unskipCallback: this.unskip.bind(this)
        }
    }

    render() {
        let noticeStyle: React.CSSProperties = {
            zIndex: 50 + this.amountOfPreviousNotices
        }
        if (this.contentContainer().onMobileYouTube) {
            noticeStyle.bottom = "4em";
            noticeStyle.transform = "scale(0.8) translate(10%, 10%)";
        }

        return (
            <NoticeComponent noticeTitle={this.state.noticeTitle}
                amountOfPreviousNotices={this.amountOfPreviousNotices}
                idSuffix={this.idSuffix}
                fadeIn={true}
                timed={true}
                maxCountdownTime={this.state.maxCountdownTime}
                ref={this.noticeRef}>

                {/* Text Boxes */}
                {this.getMessageBoxes()}
              
                {/* Last Row */}
                <tr id={"sponsorSkipNoticeSecondRow" + this.idSuffix}>

                    {/* Vote Button Container */}
                    <td id={"sponsorTimesVoteButtonsContainer" + this.idSuffix}
                        className="sponsorTimesVoteButtonsContainer">

                        {/* Report Text */}
                        <span id={"sponsorTimesReportText" + this.idSuffix}
                            className="sponsorTimesInfoMessage sponsorTimesVoteButtonMessage"
                            title={chrome.i18n.getMessage("reportButtonInfo")}
                            style={{marginRight: "5px"}}>

                            {chrome.i18n.getMessage("reportButtonTitle")}
                        </span>

                        {/* Report Button */}
                        <img id={"sponsorTimesDownvoteButtonsContainer" + this.idSuffix}
                            className="sponsorSkipObject voteButton"
                            src={chrome.extension.getURL("icons/report.png")}
                            title={chrome.i18n.getMessage("reportButtonInfo")}
                            onClick={() => this.contentContainer().vote(0, this.UUID, this)}>
                        
                        </img>

                    </td>

                    {/* Unskip Button */}
                    <td className="sponsorSkipNoticeUnskipSection">
                        <button id={"sponsorSkipUnskipButton" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeButton"
                            style={{marginLeft: "4px"}}
                            onClick={this.state.unskipCallback}>

                            {this.state.unskipText}
                        </button>
                    </td>

                    {/* Never show button if manualSkip is disabled */}
                    {!this.autoSkip ? "" : 
                        <td className="sponsorSkipNoticeRightSection">
                            <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                                onClick={this.contentContainer().dontShowNoticeAgain}>

                                {chrome.i18n.getMessage("Hide")}
                            </button>
                        </td>
                    }
                </tr>

            </NoticeComponent>
        );
    }

    getMessageBoxes(): JSX.Element[] | JSX.Element {
        if (this.state.messages.length === 0) {
            // Add a spacer if there is no text
            return (
                <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                    className="sponsorBlockSpacer">
                </tr>
            );
        }

        let elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <NoticeTextSelectionComponent idSuffix={this.idSuffix}
                    text={this.state.messages[i]}
                    key={i}>
                </NoticeTextSelectionComponent>
            )
        }

        return elements;
    }

    unskip() {
        this.contentContainer().unskipSponsorTime(this.UUID);

        this.unskippedMode(chrome.i18n.getMessage("reskip"));
    }

    /** Sets up notice to be not skipped yet */
    unskippedMode(buttonText) {
        //setup new callback
        this.setState({
            unskipText: buttonText,
            unskipCallback: this.reskip.bind(this)
        });

        let maxCountdownTime = function() {
            let sponsorTime = this.contentContainer().sponsorTimes[this.contentContainer().UUIDs.indexOf(this.UUID)];
            let duration = Math.round(sponsorTime[1] - this.contentContainer().v.currentTime);

            return Math.max(duration, 4);
        }.bind(this);

        //reset countdown
        this.setState({
            //change max duration to however much of the sponsor is left
            maxCountdownTime: maxCountdownTime,

            countdownTime: maxCountdownTime()
        }, () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    reskip() {
        this.contentContainer().reskipSponsorTime(this.UUID);

        //reset countdown
        this.setState({
            unskipText: chrome.i18n.getMessage("unskip"),
            unskipCallback: this.unskip.bind(this),

            maxCountdownTime: () => 4,
            countdownTime: 4
        });

        // See if the title should be changed
        if (!this.autoSkip) {
            this.setState({
                noticeTitle: chrome.i18n.getMessage("noticeTitle")
            });

            if(Config.config.autoUpvote) this.contentContainer().vote(1, this.UUID);
        }
    }

    afterDownvote() {
        this.addVoteButtonInfo(chrome.i18n.getMessage("voted"));
        this.setNoticeInfoMessage(chrome.i18n.getMessage("hitGoBack"));
        
        //remove this sponsor from the sponsors looked up
        //find which one it is
        for (let i = 0; i < this.contentContainer().sponsorTimes.length; i++) {
            if (this.contentContainer().sponsorTimes[i].UUID == this.UUID) {
                //this one is the one to hide
                
                //add this as a hidden sponsorTime
                this.contentContainer().hiddenSponsorTimes.push(i);
            
                this.contentContainer().updatePreviewBar();
                break;
            }
        }
    }

    setNoticeInfoMessage(...messages: string[]) {
        this.setState({
            messages
        })
    }
    
    addVoteButtonInfo(message) {
        this.resetVoteButtonInfo();
        
        //hide report button and text for it
        let downvoteButton = document.getElementById("sponsorTimesDownvoteButtonsContainer" + this.idSuffix);
        if (downvoteButton != null) {
            downvoteButton.style.display = "none";
        }
        let downvoteButtonText = document.getElementById("sponsorTimesReportText" + this.idSuffix);
        if (downvoteButtonText != null) {
            downvoteButtonText.style.display = "none";
        }
        
        //add info
        let thanksForVotingText = document.createElement("td");
        thanksForVotingText.id = "sponsorTimesVoteButtonInfoMessage" + this.idSuffix;
        thanksForVotingText.className = "sponsorTimesInfoMessage sponsorTimesVoteButtonMessage";
        thanksForVotingText.innerText = message;

        //add element to div
        document.getElementById("sponsorSkipNoticeSecondRow" + this.idSuffix).prepend(thanksForVotingText);
    }

    resetVoteButtonInfo() {
        let previousInfoMessage = document.getElementById("sponsorTimesVoteButtonInfoMessage" + this.idSuffix);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNoticeSecondRow" + this.idSuffix).removeChild(previousInfoMessage);
        }

        //show button again
        document.getElementById("sponsorTimesDownvoteButtonsContainer" + this.idSuffix).style.removeProperty("display");
    }
}

export default SkipNoticeComponent;