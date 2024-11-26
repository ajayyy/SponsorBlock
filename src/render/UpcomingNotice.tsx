import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ContentContainer, SponsorTime } from "../types";

import Utils from "../utils";
import SkipNoticeComponent from "../components/SkipNoticeComponent";
const utils = new Utils();

class UpcomingNotice {
    segments: SponsorTime[];
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    noticeElement: HTMLDivElement;

    upcomingNoticeRef: React.MutableRefObject<SkipNoticeComponent>;
    root: Root;

    closed = false;

    constructor(segments: SponsorTime[], contentContainer: ContentContainer, timeLeft: number, autoSkip: boolean) {
        this.upcomingNoticeRef = React.createRef();

        this.segments = segments;
        this.contentContainer = contentContainer;

        const referenceNode = utils.findReferenceNode();

        this.noticeElement = document.createElement("div");
        this.noticeElement.className = "sponsorSkipNoticeContainer";

        referenceNode.prepend(this.noticeElement);

        this.root = createRoot(this.noticeElement);
        this.root.render(
            <SkipNoticeComponent segments={segments} 
                autoSkip={autoSkip} 
                upcomingNotice={true}
                contentContainer={contentContainer}
                ref={this.upcomingNoticeRef}
                closeListener={() => this.close()}
                smaller={true}
                fadeIn={true}
                unskipTime={timeLeft} />
        );
    }

    close(): void {
        this.root.unmount();
        this.noticeElement.remove();

        this.closed = true;
    }

    sameNotice(segments: SponsorTime[]): boolean {
        if (segments.length !== this.segments.length) return false;

        for (let i = 0; i < segments.length; i++) {
            if (segments[i].UUID !== this.segments[i].UUID) return false;
        }

        return true;
    }
}

export default UpcomingNotice;