import * as React from "react";
import * as ReactDOM from "react-dom";
import ChapterVoteComponent, { ChapterVoteState } from "../components/ChapterVoteComponent";
import { VoteResponse } from "../messageTypes";
import { Category, SegmentUUID, SponsorTime } from "../types";

export class ChapterVote {
    container: HTMLElement;
    ref: React.RefObject<ChapterVoteComponent>;

    unsavedState: ChapterVoteState;

    mutationObserver?: MutationObserver;
    
    constructor(vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>) {
        this.ref = React.createRef();

        this.container = document.createElement('span');
        this.container.id = "chapterVote";
        this.container.style.height = "100%";

        ReactDOM.render(
            <ChapterVoteComponent ref={this.ref} vote={vote} />,
            this.container
        );
    }

    getContainer(): HTMLElement {
        return this.container;
    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.container);
        this.container.remove();
    }

    setVisibility(show: boolean): void {
        const newState = {
            show,
        };

        if (this.ref.current) {
            this.ref.current?.setState(newState);
        } else {
            this.unsavedState = newState;
        }
    }

    async setSegment(segment: SponsorTime): Promise<void> {
        if (this.ref.current?.state?.segment !== segment) {
            const newState = {
                segment,
                show: true
            };

            if (this.ref.current) {
                this.ref.current?.setState(newState);
            } else {
                this.unsavedState = newState;
            }
        }
    }
}