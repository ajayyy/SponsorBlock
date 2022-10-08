import * as React from "react";
import { createRoot, Root } from 'react-dom/client';
import ChapterVoteComponent, { ChapterVoteState } from "../components/ChapterVoteComponent";
import { VoteResponse } from "../messageTypes";
import { Category, SegmentUUID, SponsorTime } from "../types";

export class ChapterVote {
    container: HTMLElement;
    ref: React.RefObject<ChapterVoteComponent>;
    root: Root;

    unsavedState: ChapterVoteState;

    mutationObserver?: MutationObserver;
    
    constructor(vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>) {
        this.ref = React.createRef();

        this.container = document.createElement('span');
        this.container.id = "chapterVote";
        this.container.style.height = "100%";

        this.root = createRoot(this.container);
        this.root.render(<ChapterVoteComponent ref={this.ref} vote={vote} />);
    }

    getContainer(): HTMLElement {
        return this.container;
    }

    close(): void {
        this.root.unmount();
        this.container.remove();
    }

    setVisibility(show: boolean): void {
        const newState = {
            show,
            ...(!show ? { segment: null } : {})
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