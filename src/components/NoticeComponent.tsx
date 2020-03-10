import * as React from "react";

export interface NoticeProps {
    noticeTitle: string,

    maxCountdownTime?: () => number,
    amountOfPreviousNotices?: number,
    timed?: boolean,
    idSuffix: string
}

export interface NoticeState {
    noticeTitle: string,

    countdownTime: number,
    countdownText: string,
}

class NoticeComponent extends React.Component<NoticeProps, NoticeState> {
    countdownInterval: NodeJS.Timeout;
    idSuffix: any;

    timed: boolean

    amountOfPreviousNotices: number;

    constructor(props: NoticeProps) {
        super(props);

        // Set default to timed
        this.timed = props.timed;
        if (this.timed === undefined) this.timed = true;

        if (props.maxCountdownTime === undefined) props.maxCountdownTime = () => 4;
    
        //the id for the setInterval running the countdown
        this.countdownInterval = null;

        this.amountOfPreviousNotices = props.amountOfPreviousNotices || 0;

        this.idSuffix = props.idSuffix;

        // Setup state
        this.state = {
            noticeTitle: props.noticeTitle,

            //the countdown until this notice closes
            countdownTime: props.maxCountdownTime(),
            countdownText: null,
        }
    }

    componentDidMount() {
        this.startCountdown();
    }

    // forwardRef(props, ref) {

    // }

    render() {
        let noticeStyle: React.CSSProperties = {
            zIndex: 50 + this.amountOfPreviousNotices
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
                        {this.timed ? ( 
                            <span id={"sponsorSkipNoticeTimeLeft" + this.idSuffix}
                                className="sponsorSkipObject sponsorSkipNoticeTimeLeft">

                                {this.state.countdownText || (this.state.countdownTime + "s")}
                            </span>
                        ) : ""}
                       

                        {/* Close button */}
                        <img src={chrome.extension.getURL("icons/close.png")}
                            className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeCloseButton sponsorSkipNoticeRightButton"
                            onClick={this.close.bind(this)}>
                        </img>
                    </td>
                </tr> 

                {this.props.children}

            </tbody> </table>
        );
    }

    //called every second to lower the countdown before hiding the notice
    countdown() {
        if (!this.timed) return;

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
        if (!this.timed) return;

        //remove setInterval
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;

        //reset countdown and inform the user
        this.setState({
            countdownTime: this.props.maxCountdownTime(),
            countdownText: chrome.i18n.getMessage("paused")
        });
        
        //remove the fade out class if it exists
        let notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
        notice.classList.remove("sponsorSkipNoticeFadeOut");
        notice.style.animation = "none";
    }

    startCountdown() {
        if (!this.timed) return;

        //if it has already started, don't start it again
        if (this.countdownInterval !== null) return;

        this.setState({
            countdownTime: this.props.maxCountdownTime(),
            countdownText: null
        });

        this.countdownInterval = setInterval(this.countdown.bind(this), 1000);
    }

    resetCountdown() {
        if (!this.timed) return;

        this.setState({
            countdownTime: this.props.maxCountdownTime(),
            countdownText: null
        });
    }
    
    //close this notice
    close() {
        //TODO: Change to a listener in the renderer (not component)
        let notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
        if (notice != null) {
            notice.remove();
        }

        //remove setInterval
        if (this.countdownInterval !== null) clearInterval(this.countdownInterval);
    }

    changeNoticeTitle(title) {
        this.setState({
            noticeTitle: title
        });
    }
    
    addNoticeInfoMessage(message: string, message2: string = "") {
        //TODO: Replace

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
}

export default NoticeComponent;