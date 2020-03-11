import * as React from "react";

export interface SponsorTimeEditProps {
    index: number,

    idSuffix: string,
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => any;
}

export interface SponsorTimeEditState {

}

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    constructor(props: SponsorTimeEditProps) {
        super(props);
    }

    render() {
        return (
            <>
                <div id={"sponsorTimesContainer" + this.props.index + this.props.idSuffix}
                    className="sponsorTime">
                        {this.props.contentContainer().sponsorTimesSubmitting[this.props.index][0] 
                            + " to " + this.props.contentContainer().sponsorTimesSubmitting[this.props.index][1]}
                </div>

                <span id={"sponsorTimeDeleteButton" + this.props.index + this.props.idSuffix}>
                    {chrome.i18n.getMessage("delete")}
                </span>

                <span id={"sponsorTimePreviewButton" + this.props.index + this.props.idSuffix}>
                    {chrome.i18n.getMessage("preview")}
                </span>

                <span id={"sponsorTimeEditButton" + this.props.index + this.props.idSuffix}>
                    {chrome.i18n.getMessage("edit")}
                </span>
            </>
        );
    }
}

export default SponsorTimeEditComponent;