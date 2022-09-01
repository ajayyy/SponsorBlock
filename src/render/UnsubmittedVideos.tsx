import * as React from "react";
import * as ReactDOM from "react-dom";
import UnsubmittedVideosComponent from "../components/options/UnsubmittedVideosComponent";

class UnsubmittedVideos {

    constructor(element: Element) {
        ReactDOM.render(
            <UnsubmittedVideosComponent/>,
            element
        );
    }
}

export default UnsubmittedVideos;
