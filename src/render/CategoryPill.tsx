import * as React from "react";
import * as ReactDOM from "react-dom";
import CategoryPillComponent, { CategoryPillState } from "../components/CategoryPillComponent";
import { SponsorTime } from "../types";
import { GenericUtils } from "../utils/genericUtils";

export class CategoryPill {
    container: HTMLElement;
    ref: React.RefObject<CategoryPillComponent>;

    unsavedState: CategoryPillState;
    
    constructor() {
        this.ref = React.createRef();
    }

    async attachToPage(): Promise<void> {
        // TODO: Mobile and invidious
        const referenceNode = await GenericUtils.wait(() => document.querySelector(".ytd-video-primary-info-renderer.title") as HTMLElement);
        
        if (referenceNode && !referenceNode.contains(this.container)) {
            this.container = document.createElement('span');
            this.container.id = "categoryPill";
            this.container.style.display = "relative";

            referenceNode.prepend(this.container);
            referenceNode.style.display = "flex";

            ReactDOM.render(
                <CategoryPillComponent ref={this.ref} />,
                this.container
            );

            if (this.unsavedState) {
                this.ref.current?.setState(this.unsavedState);
                this.unsavedState = null;
            }
        }
    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.container);
        this.container.remove();
    }

    setVisibility(show: boolean): void {
        const newState = {
            show
        };

        if (this.ref.current) {
            this.ref.current?.setState(newState);
        } else {
            this.unsavedState = newState;
        }
    }

    setSegment(segment: SponsorTime): void {
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