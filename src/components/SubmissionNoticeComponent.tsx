import * as React from "react";
import Config from "../config"
import GenericNotice from "../render/GenericNotice";
import { Category, ContentContainer } from "../types";
import * as CompileConfig from "../../config.json";

import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import SponsorTimeEditComponent from "./SponsorTimeEditComponent";
import { getGuidelineInfo } from "../utils/constants";
import { exportTimes } from "../utils/exporter";

export interface SubmissionNoticeProps { 
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => unknown;

    closeListener: () => void;
}

export interface SubmissionNoticeState {
    noticeTitle: string;
    messages: string[];
    idSuffix: string;
}

class SubmissionNoticeComponent extends React.Component<SubmissionNoticeProps, SubmissionNoticeState> {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    callback: () => unknown;

    noticeRef: React.MutableRefObject<NoticeComponent>;
    timeEditRefs: React.RefObject<SponsorTimeEditComponent>[];

    videoObserver: MutationObserver;

    guidelinesReminder: GenericNotice;

    lastSegmentCount: number;

    constructor(props: SubmissionNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();

        this.contentContainer = props.contentContainer;
        this.callback = props.callback;
    
        const noticeTitle = chrome.i18n.getMessage("confirmNoticeTitle");

        this.lastSegmentCount = this.props.contentContainer().sponsorTimesSubmitting.length;

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],
            idSuffix: "SubmissionNotice"
        };
    }

    componentDidMount(): void {
        // Catch and rerender when the video size changes
        //TODO: Use ResizeObserver when it is supported in TypeScript
        this.videoObserver = new MutationObserver(() => {
            this.forceUpdate();
        });

        this.videoObserver.observe(this.contentContainer().v, {
            attributes: true
        });
    }

    componentWillUnmount(): void {
        if (this.videoObserver) {
            this.videoObserver.disconnect();
        }
    }

    componentDidUpdate() {
        const currentSegmentCount = this.props.contentContainer().sponsorTimesSubmitting.length;
        if (currentSegmentCount > this.lastSegmentCount) {
            this.lastSegmentCount = currentSegmentCount;

            const scrollElement = this.noticeRef.current.getElement().current.querySelector("#sponsorSkipNoticeMiddleRowSubmissionNotice");
            scrollElement.scrollTo({
                top: scrollElement.scrollHeight + 1000
            });
        }
    }

    render(): React.ReactElement {
        const sortButton = 
            <img id={"sponsorSkipSortButton" + this.state.idSuffix} 
                className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipSmallButton"
                onClick={() => this.sortSegments()}
                title={chrome.i18n.getMessage("sortSegments")}
                key="sortButton"
                src={chrome.extension.getURL("icons/sort.svg")}>
            </img>;
        const exportButton = 
            <img id={"sponsorSkipExportButton" + this.state.idSuffix} 
                className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipSmallButton"
                onClick={() => this.exportSegments()}
                title={chrome.i18n.getMessage("exportSegments")}
                key="exportButton"
                src={chrome.extension.getURL("icons/export.svg")}>
            </img>;
        return (
            <NoticeComponent noticeTitle={this.state.noticeTitle}
                idSuffix={this.state.idSuffix}
                ref={this.noticeRef}
                closeListener={this.cancel.bind(this)}
                zIndex={5000}
                firstColumn={[sortButton, exportButton]}>

                {/* Text Boxes */}
                {this.getMessageBoxes()}

                {/* Sponsor Time List */}
                <tr id={"sponsorSkipNoticeMiddleRow" + this.state.idSuffix}
                    className="sponsorTimeMessagesRow"
                    style={{maxHeight: (this.contentContainer().v.offsetHeight - 200) + "px"}}>
                    <td style={{width: "100%"}}>
                        {this.getSponsorTimeMessages()}
                    </td>
                </tr>

                {/* Last Row */}
                <tr id={"sponsorSkipNoticeSecondRow" + this.state.idSuffix}>

                    <td className="sponsorSkipNoticeRightSection"
                        style={{position: "relative"}}>

                        {/* Guidelines button */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={() => window.open("https://wiki.sponsor.ajay.app/w/Guidelines")}>

                            {chrome.i18n.getMessage(Config.config.submissionCountSinceCategories > 3 ? "guidelines" : "readTheGuidelines")}
                        </button>

                        {/* Submit Button */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={this.submit.bind(this)}>

                            {chrome.i18n.getMessage("submit")}
                        </button>
                    </td>
                </tr>

            </NoticeComponent>
        );
    }

    getSponsorTimeMessages(): JSX.Element[] | JSX.Element {
        const elements: JSX.Element[] = [];
        this.timeEditRefs = [];

        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;

        for (let i = 0; i < sponsorTimes.length; i++) {
            const timeRef = React.createRef<SponsorTimeEditComponent>();

            elements.push(
                <SponsorTimeEditComponent key={sponsorTimes[i].UUID}
                    idSuffix={this.state.idSuffix + i}
                    index={i}
                    contentContainer={this.props.contentContainer}
                    submissionNotice={this}
                    categoryChangeListener={this.categoryChangeListener.bind(this)}
                    ref={timeRef}>
                </SponsorTimeEditComponent>
            );

            this.timeEditRefs.push(timeRef);
        }

        return elements;
    }

    getMessageBoxes(): JSX.Element[] | JSX.Element {
        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <NoticeTextSelectionComponent idSuffix={this.state.idSuffix + i}
                    text={this.state.messages[i]}
                    key={i}>
                </NoticeTextSelectionComponent>
            );
        }

        return elements;
    }

    cancel(): void {
        this.guidelinesReminder?.close();
        this.noticeRef.current.close(true);

        this.contentContainer().resetSponsorSubmissionNotice(false);

        this.props.closeListener();
    }

    submit(): void {
        // save all items
        for (const ref of this.timeEditRefs) {
            ref.current.saveEditTimes();
        }

        const sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;
        for (const sponsorTime of sponsorTimesSubmitting) {
            if (sponsorTime.category === "chooseACategory") {
                alert(chrome.i18n.getMessage("youMustSelectACategory"));
                return;
            }
        }

        // Check if any non music categories are being used on a music video
        if (this.contentContainer().videoInfo?.microformat?.playerMicroformatRenderer?.category === "Music") {
            for (const sponsorTime of sponsorTimesSubmitting) {
                if (sponsorTime.category === "sponsor") {
                    if (!confirm(chrome.i18n.getMessage("nonMusicCategoryOnMusic"))) return;

                    break;
                }
            }
        }

        this.props.callback();

        this.cancel();
    }

    sortSegments(): void {
        let sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;
        sponsorTimesSubmitting = sponsorTimesSubmitting.sort((a, b) => a.segment[0] - b.segment[0]);

        Config.config.unsubmittedSegments[this.props.contentContainer().sponsorVideoID] = sponsorTimesSubmitting;
        Config.forceSyncUpdate("unsubmittedSegments");

        this.forceUpdate();
    }

    exportSegments() {
        const sponsorTimesSubmitting = this.props.contentContainer()
            .sponsorTimesSubmitting.sort((a, b) => a.segment[0] - b.segment[0]);
        window.navigator.clipboard.writeText(exportTimes(sponsorTimesSubmitting));

        new GenericNotice(null, "exportCopied", {
            title: chrome.i18n.getMessage(`CopiedExclamation`),
            timed: true,
            maxCountdownTime: () => 0.6,
            referenceNode: document.querySelector(".noticeLeftIcon"),
            dontPauseCountdown: true,
            style: {
                top: 0,
                bottom: 0,
                minWidth: 0,
                right: "30px",
                margin: "auto"
            },
            hideLogo: true,
            hideRightInfo: true,
            extraClass: "exportCopiedNotice"
        });
    }

    categoryChangeListener(index: number, category: Category): void {
        const dialogWidth = this.noticeRef?.current?.getElement()?.current?.offsetWidth;
        if (category !== "chooseACategory" && Config.config.showCategoryGuidelines
                && this.contentContainer().v.offsetWidth > dialogWidth * 2) {
            const options = {
                title:  chrome.i18n.getMessage(`category_${category}`),
                textBoxes: getGuidelineInfo(category),
                buttons: [{
                        name: chrome.i18n.getMessage("FullDetails"),
                        listener: () => window.open(CompileConfig.wikiLinks[category])
                    },
                    {
                        name: chrome.i18n.getMessage("Hide"),
                        listener: () => {
                            Config.config.showCategoryGuidelines = false;
                            this.guidelinesReminder?.close();
                            this.guidelinesReminder = null;
                        }
                }],
                timed: false,
                style: {
                    right: `${dialogWidth + 10}px`,
                },
                extraClass: "sb-guidelines-notice"
            };

            if (options.textBoxes) {
                if (this.guidelinesReminder) {
                    this.guidelinesReminder.update(options);
                } else {
                    this.guidelinesReminder = new GenericNotice(null, "GuidelinesReminder", options);
                }
            } else {
                this.guidelinesReminder?.close();
                this.guidelinesReminder = null;
            }
        }
    }
}

export default SubmissionNoticeComponent;
