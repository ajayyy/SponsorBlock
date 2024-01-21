import * as React from "react";
import Config from "../config";
import SbSvg from "../svg-icons/sb_svg";

enum CountdownMode {
    Timer,
    Paused,
    Stopped
}

export interface NoticeProps {
    noticeTitle: string;

    maxCountdownTime?: () => number;
    dontPauseCountdown?: boolean;
    amountOfPreviousNotices?: number;
    showInSecondSlot?: boolean;
    timed?: boolean;
    idSuffix?: string;

    fadeIn?: boolean;
    startFaded?: boolean;
    firstColumn?: React.ReactElement[] | React.ReactElement;
    firstRow?: React.ReactElement;
    bottomRow?: React.ReactElement[];

    smaller?: boolean;
    limitWidth?: boolean;
    extraClass?: string;
    hideLogo?: boolean;
    hideRightInfo?: boolean;
    logoFill?: string;

    // Callback for when this is closed
    closeListener: () => void;
    onMouseEnter?: (e: React.MouseEvent<HTMLElement, MouseEvent>) => void;

    zIndex?: number;
    style?: React.CSSProperties;
    biggerCloseButton?: boolean;
    children?: React.ReactNode;
}

interface MouseDownInfo {
    x: number;
    y: number;
    right: number;
    bottom: number;
}

export interface NoticeState {
    maxCountdownTime: () => number;

    countdownTime: number;
    countdownMode: CountdownMode;

    mouseHovering: boolean;

    startFaded: boolean;

    mouseDownInfo: MouseDownInfo | null;
    mouseMoved: boolean;
    right: number;
    bottom: number;
}

// Limits for dragging notice around
const bounds = [10, 100, 10, 10];

class NoticeComponent extends React.Component<NoticeProps, NoticeState> {
    countdownInterval: NodeJS.Timeout;

    idSuffix: string;

    amountOfPreviousNotices: number;

    parentRef: React.RefObject<HTMLDivElement>;

    handleMouseMoveBinded: (e: MouseEvent) => void = this.handleMouseMove.bind(this);

    constructor(props: NoticeProps) {
        super(props);

        this.parentRef = React.createRef();

        const maxCountdownTime = () => {
            if (this.props.maxCountdownTime) return this.props.maxCountdownTime();
            else return Config.config.skipNoticeDuration;
        };
    
        //the id for the setInterval running the countdown
        this.countdownInterval = null;

        this.amountOfPreviousNotices = props.amountOfPreviousNotices || 0;

        this.idSuffix = props.idSuffix || "";

        // Setup state
        this.state = {
            maxCountdownTime,

            //the countdown until this notice closes
            countdownTime: maxCountdownTime(),
            countdownMode: CountdownMode.Timer,
            mouseHovering: false,

            startFaded: this.props.startFaded ?? false,

            mouseDownInfo: null,
            mouseMoved: false,
            right: bounds[0],
            bottom: props.showInSecondSlot ? 290 : bounds[1]
        }
    }

    componentDidMount(): void {
        this.startCountdown();
    }

