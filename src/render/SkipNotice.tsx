import * as React from "react";
import { createRoot, Root } from 'react-dom/client';

import Utils from "../utils";
const utils = new Utils();

import SkipNoticeComponent from "../components/SkipNoticeComponent";
import { SponsorTime, ContentContainer, NoticeVisibilityMode } from "../types";
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

    constructor(segments: SponsorTime[], autoSkip = false, contentContainer: ContentContainer, componentDidMount: () => void, unskipTime: number = null, startReskip = false, upcomingNoticeShown: boolean, voteNotice = false) {
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
        this.noticeElement.className = "sponsorSkipNoticeContainer";
        this.noticeElement.id = "sponsorSkipNoticeContainer" + idSuffix;

        referenceNode.prepend(this.noticeElement);
        this.root = createRoot(this.noticeElement);
        this.root.render(
            <SkipNoticeComponent segments={segments} 
                autoSkip={autoSkip} 
                startReskip={startReskip}
                voteNotice={voteNotice}
                contentContainer={contentContainer}
                ref={this.skipNoticeRef}
                closeListener={() => this.close()}
                smaller={!voteNotice && (Config.config.noticeVisibilityMode >= NoticeVisibilityMode.MiniForAll 
                    || (Config.config.noticeVisibilityMode >= NoticeVisibilityMode.MiniForAutoSkip && autoSkip))}
                fadeIn={!upcomingNoticeShown && !voteNotice}
                unskipTime={unskipTime}
                componentDidMount={componentDidMount} />
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

    async waitForSkipNoticeRef(): Promise<SkipNoticeComponent> {
        const waitForRef = () => new Promise<SkipNoticeComponent>((resolve) => {
            const observer = new MutationObserver(() => {
            if (this.skipNoticeRef.current) {
                observer.disconnect();
                resolve(this.skipNoticeRef.current);
            }
            });

            observer.observe(document.getElementsByClassName("sponsorSkipNoticeContainer")[0], { childList: true, subtree: true});

            if (this.skipNoticeRef.current) {
            observer.disconnect();
            resolve(this.skipNoticeRef.current);
            }
        });

        return this.skipNoticeRef?.current || await waitForRef();
    }
}

export default SkipNotice;