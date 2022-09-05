import * as React from "react";
import Config from "../config";
import { Category, SegmentUUID, SponsorTime } from "../types";

import ThumbsUpSvg from "../svg-icons/thumbs_up_svg";
import ThumbsDownSvg from "../svg-icons/thumbs_down_svg";
import { downvoteButtonColor, SkipNoticeAction } from "../utils/noticeUtils";
import { VoteResponse } from "../messageTypes";
import { AnimationUtils } from "../utils/animationUtils";
import { GenericUtils } from "../utils/genericUtils";
import { Tooltip } from "../render/Tooltip";

export interface ChapterVoteProps {
    vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>;
}

export interface ChapterVoteState {
    segment?: SponsorTime;
    show: boolean;
}

class ChapterVoteComponent extends React.Component<ChapterVoteProps, ChapterVoteState> {
    tooltip?: Tooltip;

    constructor(props: ChapterVoteProps) {
        super(props);

        this.state = {
            segment: null,
            show: false
        };
    }

    render(): React.ReactElement {
        if (this.tooltip && !this.state.show) {
            this.tooltip.close();
            this.tooltip = null;
        }

        return (
            <>
                {/* Upvote Button */}
                <button id={"sponsorTimesDownvoteButtonsContainerUpvoteChapter"}
                        className={"playerButton sbPlayerUpvote ytp-button " + (!this.state.show ? "hidden" : "")}
                        draggable="false"
                        title={chrome.i18n.getMessage("upvoteButtonInfo")}
                        onClick={(e) => this.vote(e, 1)}>
                    <ThumbsUpSvg className="playerButtonImage" 
                        fill={Config.config.colorPalette.white} 
                        width={null} height={null} />
                </button>

                {/* Downvote Button */}
                <button id={"sponsorTimesDownvoteButtonsContainerDownvoteChapter"}
                        className={"playerButton sbPlayerDownvote ytp-button " + (!this.state.show ? "hidden" : "")}
                        draggable="false"
                        title={chrome.i18n.getMessage("reportButtonInfo")}
                        onClick={(e) => {
                            const chapterNode = document.querySelector(".ytp-chapter-container") as HTMLElement;

                            if (this.tooltip) {
                                this.tooltip.close();
                                this.tooltip = null;
                            } else {
                                const referenceNode = chapterNode?.parentElement?.parentElement;
                                if (referenceNode) {
                                    const outerBounding = referenceNode.getBoundingClientRect();
                                    const buttonBounding = (e.target as HTMLElement)?.parentElement?.getBoundingClientRect();
                                    
                                    this.tooltip = new Tooltip({
                                        referenceNode: chapterNode?.parentElement?.parentElement,
                                        prependElement: chapterNode?.parentElement,
                                        showLogo: false,
                                        showGotIt: false,
                                        bottomOffset: `${outerBounding.height + 25}px`,
                                        leftOffset: `${buttonBounding.x - outerBounding.x}px`,
                                        extraClass: "centeredSBTriangle",
                                        buttons: [
                                            {
                                                name: chrome.i18n.getMessage("incorrectVote"),
                                                listener: (event) => this.vote(event, 0, e.target as HTMLElement).then(() => {
                                                    this.tooltip?.close();
                                                    this.tooltip = null;
                                                })
                                            }, {
                                                name: chrome.i18n.getMessage("harmfulVote"),
                                                listener: (event) => this.vote(event, 30, e.target as HTMLElement).then(() => {
                                                    this.tooltip?.close();
                                                    this.tooltip = null;
                                                })
                                            }
                                        ]
                                    });
                                }
                            }
                        }}>
                    <ThumbsDownSvg 
                        className="playerButtonImage" 
                        fill={downvoteButtonColor(this.state.segment ? [this.state.segment] : null, SkipNoticeAction.Downvote, SkipNoticeAction.Downvote)} 
                        width={null} 
                        height={null} />
                </button>
            </>
        );
    }

    private async vote(event: React.MouseEvent, type: number, element?: HTMLElement): Promise<void> {
        event.stopPropagation();
        if (this.state.segment) {
            const stopAnimation = AnimationUtils.applyLoadingAnimation(element ?? event.currentTarget as HTMLElement, 0.3);

            const response = await this.props.vote(type, this.state.segment.UUID);
            await stopAnimation();

            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                this.setState({
                    show: type === 1
                });
            } else if (response.statusCode !== 403) {
                alert(GenericUtils.getErrorMessage(response.statusCode, response.responseText));
            }
        }
    }
}

export default ChapterVoteComponent;
