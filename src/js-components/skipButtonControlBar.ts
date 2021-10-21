import Config from "../config";
import { SponsorTime } from "../types";
import { getSkippingText } from "../utils/categoryUtils";

import Utils from "../utils";
const utils = new Utils();

export interface SkipButtonControlBarProps {
    skip: (segment: SponsorTime) => void;
    onMobileYouTube: boolean;
}

export class SkipButtonControlBar {

    container: HTMLElement;
    skipIcon: HTMLImageElement;
    textContainer: HTMLElement;
    chapterText: HTMLElement;
    segment: SponsorTime;

    showKeybindHint = true;
    onMobileYouTube: boolean;

    enabled = false;

    timeout: NodeJS.Timeout;
    duration = 0;

    skip: (segment: SponsorTime) => void;

    constructor(props: SkipButtonControlBarProps) {
        this.skip = props.skip;
        this.onMobileYouTube = props.onMobileYouTube;

        this.container = document.createElement("div");
        this.container.classList.add("skipButtonControlBarContainer");
        this.container.classList.add("hidden");
        if (this.onMobileYouTube) this.container.classList.add("mobile");

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
        const mountingContainer = this.getMountingContainer();
        this.chapterText = document.querySelector(".ytp-chapter-container");
    
        if (mountingContainer && !mountingContainer.contains(this.container)) {
            if (this.onMobileYouTube) {
                mountingContainer.appendChild(this.container);
            } else {
                mountingContainer.insertBefore(this.container, this.chapterText);
            }

            if (Config.config.autoHideInfoButton && !this.onMobileYouTube) {
                utils.setupAutoHideAnimation(this.skipIcon, mountingContainer, false, false);
            }
        }
    }

    private getMountingContainer(): HTMLElement {
        if (!this.onMobileYouTube) {
            return document.querySelector(".ytp-left-controls");
        } else {
            return document.getElementById("player-container-id");
        }
    }

    enable(segment: SponsorTime, duration?: number): void {
        if (duration) this.duration = duration;
        this.segment = segment;
        this.enabled = true;

        this.refreshText();
        this.textContainer?.classList?.remove("hidden");
        utils.disableAutoHideAnimation(this.skipIcon);

        this.startTimer();
    }

    refreshText(): void {
        if (this.segment) {
            this.chapterText?.classList?.add("hidden");
            this.container.classList.remove("hidden");
            this.textContainer.innerText = this.getTitle();
            this.skipIcon.setAttribute("title", this.getTitle());
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
        this.timeout = setTimeout(() => this.disableText(), Math.max(Config.config.skipNoticeDuration, this.duration) * 1000);
    }

    disable(keepActive = false): void {
        this.container.classList.add("hidden");
        this.textContainer?.classList?.remove("hidden");

        this.chapterText?.classList?.remove("hidden");
        this.getChapterPrefix()?.classList?.remove("hidden");

        if (!keepActive) this.enabled = false;
    }

    toggleSkip(): void {
        this.skip(this.segment);
        this.disableText();
    }

    disableText(forceNotDisable = false): void {
        if (!forceNotDisable && (Config.config.hideVideoPlayerControls || Config.config.hideSkipButtonPlayerControls || this.onMobileYouTube)) {
            this.disable(this.onMobileYouTube);
            return;
        }

        this.container.classList.remove("hidden");
        this.textContainer?.classList?.add("hidden");
        this.chapterText?.classList?.remove("hidden");

        this.getChapterPrefix()?.classList?.add("hidden");

        utils.enableAutoHideAnimation(this.skipIcon);
    }

    updateMobileControls(): void {
        const overlay = document.getElementById("player-control-overlay");

        if (overlay && this.enabled) {
            if (overlay?.classList?.contains("pointer-events-off")) {
                this.disable(true);
            } else {
                this.disableText(true);
                this.skipIcon.classList.remove("hidden");
            }
        }
    }

    private getTitle(): string {
        return getSkippingText([this.segment], false) + (this.showKeybindHint ? " (" + Config.config.skipKeybind + ")" : "");
    }

    private getChapterPrefix(): HTMLElement {
        return document.querySelector(".ytp-chapter-title-prefix");
    }
}

