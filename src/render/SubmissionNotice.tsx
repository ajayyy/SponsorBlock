import * as React from "react";
import * as ReactDOM from "react-dom";

import SubmissionNoticeComponent from "../components/SubmissionNoticeComponent";
import { ContentContainer } from "../types";

class SubmissionNotice {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => unknown;

    callback: () => unknown;

    noticeRef: React.MutableRefObject<SubmissionNoticeComponent>;

    noticeElement: HTMLDivElement;

    constructor(contentContainer: ContentContainer, callback: () => unknown) {
        this.noticeRef = React.createRef();

        this.contentContainer = contentContainer;
        this.callback = callback;

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
    
        this.noticeElement = document.createElement("div");
        this.noticeElement.id = "submissionNoticeContainer";

        referenceNode.prepend(this.noticeElement);

        ReactDOM.render(
            <SubmissionNoticeComponent
                contentContainer={contentContainer}
                callback={callback} 
                ref={this.noticeRef}
                closeListener={() => this.close()} />,
            this.noticeElement
        );
    }

    update(): void {
        this.noticeRef.current.forceUpdate();
    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.noticeElement);

        this.noticeElement.remove();
    }
}

export default SubmissionNotice;