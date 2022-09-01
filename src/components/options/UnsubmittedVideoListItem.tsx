import * as React from "react";

import Config from "../../config";
import { exportTimes, exportTimesAsHashParam } from "../../utils/exporter";

export interface UnsubmittedVideosListItemProps {
    videoID: string;
}

export interface UnsubmittedVideosListItemState {
}

class UnsubmittedVideoListItem extends React.Component<UnsubmittedVideosListItemProps, UnsubmittedVideosListItemState> {

    constructor(props: UnsubmittedVideosListItemProps) {
        super(props);

        // Setup state
        this.state = {

        };
    }

    render(): React.ReactElement {
        const segmentCount = Config.config.unsubmittedSegments[this.props.videoID]?.length ?? 0;

        return (
            <>
                <tr id={this.props.videoID + "UnsubmittedSegmentsRow"}
                    className="categoryTableElement">
                    <td id={this.props.videoID + "UnsubmittedVideoID"}
                        className="categoryTableLabel">
                        <a href={`https://youtu.be/${this.props.videoID}`}
                           target="_blank" rel="noreferrer">
                            {this.props.videoID}
                        </a>
                    </td>

                    <td id={this.props.videoID + "UnsubmittedSegmentCount"}>
                        {segmentCount}
                    </td>

                    <td id={this.props.videoID + "UnsubmittedVideoActions"}>
                        <div id={this.props.videoID + "ExportSegmentsAction"}
                             className="option-button inline low-profile"
                             onClick={this.exportSegments.bind(this)}>
                            {chrome.i18n.getMessage("exportSegments")}
                        </div>
                        {" "}
                        <div id={this.props.videoID + "ExportSegmentsAsURLAction"}
                             className="option-button inline low-profile"
                             onClick={this.exportSegmentsAsURL.bind(this)}>
                            {chrome.i18n.getMessage("exportSegmentsAsURL")}
                        </div>
                        {" "}
                        <div id={this.props.videoID + "ClearSegmentsAction"}
                             className="option-button inline low-profile"
                             onClick={this.clearSegments.bind(this)}>
                            {chrome.i18n.getMessage("clearTimes")}
                        </div>
                    </td>

                </tr>

            </>
        );
    }

    clearSegments(): void {
        if (confirm(chrome.i18n.getMessage("clearThis"))) {
            delete Config.config.unsubmittedSegments[this.props.videoID];
            Config.forceSyncUpdate("unsubmittedSegments");
        }
    }

    exportSegments(): void {
        this.copyToClipboard(exportTimes(Config.config.unsubmittedSegments[this.props.videoID]));
    }

    exportSegmentsAsURL(): void {
        this.copyToClipboard(`https://youtube.com/watch?v=${this.props.videoID}${exportTimesAsHashParam(Config.config.unsubmittedSegments[this.props.videoID])}`)
    }

    copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text)
            .then(() => {
                alert(chrome.i18n.getMessage("CopiedExclamation"));
            })
            .catch(() => {
                alert(chrome.i18n.getMessage("copyDebugInformationFailed"));
            });
    }
}

export default UnsubmittedVideoListItem;
