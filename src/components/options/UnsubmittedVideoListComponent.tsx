import * as React from "react";

import Config from "../../config";
import UnsubmittedVideoListItem from "./UnsubmittedVideoListItem";

export interface UnsubmittedVideoListProps {

}

export interface UnsubmittedVideoListState {

}

class UnsubmittedVideoListComponent extends React.Component<UnsubmittedVideoListProps, UnsubmittedVideoListState> {

    constructor(props: UnsubmittedVideoListProps) {
        super(props);

        // Setup state
        this.state = {

        };
    }

    render(): React.ReactElement {
        // Render nothing if there are no unsubmitted segments
        if (Object.keys(Config.config.unsubmittedSegments).length == 0)
            return <></>;

        return (
            <table id="unsubmittedVideosList"
                className="categoryChooserTable"
                style={{marginTop: "10px"}} >
                <tbody>
                    {/* Headers */}
                    <tr id="UnsubmittedVideosListHeader"
                            className="categoryTableElement categoryTableHeader">
                        <th id="UnsubmittedVideoID">
                            {chrome.i18n.getMessage("videoID")}
                        </th>

                        <th id="UnsubmittedSegmentCount">
                            {chrome.i18n.getMessage("segmentCount")}
                        </th>

                        <th id="UnsubmittedVideoActions">
                            {chrome.i18n.getMessage("actions")}
                        </th>

                    </tr>

                    {this.getUnsubmittedVideos()}
                </tbody>
            </table>
        );
    }

    getUnsubmittedVideos(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        for (const videoID of Object.keys(Config.config.unsubmittedSegments)) {
            elements.push(
                <UnsubmittedVideoListItem videoID={videoID} key={videoID}>
                </UnsubmittedVideoListItem>
            );
        }

        return elements;
    }
}

export default UnsubmittedVideoListComponent;