    render(): React.ReactElement {
        const noticeStyle: React.CSSProperties = {
            zIndex: this.props.zIndex || (1000 + this.amountOfPreviousNotices),
            right: this.state.right,
            bottom: this.state.bottom,
            userSelect: this.state.mouseDownInfo && this.state.mouseMoved ? "none" : "auto",
            ...(this.props.style ?? {})
        }

        return (
            <div id={"sponsorSkipNotice" + this.idSuffix} 
                className={"sponsorSkipObject sponsorSkipNoticeParent"
                    + (this.props.showInSecondSlot ? " secondSkipNotice" : "")
                    + (this.props.extraClass ? ` ${this.props.extraClass}` : "")}
                onMouseEnter={(e) => this.onMouseEnter(e) }
                onMouseLeave={() => {
                    this.timerMouseLeave();
                }}
                onMouseDown={(e) => {
                    document.addEventListener("mousemove", this.handleMouseMoveBinded);

                    this.setState({
                        mouseDownInfo: {
                            x: e.clientX,
                            y: e.clientY,
                            right: this.state.right,
                            bottom: this.state.bottom
                        },
                        mouseMoved: false
                    });
                }}
                onMouseUp={() => {
                    document.removeEventListener("mousemove", this.handleMouseMoveBinded);

                    this.setState({
                        mouseDownInfo: null
                    });
                }}
                ref={this.parentRef}
                style={noticeStyle} >
                <div className={"sponsorSkipNoticeTableContainer" 
                        + (this.props.fadeIn ? " sponsorSkipNoticeFadeIn" : "")
                        + (this.state.startFaded ? " sponsorSkipNoticeFaded" : "") }>
                    <table className={"sponsorSkipObject sponsorSkipNotice"
                                + (this.props.limitWidth ? " sponsorSkipNoticeLimitWidth" : "")}>
                        <tbody>

                            {/* First row */}
                            <tr id={"sponsorSkipNoticeFirstRow" + this.idSuffix}
                                    className="sponsorSkipNoticeFirstRow">
                                {/* Left column */}
                                <td className="noticeLeftIcon">
                                    {/* Logo */}
                                    {!this.props.hideLogo &&
                                        <SbSvg
                                            id={"sponsorSkipLogo" + this.idSuffix} 
                                            fill={this.props.logoFill}
                                            className="sponsorSkipLogo sponsorSkipObject"/>
                                    }

                                    <span id={"sponsorSkipMessage" + this.idSuffix}
                                        style={{float: "left", marginRight: this.props.hideLogo ? "0px" : null}}
                                        className="sponsorSkipMessage sponsorSkipObject">
                                        
                                        {this.props.noticeTitle}
                                    </span>

                                    {this.props.firstColumn}
                                </td>

                                {this.props.firstRow}

                                {/* Right column */}
                                {!this.props.hideRightInfo &&
                                    <td className="sponsorSkipNoticeRightSection"
                                        style={{top: "9.32px"}}>
                                        
                                        {/* Time left */}
                                        {this.props.timed ? ( 
                                            <span id={"sponsorSkipNoticeTimeLeft" + this.idSuffix}
                                                onClick={() => this.toggleManualPause()}
                                                className="sponsorSkipObject sponsorSkipNoticeTimeLeft">

                                                {this.getCountdownElements()}

                                            </span>
                                        ) : ""}
                                    

                                        {/* Close button */}
                                        <img src={chrome.runtime.getURL("icons/close.png")}
                                            className={"sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeCloseButton sponsorSkipNoticeRightButton" 
                                                            + (this.props.biggerCloseButton ? " biggerCloseButton" : "")}
                                            onClick={() => this.close()}>
                                        </img>
                                    </td>
                                }
                            </tr> 

                            {this.props.children}

                            {!this.props.smaller && this.props.bottomRow ? 
                                this.props.bottomRow
                            : null}

                        </tbody> 
                    </table>
                </div>

                {/* Add as a hidden table to keep the height constant */}
                {this.props.smaller && this.props.bottomRow ? 
                    <table style={{visibility: "hidden", paddingTop: "14px"}}>
                        <tbody>
                        {this.props.bottomRow}
                        </tbody>
                    </table>
                : null}
            </div>
        );
    }

    getCountdownElements(): React.ReactElement[] {
        return [(
                    <span 
                        id={"skipNoticeTimerText" + this.idSuffix}
                        key="skipNoticeTimerText"
                        className={this.state.countdownMode !== CountdownMode.Timer ? "sbhidden" : ""} >
                            {chrome.i18n.getMessage("NoticeTimeAfterSkip").replace("{seconds}", this.state.countdownTime.toString())}
                    </span>
                ),(
                    <img 
                        id={"skipNoticeTimerPaused" + this.idSuffix}
                        key="skipNoticeTimerPaused"
                        className={this.state.countdownMode !== CountdownMode.Paused ? "sbhidden" : ""}
                        src={chrome.runtime.getURL("icons/pause.svg")}
                        alt={chrome.i18n.getMessage("paused")} />
                ),(
                    <img 
                        id={"skipNoticeTimerStopped" + this.idSuffix}
                        key="skipNoticeTimerStopped"
                        className={this.state.countdownMode !== CountdownMode.Stopped ? "sbhidden" : ""}
                        src={chrome.runtime.getURL("icons/stop.svg")}
                        alt={chrome.i18n.getMessage("manualPaused")} />
        )];
    }

