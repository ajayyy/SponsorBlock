import * as React from "react";
import Config from "../config";
import UnsubmittedVideoListComponent from "./UnsubmittedVideoListComponent";

export interface UnsubmittedVideosProps {

}

export interface UnsubmittedVideosState {
    tableVisible: boolean,
}

class UnsubmittedVideosComponent extends React.Component<UnsubmittedVideosProps, UnsubmittedVideosState> {

    constructor(props: UnsubmittedVideosProps) {
        super(props);

        // Setup state
        this.state = {
            tableVisible: false,
        };
    }

    render(): React.ReactElement {
        const videoCount = Object.keys(Config.config.unsubmittedSegments).length;
        const segmentCount = Object.values(Config.config.unsubmittedSegments).reduce((acc: number, vid: Array<unknown>) => acc+vid.length, 0);

        return <>
            <div>
                {chrome.i18n.getMessage("unsubmittedSegmentCounts").replace("{0}", segmentCount.toString()).replace("{1}", videoCount.toString())}
            </div>

            {videoCount > 0 && <div className="option-button inline" onClick={() => this.setState({tableVisible: !this.state.tableVisible})}>
                {chrome.i18n.getMessage(this.state.tableVisible ? "hideUnsubmittedSegments" : "showUnsubmittedSegments")}
            </div>}

            <div className="option-button inline" onClick={this.clearAllSegments}>
                {chrome.i18n.getMessage("clearUnsubmittedSegments")}
            </div>

            {this.state.tableVisible && <UnsubmittedVideoListComponent/>}
        </>;
    }

    clearAllSegments(): void {
        if (confirm(chrome.i18n.getMessage("clearUnsubmittedSegmentsConfirm")))
            Config.config.unsubmittedSegments = {};
    }
}

export default UnsubmittedVideosComponent;
