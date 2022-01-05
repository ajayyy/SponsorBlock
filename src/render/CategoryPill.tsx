import * as React from "react";
import * as ReactDOM from "react-dom";
import CategoryPillComponent, { CategoryPillState } from "../components/CategoryPillComponent";
import { SponsorTime } from "../types";
import { GenericUtils } from "../utils/genericUtils";

export class CategoryPill {
    container: HTMLElement;
    ref: React.RefObject<CategoryPillComponent>;

    unsavedState: CategoryPillState;

    mutationObserver?: MutationObserver;
    
    constructor() {
        this.ref = React.createRef();
    }

    async attachToPage(onMobileYouTube: boolean, onInvidious: boolean): Promise<void> {
        const referenceNode = 
            await GenericUtils.wait(() => 
                // YouTube, Mobile YouTube, Invidious
                document.querySelector(".ytd-video-primary-info-renderer.title, .slim-video-information-title, #player-container + .h-box > h1") as HTMLElement);

        if (referenceNode && !referenceNode.contains(this.container)) {
            this.container = document.createElement('span');
            this.container.id = "categoryPill";
            this.container.style.display = "relative";

            referenceNode.prepend(this.container);
            referenceNode.style.display = "flex";

            if (this.ref.current) {
                this.unsavedState = this.ref.current.state;
            }

            ReactDOM.render(
                <CategoryPillComponent ref={this.ref} />,
                this.container
            );

            if (this.unsavedState) {
                this.ref.current?.setState(this.unsavedState);
                this.unsavedState = null;
            }

            if (onMobileYouTube) {
                if (this.mutationObserver) {
                    this.mutationObserver.disconnect();
                }
                
                this.mutationObserver = new MutationObserver(() => this.attachToPage(onMobileYouTube, onInvidious));

                this.mutationObserver.observe(referenceNode, { 
                    childList: true,
                    subtree: true
                });
            }
        }
    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.container);
        this.container.remove();
    }

    setVisibility(show: boolean): void {
        const newState = {
            show,
            open: show ? this.ref.current?.state.open : false
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