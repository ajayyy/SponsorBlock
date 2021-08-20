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

    showKeybindHint = true;

    timeout: NodeJS.Timeout;
    duration = 0;

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
        this.container.addEventListener("click", () => this.toggleSkip());
        this.container.addEventListener("mouseenter", () => this.stopTimer());
        this.container.addEventListener("mouseleave", () => this.startTimer());
    }

    getElement(): HTMLElement {
        return this.container;
    }

    attachToPage(): void {
        const leftControlsContainer = document.querySelector(".ytp-left-controls");
        this.chapterText = document.querySelector(".ytp-chapter-container");
    
        if (!leftControlsContainer.contains(this.container)) {
            leftControlsContainer.insertBefore(this.container, this.chapterText);
        }
    }

    enable(segment: SponsorTime, duration?: number): void {
        if (duration) this.duration = duration;
        this.segment = segment;
        this.refreshText();

        this.startTimer();
    }

    refreshText(): void {
        if (this.segment) {
            this.chapterText?.classList?.add("hidden");
            this.container.classList.remove("hidden");
            this.textContainer.innerText = getSkippingText([this.segment], false) + (this.showKeybindHint ? " (" + Config.config.skipKeybind + ")" : "");
        }
    }

    setShowKeybindHint(show: boolean): void {
        this.showKeybindHint = show;

        this.refreshText();
    }

    stopTimer(): void {
        if (this.timeout) clearTimeout(this.timeout);
    }

    startTimer(): void {
        this.stopTimer();
        this.timeout = setTimeout(() => this.disable(), Math.max(Config.config.skipNoticeDuration, this.duration) * 1000);
    }

    disable(): void {
        this.container.classList.add("hidden");
        this.chapterText?.classList?.remove("hidden");
    }

    toggleSkip(): void {
        this.skip(this.segment);
        this.disable();
    }
}

