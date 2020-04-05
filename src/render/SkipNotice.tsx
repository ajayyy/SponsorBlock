import * as React from "react";
import * as ReactDOM from "react-dom";

import SkipNoticeComponent from "../components/SkipNoticeComponent";

class SkipNotice {
    UUID: string;
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => any;

    constructor(UUID: string, autoSkip: boolean = false, contentContainer) {
        this.UUID = UUID;
        this.autoSkip = autoSkip;
        this.contentContainer = contentContainer;

        //get reference node
        let referenceNode = document.getElementById("player-container-id") 
                                || document.getElementById("movie_player") || document.querySelector("#player-container .video-js");
        if (referenceNode == null) {
            //for embeds
            let player = document.getElementById("player");
            referenceNode = player.firstChild as HTMLElement;
            let index = 1;

            //find the child that is the video player (sometimes it is not the first)
            while (!referenceNode.classList.contains("html5-video-player") || !referenceNode.classList.contains("ytp-embed")) {
                referenceNode = player.children[index] as HTMLElement;

                index++;
            }
        }
    
        let amountOfPreviousNotices = document.getElementsByClassName("sponsorSkipNotice").length;
        //this is the suffix added at the end of every id
        let idSuffix = this.UUID + amountOfPreviousNotices;

        let noticeElement = document.createElement("div");
        noticeElement.id = "sponsorSkipNoticeContainer" + idSuffix;

        referenceNode.prepend(noticeElement);

        ReactDOM.render(
            <SkipNoticeComponent UUID={UUID} autoSkip={autoSkip} contentContainer={contentContainer} />,
            noticeElement
        );
    }
}

export default SkipNotice;