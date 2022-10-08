import * as React from "react";
import { createRoot, Root } from 'react-dom/client';

import Utils from "../utils";
const utils = new Utils();

import SkipNoticeComponent from "../components/SkipNoticeComponent";
import { SponsorTime, ContentContainer, NoticeVisbilityMode } from "../types";
import Config from "../config";
import { SkipNoticeAction } from "../utils/noticeUtils";

class SkipNotice {
    segments: SponsorTime[];
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    noticeElement: HTMLDivElement;

    skipNoticeRef: React.MutableRefObject<SkipNoticeComponent>;
    root: Root;

    constructor(segments: SponsorTime[], autoSkip = false, contentContainer: ContentContainer, unskipTime: number = null, startReskip = false) {
        this.skipNoticeRef = React.createRef();

        this.segments = segments;
        this.autoSkip = autoSkip;
        this.contentContainer = contentContainer;

        const referenceNode = utils.findReferenceNode();
    
        const amountOfPreviousNotices = document.getElementsByClassName("sponsorSkipNotice").length;
        //this is the suffix added at the end of every id
        let idSuffix = "";
        for (const segment of this.segments) {
            idSuffix += segment.UUID;
        }
        idSuffix += amountOfPreviousNotices;

        this.noticeElement = document.createElement("div");
        this.noticeElement.id = "sponsorSkipNoticeContainer" + idSuffix;

        referenceNode.prepend(this.noticeElement);

        this.root = createRoot(this.noticeElement);
        this.root.render(
            <SkipNoticeComponent segments={segments} 
                autoSkip={autoSkip} 
                startReskip={startReskip}
                contentContainer={contentContainer}
                ref={this.skipNoticeRef}
                closeListener={() => this.close()}
                smaller={Config.config.noticeVisibilityMode >= NoticeVisbilityMode.MiniForAll 
                    || (Config.config.noticeVisibilityMode >= NoticeVisbilityMode.MiniForAutoSkip && autoSkip)}
                unskipTime={unskipTime} />
        );
    }

    setShowKeybindHint(value: boolean): void {
        this.skipNoticeRef?.current?.setState({
            showKeybindHint: value
        });
    }

    close(): void {
        this.root.unmount();

        this.noticeElement.remove();

        const skipNotices = this.contentContainer().skipNotices;
        skipNotices.splice(skipNotices.indexOf(this), 1);
    }

    toggleSkip(): void {
        this.skipNoticeRef?.current?.prepAction(SkipNoticeAction.Unskip0);
    }

    unmutedListener(time: number): void {
        this.skipNoticeRef?.current?.unmutedListener(time);
    }
}

export default SkipNotice;