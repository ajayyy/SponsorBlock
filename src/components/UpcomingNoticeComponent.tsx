import * as React from "react";
import { ContentContainer, NoticeVisbilityMode, SponsorTime } from "../types";
import NoticeComponent from "./NoticeComponent";
import Config from "../config";
import { getUpcomingText } from "../utils/categoryUtils";

export interface UpcomingNoticeProps {
    segments: SponsorTime[];

    autoSkip: boolean;
    timeUntilSegment: number;
    contentContainer: ContentContainer;

    closeListener: () => void;
    showKeybindHint?: boolean;
}

class UpcomingNoticeComponent extends React.Component<UpcomingNoticeProps> {
    noticeTitle: string;
    segments: SponsorTime[];
    autoSkip: boolean;
    contentContainer: ContentContainer;

    amountOfPreviousNotices: number;
    timeUntilSegment: number;

    idSuffix: string;

    noticeRef: React.MutableRefObject<NoticeComponent>;

    configListener: () => void;

    constructor(props: UpcomingNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();

        this.segments = props.segments;
        this.autoSkip = props.autoSkip;
        this.contentContainer = props.contentContainer;
        this.timeUntilSegment = props.timeUntilSegment;

        const previousUpcomingNotices = document.getElementsByClassName("sponsorSkipNoticeParent");
        this.amountOfPreviousNotices = previousUpcomingNotices.length;
        
        if (this.segments.length > 1) {
            this.segments.sort((a, b) => a.segment[0] - b.segment[0]);
        }
        
        // This is the suffix added at the end of every id
        for (const segment of this.segments) {
            this.idSuffix += segment.UUID;
        }
        this.idSuffix += this.amountOfPreviousNotices;

        this.noticeTitle = getUpcomingText(this.segments);
    }

    render(): React.ReactElement {
        const noticeStyle: React.CSSProperties = { };
        if (this.contentContainer().onMobileYouTube) {
            noticeStyle.bottom = "4em";
            noticeStyle.transform = "scale(0.8) translate(10%, 10%)";
        }

        return (
            <NoticeComponent
                noticeTitle={this.noticeTitle}
                amountOfPreviousNotices={this.amountOfPreviousNotices}
                idSuffix={this.idSuffix}
                fadeIn
                startFaded={Config.config.noticeVisibilityMode >= NoticeVisbilityMode.FadedForAll
                    || (Config.config.noticeVisibilityMode >= NoticeVisbilityMode.FadedForAutoSkip && this.autoSkip)}
                timed
                maxCountdownTime={() => Math.round(this.timeUntilSegment / 1000)}
                style={noticeStyle}
                biggerCloseButton={this.contentContainer().onMobileYouTube}
                ref={this.noticeRef}
                closeListener={() => this.closeListener()}
                logoFill={Config.config.barTypes[this.segments[0].category].color}
                limitWidth
                dontPauseCountdown />
        )
    }

    closeListener(): void {
        this.clearConfigListener();

        this.props.closeListener();
    }

    clearConfigListener(): void {
        if (this.configListener) {
            Config.configSyncListeners.splice(Config.configSyncListeners.indexOf(this.configListener), 1);
            this.configListener = null;
        }
    }
}

export default UpcomingNoticeComponent;