    onMouseEnter(event: React.MouseEvent<HTMLElement, MouseEvent>): void {
        if (this.props.onMouseEnter) this.props.onMouseEnter(event);

        this.fadedMouseEnter();
        this.timerMouseEnter();
    }

    fadedMouseEnter(): void {
        if (this.state.startFaded) {
            this.setState({
                startFaded: false
            });
        }
    }

    timerMouseEnter(): void {
        if (this.state.countdownMode === CountdownMode.Stopped) return;

        this.pauseCountdown();

        this.setState({
            mouseHovering: true
        });
    }

    timerMouseLeave(): void {
        if (this.state.countdownMode === CountdownMode.Stopped) return;

        this.startCountdown();

        this.setState({
            mouseHovering: false
        });
    }

    toggleManualPause(): void {
        this.setState({
            countdownMode: this.state.countdownMode === CountdownMode.Stopped ? CountdownMode.Timer : CountdownMode.Stopped
        }, () => {
            if (this.state.countdownMode === CountdownMode.Stopped || this.state.mouseHovering) {
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
            notice?.style.removeProperty("animation");
            notice?.classList.add("sponsorSkipNoticeFadeOut");
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
        if (!this.props.timed || this.props.dontPauseCountdown) return;

        //remove setInterval
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = null;

        //reset countdown and inform the user
        this.setState({
            countdownTime: this.state.maxCountdownTime(),
            countdownMode: this.state.countdownMode === CountdownMode.Timer ? CountdownMode.Paused : this.state.countdownMode
        });
        
        this.removeFadeAnimation();
    }

    startCountdown(): void {
        if (!this.props.timed) return;

        //if it has already started, don't start it again
        if (this.countdownInterval !== null) return;

        this.setState({
            countdownTime: this.state.maxCountdownTime(),
            countdownMode: CountdownMode.Timer
        });

        this.setupInterval();
    }

    setupInterval(): void {
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        this.countdownInterval = setInterval(this.countdown.bind(this), 1000);
    }

    resetCountdown(): void {
        if (!this.props.timed) return;

        this.setupInterval();

        this.setState({
            countdownTime: this.state.maxCountdownTime(),
            countdownMode: CountdownMode.Timer
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

    getElement(): React.RefObject<HTMLDivElement> {
        return this.parentRef;
    }

    componentWillUnmount(): void {
        document.removeEventListener("mousemove", this.handleMouseMoveBinded);
    }

    // For dragging around notice
    handleMouseMove(e: MouseEvent): void {
        if (this.state.mouseDownInfo && e.buttons === 1) {
            const [mouseX, mouseY] = [e.clientX, e.clientY];

            const deltaX = mouseX - this.state.mouseDownInfo.x;
            const deltaY = mouseY - this.state.mouseDownInfo.y;

            if (deltaX > 0 || deltaY > 0) this.setState({ mouseMoved: true });

            const element = this.parentRef.current;
            const parent = element.parentElement.parentElement;
            this.setState({
                right: Math.min(parent.clientWidth - element.clientWidth - bounds[2], Math.max(bounds[0], this.state.mouseDownInfo.right - deltaX)),
                bottom: Math.min(parent.clientHeight - element.clientHeight - bounds[3], Math.max(bounds[1], this.state.mouseDownInfo.bottom - deltaY))
            });
        } else {
            document.removeEventListener("mousemove", this.handleMouseMoveBinded);
        }
    }
}

export default NoticeComponent;
