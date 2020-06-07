import * as React from "react";

import Config from "../config";
import * as CompileConfig from "../../config.json";

import Utils from "../utils";
import { ContentContainer, SponsorTime } from "../types";
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
    sponsorTimeEdits: string[][];
}

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    idSuffix: string;

    categoryOptionRef: React.RefObject<HTMLSelectElement>;

    configUpdateListener: () => void;

    constructor(props: SponsorTimeEditProps) {
        super(props);

        this.categoryOptionRef = React.createRef();

        this.idSuffix = this.props.idSuffix;

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

        // Add as a config listener
        if (!this.configUpdateListener) {
            this.configUpdateListener = () => this.configUpdate();
            Config.configListeners.push(this.configUpdate.bind(this));
        }
    }

    componentWillUnmount() {
        if (this.configUpdateListener) {
            Config.configListeners.splice(Config.configListeners.indexOf(this.configUpdate.bind(this)), 1);
        }
    }

    render() {
        let style: React.CSSProperties = {
            textAlign: "center"
        };

        if (this.props.index != 0) {
            style.marginTop = "15px";
        }

        // This method is required to get !important
        // https://stackoverflow.com/a/45669262/1985387
        let oldYouTubeDarkStyles = (node) => {
            if (node) {
                node.style.setProperty("color", "black", "important");
                node.style.setProperty("text-shadow", "none", "important");
            }
        };

        // Create time display
        let timeDisplay: JSX.Element;
        let sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        let segment = sponsorTime.segment;
        if (this.state.editing) {
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay">

                        <span id={"nowButton0" + this.idSuffix}
                            className="sponsorNowButton"
                            onClick={() => this.setTimeToNow(0)}>
                                {chrome.i18n.getMessage("bracketNow")}
                        </span>

                        <input id={"submittingTimeMinutes0" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditMinutes"
                            ref={oldYouTubeDarkStyles}
                            type="number"
                            value={this.state.sponsorTimeEdits[0][0]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[0][0] = e.target.value;

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <input id={"submittingTimeSeconds0" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditSeconds"
                            ref={oldYouTubeDarkStyles}
                            type="number"
                            value={this.state.sponsorTimeEdits[0][1]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[0][1] = e.target.value;

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <span>
                            {" " + chrome.i18n.getMessage("to") + " "}
                        </span>

                        <input id={"submittingTimeMinutes1" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditMinutes"
                            ref={oldYouTubeDarkStyles}
                            type="text"
                            value={this.state.sponsorTimeEdits[1][0]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[1][0] = e.target.value;

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <input id={"submittingTimeSeconds1" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditSeconds"
                            ref={oldYouTubeDarkStyles}
                            type="text"
                            value={this.state.sponsorTimeEdits[1][1]}
                            onChange={(e) => {
                                let sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[1][1] = e.target.value;

                                this.setState({sponsorTimeEdits});
                            }}>
                        </input>

                        <span id={"nowButton1" + this.idSuffix}
                            className="sponsorNowButton"
                            onClick={() => this.setTimeToNow(1)}>
                                {chrome.i18n.getMessage("bracketNow")}
                        </span>

                        <span id={"endButton" + this.idSuffix}
                            className="sponsorNowButton"
                            onClick={() => this.setTimeToEnd()}>
                                {chrome.i18n.getMessage("bracketEnd")}
                        </span>
                </div>
            );
        } else {
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay"
                    onClick={this.toggleEditTime.bind(this)}>
                        {utils.getFormattedTime(segment[0], true) +
                            ((!isNaN(segment[1])) ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(segment[1], true) : "")}
                </div>
            );
        }

        return (
            <div style={style}>
                
                {timeDisplay}

                {/* Category */}
                <div style={{position: "relative"}}>
                    <select id={"sponsorTimeCategories" + this.idSuffix}
                        className="sponsorTimeCategories"
                        defaultValue={sponsorTime.category}
                        ref={this.categoryOptionRef}
                        onChange={this.categorySelectionChange.bind(this)}>
                        {this.getCategoryOptions()}
                    </select>

                    <img id={"sponsorTimeCategoriesHelpButton" + this.idSuffix}
                        className="helpButton"
                        src={chrome.extension.getURL("icons/help.svg")}
                        title={chrome.i18n.getMessage("categoryGuidelines")}
                        onClick={() => chrome.runtime.sendMessage({"message": "openConfig"})}>
                    
                    </img>
                </div>

                <br/>

                {/* Editing Tools */}

                <span id={"sponsorTimeDeleteButton" + this.idSuffix}
                    className="sponsorTimeEditButton"
                    onClick={this.deleteTime.bind(this)}>
                    {chrome.i18n.getMessage("delete")}
                </span>

                {(!isNaN(segment[1])) ? (
                    <span id={"sponsorTimePreviewButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.previewTime.bind(this)}>
                        {chrome.i18n.getMessage("preview")}
                    </span>
                ): ""}

                {(!isNaN(segment[1])) ? (
                    <span id={"sponsorTimeEditButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.toggleEditTime.bind(this)}>
                        {this.state.editing ? chrome.i18n.getMessage("save") : chrome.i18n.getMessage("edit")}
                    </span>
                ): ""}
            </div>
        );
    }

    getCategoryOptions() {
        let elements = [];

        for (const category of Config.config.categorySelections) {
            elements.push(
                <option value={category.name}
                        key={category.name}>
                    {chrome.i18n.getMessage("category_" + category.name)}
                </option>
            );
        }

        if (elements.length < CompileConfig.categoryList.length) {
            // Add show more button
            elements.push(
                <option value={"moreCategories"}
                        key={"moreCategories"}>
                    {chrome.i18n.getMessage("moreCategories")}
                </option>
            );
        }

        return elements;
    }

    categorySelectionChange(event: React.ChangeEvent<HTMLSelectElement>) {
        // See if show more categories was pressed
        if (event.target.value === "moreCategories") {
            // Open options page
            chrome.runtime.sendMessage({"message": "openConfig"});

            // Reset option to previous
            event.target.value = this.props.contentContainer().sponsorTimesSubmitting[this.props.index].category;
            return;
        }

        this.saveEditTimes();
    }

    setTimeToNow(index: number) {
        this.setTimeTo(index, this.props.contentContainer().getRealCurrentTime());
    }

    setTimeToEnd() {
        this.setTimeTo(1, this.props.contentContainer().v.duration);
    }

    setTimeTo(index: number, time: number) {
        let sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];

        sponsorTime.segment[index] = 
            time;

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
    getFormattedSponsorTimesEdits(sponsorTime: SponsorTime): string[][] {
        return [[String(utils.getFormattedMinutes(sponsorTime.segment[0])), String(utils.getFormattedSeconds(sponsorTime.segment[0]))], 
            [String(utils.getFormattedMinutes(sponsorTime.segment[1])), String(utils.getFormattedSeconds(sponsorTime.segment[1]))]];
    }

    saveEditTimes() {
        let sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;

        if (this.state.editing) {
            sponsorTimesSubmitting[this.props.index].segment = 
                [utils.getRawSeconds(parseFloat(this.state.sponsorTimeEdits[0][0]), parseFloat(this.state.sponsorTimeEdits[0][1])),
                utils.getRawSeconds(parseFloat(this.state.sponsorTimeEdits[1][0]), parseFloat(this.state.sponsorTimeEdits[1][1]))];
        }

        sponsorTimesSubmitting[this.props.index].category = this.categoryOptionRef.current.value;

        Config.config.sponsorTimes.set(this.props.contentContainer().sponsorVideoID, utils.getSegmentsFromSponsorTimes(sponsorTimesSubmitting));

        this.props.contentContainer().updatePreviewBar();
    }

    previewTime(): void {
        let sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        let index = this.props.index;

        let skipTime = sponsorTimes[index].segment[0];

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
        if (sponsorTimes[index].segment.length < 2) {
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

    configUpdate() {
        this.forceUpdate();
    }
}

export default SponsorTimeEditComponent;