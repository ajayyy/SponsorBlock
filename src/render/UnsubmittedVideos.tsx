import * as React from "react";
import * as ReactDOM from "react-dom";
import UnsubmittedVideosComponent from "../components/options/UnsubmittedVideosComponent";

class UnsubmittedVideos {

    ref: React.RefObject<UnsubmittedVideosComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        ReactDOM.render(
            <UnsubmittedVideosComponent ref={this.ref} />,
            element
        );
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }

}

export default UnsubmittedVideos;
