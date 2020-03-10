import * as React from "react";

export interface SkipNoticeProps { 
    UUID: string;
    manualSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => any;
}

export interface SkipNoticeState {
    noticeTitle: string,

    countdownTime: number,
    countdownText: string,

    unskipText: string,
    unskipCallback: () => void
}

class SkipNoticeComponent extends React.Component<SkipNoticeProps, SkipNoticeState> {
    UUID: string;
    manualSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => any;

    amountOfPreviousNotices: number;
    
    maxCountdownTime: () => number;
    countdownInterval: NodeJS.Timeout;
    idSuffix: any;

    constructor(props: SkipNoticeComponent) {
        super(props);

        this.UUID = props.UUID;
        this.manualSkip = props.manualSkip;
        this.contentContainer = props.contentContainer;
    
        let noticeTitle = chrome.i18n.getMessage("noticeTitle");
    
        if (this.manualSkip) {
            noticeTitle = chrome.i18n.getMessage("noticeTitleNotSkipped");
        }
    
        this.maxCountdownTime = () => 4;
        //the id for the setInterval running the countdown
        this.countdownInterval = null;
    
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

            //the countdown until this notice closes
            countdownTime: this.maxCountdownTime(),
            countdownText: null,

            unskipText: chrome.i18n.getMessage("unskip"),
            unskipCallback: this.unskip.bind(this)
        }
    }

    componentDidMount() {
        this.startCountdown();
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
            <table id={"sponsorSkipNotice" + this.idSuffix} 
                className="sponsorSkipObject sponsorSkipNotice" style={noticeStyle}
                onMouseEnter={this.pauseCountdown.bind(this)}
                onMouseLeave={this.startCountdown.bind(this)}> <tbody>

                {/* First row */}
                <tr id={"sponsorSkipNoticeFirstRow" + this.idSuffix}>
                    {/* Left column */}
                    <td>
                        {/* Logo */}
                        <img id={"sponsorSkipLogo" + this.idSuffix} 
                            className="sponsorSkipLogo sponsorSkipObject"
                            src={chrome.extension.getURL("icons/IconSponsorBlocker256px.png")}>
                        </img>

                        <span id={"sponsorSkipMessage" + this.idSuffix}
                            className="sponsorSkipMessage sponsorSkipObject">
                            
                            {this.state.noticeTitle}
                        </span>
                    </td>

                    {/* Right column */}
                    <td className="sponsorSkipNoticeRightSection"
                        style={{top: "11px"}}>
                        
                        {/* Time left */}
                        <span id={"sponsorSkipNoticeTimeLeft" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeTimeLeft">

                            {this.state.countdownText || (this.state.countdownTime + "s")}
                        </span>

                        {/* Close button */}
                        <img src={chrome.extension.getURL("icons/close.png")}
                            className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeCloseButton sponsorSkipNoticeRightButton"
                            onClick={this.close.bind(this)}>
                        </img>
                    </td>
                </tr> 

                {/* Spacer */}
                <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                    className="sponsorBlockSpacer">
                </tr>

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
                    {this.manualSkip ? "" : 
                        <td className="sponsorSkipNoticeRightSection">
                            <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                                onClick={this.contentContainer().dontShowNoticeAgain}>

                                {chrome.i18n.getMessage("Hide")}
                            </button>
                        </td>
                    }
                </tr>
            </tbody> </table>
        );
    }

    //called every second to lower the countdown before hiding the notice
    countdown() {
        let countdownTime = this.state.countdownTime - 1;

        if (countdownTime <= 0) {
            //remove this from setInterval
            clearInterval(this.countdownInterval);

            //time to close this notice
            this.close();

            return;
        }

        if (countdownTime == 3) {
            //start fade out animation
            let notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
            notice.style.removeProperty("animation");
            notice.classList.add("sponsorSkipNoticeFadeOut");
        }

        this.setState({
            countdownTime
        })
    }

    pauseCountdown() {
        //remove setInterval
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;

        //reset countdown and inform the user
        this.setState({
            countdownTime: this.maxCountdownTime(),
            countdownText: chrome.i18n.getMessage("paused")
        });
        
        //remove the fade out class if it exists
        let notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
        notice.classList.remove("sponsorSkipNoticeFadeOut");
        notice.style.animation = "none";
    }

    startCountdown() {
        //if it has already started, don't start it again
        if (this.countdownInterval !== null) return;

        this.setState({
            countdownTime: this.maxCountdownTime(),
            countdownText: null
        });

        this.countdownInterval = setInterval(this.countdown.bind(this), 1000);
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

        //change max duration to however much of the sponsor is left
        this.maxCountdownTime = function() {
            let sponsorTime = this.contentContainer().sponsorTimes[this.contentContainer().UUIDs.indexOf(this.UUID)];
            let duration = Math.round(sponsorTime[1] - this.contentContainer().v.currentTime);

            return Math.max(duration, 4);
        };

        //reset countdown
        this.setState({
            countdownTime: this.maxCountdownTime()
        });
    }

    reskip() {
        this.contentContainer().reskipSponsorTime(this.UUID);

        //setup new callback
        this.setState({
            unskipText: chrome.i18n.getMessage("unskip"),
            unskipCallback: this.unskip.bind(this)
        });

        //reset duration
        this.maxCountdownTime = () => 4;

        //reset countdown
        this.setState({
            countdownTime: this.maxCountdownTime()
        });

        // See if the title should be changed
        if (this.manualSkip) {
            this.changeNoticeTitle(chrome.i18n.getMessage("noticeTitle"));

            this.contentContainer().vote(1, this.UUID, this);
        }
    }

    afterDownvote() {
        this.addVoteButtonInfo(chrome.i18n.getMessage("voted"));
        this.addNoticeInfoMessage(chrome.i18n.getMessage("hitGoBack"));
        
        //remove this sponsor from the sponsors looked up
        //find which one it is
        for (let i = 0; i < this.contentContainer().sponsorTimes.length; i++) {
            if (this.contentContainer().UUIDs[i] == this.UUID) {
                //this one is the one to hide
                
                //add this as a hidden sponsorTime
                this.contentContainer().hiddenSponsorTimes.push(i);
            
                this.contentContainer().updatePreviewBar();
                break;
            }
        }
    }

    changeNoticeTitle(title) {
        let noticeElement = document.getElementById("sponsorSkipMessage" + this.idSuffix);

        noticeElement.innerText = title;
    }
    
    addNoticeInfoMessage(message: string, message2: string = "") {
        let previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + this.idSuffix);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.idSuffix).removeChild(previousInfoMessage);
        }

        let previousInfoMessage2 = document.getElementById("sponsorTimesInfoMessage" + this.idSuffix + "2");
        if (previousInfoMessage2 != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.idSuffix).removeChild(previousInfoMessage2);
        }
        
        //add info
        let thanksForVotingText = document.createElement("p");
        thanksForVotingText.id = "sponsorTimesInfoMessage" + this.idSuffix;
        thanksForVotingText.className = "sponsorTimesInfoMessage";
        thanksForVotingText.innerText = message;

        //add element to div
        document.querySelector("#sponsorSkipNotice" + this.idSuffix + " > tbody").insertBefore(thanksForVotingText, document.getElementById("sponsorSkipNoticeSpacer" + this.idSuffix));
    
        if (message2 !== undefined) {
            let thanksForVotingText2 = document.createElement("p");
            thanksForVotingText2.id = "sponsorTimesInfoMessage" + this.idSuffix + "2";
            thanksForVotingText2.className = "sponsorTimesInfoMessage";
            thanksForVotingText2.innerText = message2;

            //add element to div
            document.querySelector("#sponsorSkipNotice" + this.idSuffix + " > tbody").insertBefore(thanksForVotingText2, document.getElementById("sponsorSkipNoticeSpacer" + this.idSuffix));
        }
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

    resetNoticeInfoMessage() {
        let previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + this.idSuffix);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.idSuffix).removeChild(previousInfoMessage);
        }
    }
    
    //close this notice
    close() {
        //reset message
        this.resetNoticeInfoMessage();
        
        let notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
        if (notice != null) {
            notice.remove();
        }

        //remove setInterval
        if (this.countdownInterval !== null) clearInterval(this.countdownInterval);
    }
}

export default SkipNoticeComponent;