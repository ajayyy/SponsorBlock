import * as React from "react";
import * as ReactDOM from "react-dom";
import CategoryPillComponent, { CategoryPillState } from "../components/CategoryPillComponent";
import Config from "../config";
import { VoteResponse } from "../messageTypes";
import { Category, SegmentUUID, SponsorTime } from "../types";
import { GenericUtils } from "../utils/genericUtils";
import { Tooltip } from "./Tooltip";

export class CategoryPill {
    container: HTMLElement;
    ref: React.RefObject<CategoryPillComponent>;

    unsavedState: CategoryPillState;

    mutationObserver?: MutationObserver;
    
    constructor() {
        this.ref = React.createRef();
    }

    async attachToPage(onMobileYouTube: boolean, onInvidious: boolean,
            vote: (type: number, UUID: SegmentUUID, category?: Category) => Promise<VoteResponse>): Promise<void> {
        const referenceNode = 
            await GenericUtils.wait(() => 
                // New YouTube Title, YouTube, Mobile YouTube, Invidious
                document.querySelector("#title h1, .ytd-video-primary-info-renderer.title, .slim-video-information-title, #player-container + .h-box > h1") as HTMLElement);

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
                <CategoryPillComponent ref={this.ref} vote={vote} />,
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
                
                this.mutationObserver = new MutationObserver(() => this.attachToPage(onMobileYouTube, onInvidious, vote));

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

    async setSegment(segment: SponsorTime): Promise<void> {
        if (this.ref.current?.state?.segment !== segment) {
            const newState = {
                segment,
                show: true,
                open: false
            };

            if (this.ref.current) {
                this.ref.current?.setState(newState);
            } else {
                this.unsavedState = newState;
            }

            if (!Config.config.categoryPillUpdate) {
                Config.config.categoryPillUpdate = true;

                const watchDiv = await GenericUtils.wait(() => document.querySelector("#info.ytd-watch-flexy") as HTMLElement);
                if (watchDiv) {
                    new Tooltip({
                        text: chrome.i18n.getMessage("categoryPillNewFeature"),
                        link: "https://blog.ajay.app/full-video-sponsorblock",
                        referenceNode: watchDiv,
                        prependElement: watchDiv.firstChild as HTMLElement,
                        bottomOffset: "-10px",
                        opacity: 0.95,
                        timeout: 50000
                    });
                }
            }
        }
    }
}