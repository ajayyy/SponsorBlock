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
    editing: boolean;
    sponsorTimeEdits: number[][];
}

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    idSuffix: string;

    constructor(props: SponsorTimeEditProps) {
        super(props);

        this.idSuffix = this.idSuffix;

        this.state = {
            editing: false,
            sponsorTimeEdits: [[null, null], [null, null]]
        };
    }

    componentDidMount() {
        // Prevent inputs from triggering key events
        document.getElementById("sponsorTimesContainer" + this.idSuffix).addEventListener('keydown', function (event) {
            event.stopPropagation();
        });
    }

    render() {
        let style: React.CSSProperties = {
            textAlign: "center"
        };

        if (this.props.index != 0) {
            style.marginTop = "15px";
        }

        // Create time display
        let timeDisplay: JSX.Element;
        let sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        if (this.state.editing) {
            
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay">

                        <span id={"nowButton0" + this.idSuffix}
                            className="sponsorNowButton"
                            onClick={(() => this.setTimeToNow.bind(this)(0)).bind(this)}>
                                {chrome.i18n.getMessage("bracketNow")}
                        </span>

                        <input id={"submittingTimeMinutes0" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditMinutes"
                            type="number"
                            value={this.state.sponsorTimeEdits[0][0]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[0][0] = parseFloat(e.target.value);

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <input id={"submittingTimeSeconds0" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditSeconds"
                            type="number"
                            value={this.state.sponsorTimeEdits[0][1]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[0][1] = parseFloat(e.target.value);

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <span>
                            {" " + chrome.i18n.getMessage("to") + " "}
                        </span>

                        <input id={"submittingTimeMinutes1" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditMinutes"
                            type="text"
                            value={this.state.sponsorTimeEdits[1][0]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[1][0] = parseFloat(e.target.value);

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <input id={"submittingTimeSeconds1" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditSeconds"
                            type="text"
                            value={this.state.sponsorTimeEdits[1][1]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[1][1] = parseFloat(e.target.value);

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <span id={"nowButton1" + this.idSuffix}
                            className="sponsorNowButton"
                            onClick={(() => this.setTimeToNow.bind(this)(1)).bind(this)}>
                                {chrome.i18n.getMessage("bracketNow")}
                        </span>
                </div>
            );
        } else {
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay"
                    onClick={this.toggleEditTime.bind(this)}>
                        {utils.getFormattedTime(sponsorTime[0], true) +
                            ((sponsorTime.length >= 1) ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(sponsorTime[1], true) : "")}
                </div>
            );
        }

        return (
            <div style={style}>
                
                {timeDisplay}

                <span id={"sponsorTimeDeleteButton" + this.idSuffix}
                    className="sponsorTimeEditButton"
                    onClick={this.deleteTime.bind(this)}>
                    {chrome.i18n.getMessage("delete")}
                </span>

                {(sponsorTime.length >= 1) ? (
                    <span id={"sponsorTimePreviewButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.previewTime.bind(this)}>
                        {chrome.i18n.getMessage("preview")}
                    </span>
                ): ""}

                {(sponsorTime.length >= 1) ? (
                    <span id={"sponsorTimeEditButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.toggleEditTime.bind(this)}>
                        {this.state.editing ? chrome.i18n.getMessage("save") : chrome.i18n.getMessage("edit")}
                    </span>
                ): ""}
            </div>
        );
    }

    setTimeToNow(index: number) {
        let sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];

        sponsorTime[index] = 
            this.props.contentContainer().v.currentTime;

        this.setState({
            sponsorTimeEdits: this.getFormattedSponsorTimesEdits(sponsorTime)
        }, this.saveEditTimes);
    }

    toggleEditTime(): void {
        if (this.state.editing) {
            
            this.setState({
                editing: false
            });

            this.saveEditTimes();            
        } else {
            let sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];

            this.setState({
                editing: true,
                sponsorTimeEdits: this.getFormattedSponsorTimesEdits(sponsorTime)
            });
        }
    }

    /** Returns an array in the sponsorTimeEdits form (minutes and seconds) from a normal seconds sponsor time */
    getFormattedSponsorTimesEdits(sponsorTime: number[]): number[][] {
        return [[utils.getFormattedMinutes(sponsorTime[0]), utils.getFormattedSeconds(sponsorTime[0])], 
            [utils.getFormattedMinutes(sponsorTime[1]), utils.getFormattedSeconds(sponsorTime[1])]]
    }

    saveEditTimes() {
        // Save sponsorTimes
        this.props.contentContainer().sponsorTimesSubmitting[this.props.index] = 
            [utils.getRawSeconds(this.state.sponsorTimeEdits[0][0], this.state.sponsorTimeEdits[0][1]),
            utils.getRawSeconds(this.state.sponsorTimeEdits[1][0], this.state.sponsorTimeEdits[1][1])];

        Config.config.sponsorTimes.set(this.props.contentContainer().sponsorVideoID, this.props.contentContainer().sponsorTimesSubmitting);

        this.props.contentContainer().updatePreviewBar();
    }

    previewTime(): void {
        let sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        let index = this.props.index;

        let skipTime = sponsorTimes[index][0];

        if (this.state.editing) {
            // Save edits before previewing
            this.saveEditTimes();
        }

        this.props.contentContainer().previewTime(skipTime - 2);
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