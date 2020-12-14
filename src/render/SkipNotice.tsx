import * as React from "react";
import * as ReactDOM from "react-dom";

import SkipNoticeComponent from "../components/SkipNoticeComponent";
import { SponsorTime, ContentContainer } from "../types";

class SkipNotice {
    segments: SponsorTime[];
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    noticeElement: HTMLDivElement;

    skipNoticeRef: React.MutableRefObject<SkipNoticeComponent>;

    constructor(segments: SponsorTime[], autoSkip = false, contentContainer: ContentContainer) {
        this.segments = segments;
        this.autoSkip = autoSkip;
        this.contentContainer = contentContainer;

        //get reference node
        let referenceNode = document.getElementById("player-container-id") 
                                || document.getElementById("movie_player") || document.querySelector("#player-container .video-js");
        if (referenceNode == null) {
            //for embeds
            const player = document.getElementById("player");
            referenceNode = player.firstChild as HTMLElement;
            let index = 1;

            //find the child that is the video player (sometimes it is not the first)
            while (!referenceNode.classList.contains("html5-video-player") || !referenceNode.classList.contains("ytp-embed")) {
                referenceNode = player.children[index] as HTMLElement;

                index++;
            }
        }
        // YouTube Music
        if (new URL(document.URL).host === "music.youtube.com") {
            referenceNode = document.querySelector("#main-panel.ytmusic-player-page");
        }
    
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

        ReactDOM.render(
            <SkipNoticeComponent segments={segments} 
                autoSkip={autoSkip} 
                contentContainer={contentContainer}
                ref={this.skipNoticeRef}
                closeListener={() => this.close()} />,
            this.noticeElement
        );
    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.noticeElement);

        this.noticeElement.remove();
    }
}

export default SkipNotice;