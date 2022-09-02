import * as React from "react";
import Config from "../../config";
import UnsubmittedVideoListComponent from "./UnsubmittedVideoListComponent";

export interface UnsubmittedVideosProps {

}

export interface UnsubmittedVideosState {
    tableVisible: boolean,
}

class UnsubmittedVideosComponent extends React.Component<UnsubmittedVideosProps, UnsubmittedVideosState> {

    constructor(props: UnsubmittedVideosProps) {
        super(props);

        this.state = {
            tableVisible: false,
        };
    }

    render(): React.ReactElement {
        const videoCount = Object.keys(Config.config.unsubmittedSegments).length;
        const segmentCount = Object.values(Config.config.unsubmittedSegments).reduce((acc: number, vid: Array<unknown>) => acc + vid.length, 0);

        return <>
            <div style={{marginBottom: "10px"}}>
                {segmentCount == 0 ?
                    chrome.i18n.getMessage("unsubmittedSegmentCountsZero") :
                    chrome.i18n.getMessage("unsubmittedSegmentCounts")
                        .replace("{0}", `${segmentCount} ${chrome.i18n.getMessage("unsubmittedSegments" + (segmentCount == 1 ? "Singular" : "Plural"))}`)
                        .replace("{1}", `${videoCount} ${chrome.i18n.getMessage("videos" + (videoCount == 1 ? "Singular" : "Plural"))}`)
                }
            </div>

            {videoCount > 0 && <div className="option-button inline" onClick={() => this.setState({tableVisible: !this.state.tableVisible})}>
                {chrome.i18n.getMessage(this.state.tableVisible ? "hideUnsubmittedSegments" : "showUnsubmittedSegments")}
            </div>}
            {" "}
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
