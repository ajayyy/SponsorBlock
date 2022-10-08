import * as React from "react";
import { createRoot } from 'react-dom/client';
import UnsubmittedVideosComponent from "../components/options/UnsubmittedVideosComponent";

class UnsubmittedVideos {

    ref: React.RefObject<UnsubmittedVideosComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        const root = createRoot(element);
        root.render(
            <UnsubmittedVideosComponent ref={this.ref} />
        );
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }

}

export default UnsubmittedVideos;
