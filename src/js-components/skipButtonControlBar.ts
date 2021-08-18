import Config from "../config";
import { SponsorTime } from "../types";
import { getSkippingText } from "../utils/categoryUtils";


export interface SkipButtonControlBarProps {
    skip: (segment: SponsorTime) => void;
}

export class SkipButtonControlBar {

    container: HTMLElement;
    skipIcon: HTMLImageElement;
    textContainer: HTMLElement;
    chapterText: HTMLElement;
    segment: SponsorTime;

    timeout: NodeJS.Timeout;

    skip: (segment: SponsorTime) => void;

    constructor(props: SkipButtonControlBarProps) {
        this.skip = props.skip;

        this.container = document.createElement("div");
        this.container.classList.add("skipButtonControlBarContainer");
        this.container.classList.add("hidden");

        this.skipIcon = document.createElement("img");
        this.skipIcon.src = chrome.runtime.getURL("icons/skipIcon.svg");
        this.skipIcon.classList.add("ytp-button");
        this.skipIcon.id = "sbSkipIconControlBarImage";

        this.textContainer = document.createElement("div");
        
        this.container.appendChild(this.skipIcon);
        this.container.appendChild(this.textContainer);
        this.container.addEventListener("click", () => this.onClick());
    }

    attachToPage(): void {
        const leftControlsContainer = document.querySelector(".ytp-left-controls");
        this.chapterText = document.querySelector(".ytp-chapter-container");
    
        if (!leftControlsContainer.contains(this.container)) {
            leftControlsContainer.insertBefore(this.container, this.chapterText);
        }
    }

    enable(segment: SponsorTime): void {
        this.segment = segment;
        this.chapterText?.classList?.add("hidden");
        this.container.classList.remove("hidden");
        this.textContainer.innerText = getSkippingText([segment], false);

        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.disable(), Config.config.skipNoticeDuration * 1000);
    }

    disable(): void {
        this.container.classList.add("hidden");
        this.chapterText?.classList?.remove("hidden");
    }

    onClick(): void {
        this.skip(this.segment);
        this.disable();
    }
}

