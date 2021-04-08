import * as React from "react";

export interface NoticeProps {
    noticeTitle: string,

    maxCountdownTime?: () => number,
    amountOfPreviousNotices?: number,
    timed?: boolean,
    idSuffix?: string,

    videoSpeed?: () => number,

    fadeIn?: boolean,

    // Callback for when this is closed
    closeListener: () => void,

    zIndex?: number,
    style?: React.CSSProperties
}

export interface NoticeState {
    noticeTitle: string,

    maxCountdownTime: () => number,

    countdownTime: number,
    countdownText: string,
    countdownManuallyPaused: boolean,
}

class NoticeComponent extends React.Component<NoticeProps, NoticeState> {
    countdownInterval: NodeJS.Timeout;
    intervalVideoSpeed: number;

    idSuffix: string;

    amountOfPreviousNotices: number;

    constructor(props: NoticeProps) {
        super(props);

        const maxCountdownTime = () => {
            if (this.props.maxCountdownTime) return this.props.maxCountdownTime();
            else return 4;
        };
    
        //the id for the setInterval running the countdown
        this.countdownInterval = null;

        this.amountOfPreviousNotices = props.amountOfPreviousNotices || 0;

        this.idSuffix = props.idSuffix || "";

        // Setup state
        this.state = {
            noticeTitle: props.noticeTitle,

            maxCountdownTime,

            //the countdown until this notice closes
            countdownTime: maxCountdownTime(),
            countdownText: null,
            countdownManuallyPaused: false
        }
    }

    componentDidMount(): void {
        this.startCountdown();
    }

    render(): React.ReactElement {
        const noticeStyle: React.CSSProperties = {
            zIndex: this.props.zIndex || (1000 + this.amountOfPreviousNotices),
            ...(this.props.style ?? {})
        }

        return (
            <table id={"sponsorSkipNotice" + this.idSuffix} 
                className={"sponsorSkipObject sponsorSkipNotice" 
                        + (this.props.fadeIn ? " sponsorSkipNoticeFadeIn" : "")
                        + (this.amountOfPreviousNotices > 0 ? " secondSkipNotice" : "")}
                style={noticeStyle}
                onMouseEnter={() => this.timerMouseEnter()}
                onMouseLeave={() => this.timerMouseLeave()}> 
                <tbody>

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
                                style={{float: "left"}}
                                className="sponsorSkipMessage sponsorSkipObject">
                                
                                {this.state.noticeTitle}
                            </span>
                        </td>

                        {/* Right column */}
                        <td className="sponsorSkipNoticeRightSection"
                            style={{top: "11px"}}>
                            
                            {/* Time left */}
                            {this.props.timed ? ( 
                                <span id={"sponsorSkipNoticeTimeLeft" + this.idSuffix}
                                    onClick={() => this.toggleManualPause()}
                                    className="sponsorSkipObject sponsorSkipNoticeTimeLeft">

                                    {this.state.countdownText || (this.state.countdownTime + "s")}
                                </span>
                            ) : ""}
                        

                            {/* Close button */}
                            <img src={chrome.extension.getURL("icons/close.png")}
                                className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeCloseButton sponsorSkipNoticeRightButton"
                                onClick={() => this.close()}>
                            </img>
                        </td>
                    </tr> 

                    {this.props.children}

                </tbody> 
            </table>
        );
    }

    timerMouseEnter(): void {
        if (this.state.countdownManuallyPaused) return;

        this.pauseCountdown();
    }

    timerMouseLeave(): void {
        if (this.state.countdownManuallyPaused) return;

        this.startCountdown();
    }

    toggleManualPause(): void {
        this.setState({
            countdownManuallyPaused: !this.state.countdownManuallyPaused
        }, () => {
            if (this.state.countdownManuallyPaused) {
                this.pauseCountdown();
            } else {
                this.startCountdown();
            }
        });
    }

