import * as React from "react";
import * as ReactDOM from "react-dom";

import SubmissionNoticeComponent from "../components/SubmissionNoticeComponent";

class SubmissionNotice {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => any;

    callback: () => any;

    constructor(contentContainer: () => any, callback: () => any) {
        this.contentContainer = contentContainer;
        this.callback = callback;

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
    
        let noticeElement = document.createElement("div");
        noticeElement.id = "submissionNoticeContainer";

        referenceNode.prepend(noticeElement);

        ReactDOM.render(
            <SubmissionNoticeComponent
                contentContainer={contentContainer}
                callback={callback} />,
            noticeElement
        );
    }
}

export default SubmissionNotice;