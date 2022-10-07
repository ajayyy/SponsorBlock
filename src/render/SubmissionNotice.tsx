import * as React from "react";
import { createRoot, Root } from 'react-dom/client';

import Utils from "../utils";
const utils = new Utils();

import SubmissionNoticeComponent from "../components/SubmissionNoticeComponent";
import { ContentContainer } from "../types";

class SubmissionNotice {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => unknown;

    callback: () => unknown;

    noticeRef: React.MutableRefObject<SubmissionNoticeComponent>;

    noticeElement: HTMLDivElement;

    root: Root;

    constructor(contentContainer: ContentContainer, callback: () => unknown) {
        this.noticeRef = React.createRef();

        this.contentContainer = contentContainer;
        this.callback = callback;

        const referenceNode = utils.findReferenceNode();
    
        this.noticeElement = document.createElement("div");
        this.noticeElement.id = "submissionNoticeContainer";

        referenceNode.prepend(this.noticeElement);

        this.root = createRoot(this.noticeElement);
        this.root.render(
            <SubmissionNoticeComponent
                contentContainer={contentContainer}
                callback={callback} 
                ref={this.noticeRef}
                closeListener={() => this.close(false)} />
        );
    }

    update(): void {
        this.noticeRef.current.forceUpdate();
    }

    close(callRef = true): void {
        if (callRef) this.noticeRef.current.cancel();
        this.root.unmount();

        this.noticeElement.remove();
    }
}

export default SubmissionNotice;