    //called every second to lower the countdown before hiding the notice
    countdown(): void {
        if (!this.props.timed) return;

        const countdownTime = Math.min(this.state.countdownTime - 1, this.state.maxCountdownTime());

        if (this.props.videoSpeed && this.intervalVideoSpeed != this.props.videoSpeed()) {
            this.setupInterval();
        }

        if (countdownTime <= 0) {
            //remove this from setInterval
            clearInterval(this.countdownInterval);

            //time to close this notice
            this.close();

            return;
        }

        if (countdownTime == 3) {
            //start fade out animation
            const notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
            notice.style.removeProperty("animation");
            notice.classList.add("sponsorSkipNoticeFadeOut");
        }

        this.setState({
            countdownTime
        })
    }
    
    removeFadeAnimation(): void {
        //remove the fade out class if it exists
        const notice = document.getElementById("sponsorSkipNotice" + this.idSuffix);
        notice.classList.remove("sponsorSkipNoticeFadeOut");
        notice.style.animation = "none";
    }

    pauseCountdown(): void {
        if (!this.props.timed) return;

        //remove setInterval
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = null;

        //reset countdown and inform the user
        this.setState({
            countdownTime: this.state.maxCountdownTime(),
            countdownText: this.state.countdownManuallyPaused ? chrome.i18n.getMessage("manualPaused") : chrome.i18n.getMessage("paused")
        });
        
        this.removeFadeAnimation();
    }

    startCountdown(): void {
        if (!this.props.timed) return;

        //if it has already started, don't start it again
        if (this.countdownInterval !== null) return;

        this.setState({
            countdownTime: this.state.maxCountdownTime(),
            countdownText: null
        });

        this.setupInterval();
    }

    setupInterval(): void {
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        const intervalDuration = this.props.videoSpeed ? 1000 / this.props.videoSpeed() : 1000;
        this.countdownInterval = setInterval(this.countdown.bind(this), intervalDuration);

        if (this.props.videoSpeed) this.intervalVideoSpeed = this.props.videoSpeed();
    }

    resetCountdown(): void {
        if (!this.props.timed) return;

        this.setupInterval();

        this.setState({
            countdownTime: this.state.maxCountdownTime(),
            countdownText: null
        });

        this.removeFadeAnimation();
    }
    
    /**
     * @param silent If true, the close listener will not be called
     */
    close(silent?: boolean): void {
        //remove setInterval
        if (this.countdownInterval !== null) clearInterval(this.countdownInterval);

        if (!silent) this.props.closeListener();
    }

    changeNoticeTitle(title: string): void {
        this.setState({
            noticeTitle: title
        });
    }
    
    addNoticeInfoMessage(message: string, message2 = ""): void {
        //TODO: Replace

        const previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + this.idSuffix);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.idSuffix).removeChild(previousInfoMessage);
        }

        const previousInfoMessage2 = document.getElementById("sponsorTimesInfoMessage" + this.idSuffix + "2");
        if (previousInfoMessage2 != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.idSuffix).removeChild(previousInfoMessage2);
        }
        
        //add info
        const thanksForVotingText = document.createElement("p");
        thanksForVotingText.id = "sponsorTimesInfoMessage" + this.idSuffix;
        thanksForVotingText.className = "sponsorTimesInfoMessage";
        thanksForVotingText.innerText = message;

        //add element to div
        document.querySelector("#sponsorSkipNotice" + this.idSuffix + " > tbody").insertBefore(thanksForVotingText, document.getElementById("sponsorSkipNoticeSpacer" + this.idSuffix));
    
        if (message2 !== undefined) {
            const thanksForVotingText2 = document.createElement("p");
            thanksForVotingText2.id = "sponsorTimesInfoMessage" + this.idSuffix + "2";
            thanksForVotingText2.className = "sponsorTimesInfoMessage";
            thanksForVotingText2.innerText = message2;

            //add element to div
            document.querySelector("#sponsorSkipNotice" + this.idSuffix + " > tbody").insertBefore(thanksForVotingText2, document.getElementById("sponsorSkipNoticeSpacer" + this.idSuffix));
        }
    }
}

export default NoticeComponent;
