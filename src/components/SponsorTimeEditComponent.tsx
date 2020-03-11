import * as React from "react";

import Config from "../config"

import Utils from "../utils";
import { ContentContainer } from "../types";
import SubmissionNoticeComponent from "./SubmissionNoticeComponent";
var utils = new Utils();

export interface SponsorTimeEditProps {
    index: number,

    idSuffix: string,
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer,

    submissionNotice: SubmissionNoticeComponent;
}

export interface SponsorTimeEditState {

}

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    constructor(props: SponsorTimeEditProps) {
        super(props);
    }

    render() {
        let style: React.CSSProperties = {
            textAlign: "center"
        };

        if (this.props.index != 0) {
            style.marginTop = "15px";
        }

        return (
            <div style={style}>
                <div id={"sponsorTimesContainer" + this.props.index + this.props.idSuffix}
                    className="sponsorTimeDisplay">
                        {utils.getFormattedTime(this.props.contentContainer().sponsorTimesSubmitting[this.props.index][0])
                            + " to " + utils.getFormattedTime(this.props.contentContainer().sponsorTimesSubmitting[this.props.index][1])}
                </div>

                <span id={"sponsorTimeDeleteButton" + this.props.index + this.props.idSuffix}
                    className="sponsorTimeEditButton"
                    onClick={this.deleteTime.bind(this)}>
                    {chrome.i18n.getMessage("delete")}
                </span>

                <span id={"sponsorTimePreviewButton" + this.props.index + this.props.idSuffix}
                    className="sponsorTimeEditButton">
                    {chrome.i18n.getMessage("preview")}
                </span>

                <span id={"sponsorTimeEditButton" + this.props.index + this.props.idSuffix}
                    className="sponsorTimeEditButton">
                    {chrome.i18n.getMessage("edit")}
                </span>
            </div>
        );
    }

    deleteTime(): void {
        let sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        let index = this.props.index;

        //if it is not a complete sponsor time
        if (sponsorTimes[index].length < 2) {
            //update video player
            this.props.contentContainer().changeStartSponsorButton(true, false);
        }
  
        sponsorTimes.splice(index, 1);
  
        //save this
        Config.config.sponsorTimes.set(this.props.contentContainer().sponsorVideoID, sponsorTimes);

        this.props.contentContainer().updatePreviewBar();
        
        //if they are all removed
        if (sponsorTimes.length == 0) {
            this.props.submissionNotice.cancel();
            
            //update video player
            this.props.contentContainer().changeStartSponsorButton(true, false);
        } else {
            //update display
            this.props.submissionNotice.forceUpdate();
        }
    }
}

export default SponsorTimeEditComponent;