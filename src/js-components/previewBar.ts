/*
Parts of this are inspired from code from VideoSegments, but rewritten and under the LGPLv3 license
https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

import Config from "../config";
import Utils from "../utils";
const utils = new Utils();

const TOOLTIP_VISIBLE_CLASS = 'sponsorCategoryTooltipVisible';

export interface PreviewBarSegment {
    segment: [number, number];
    category: string;
    preview: boolean;
}

class PreviewBar {
    container: HTMLUListElement;
    categoryTooltip?: HTMLDivElement;
    tooltipContainer?: HTMLElement;

    parent: HTMLElement;
    onMobileYouTube: boolean;
    onInvidious: boolean;

    segments: PreviewBarSegment[] = [];
    videoDuration = 0;

    constructor(parent: HTMLElement, onMobileYouTube: boolean, onInvidious: boolean) {
        this.container = document.createElement('ul');
        this.container.id = 'previewbar';

        this.parent = parent;
        this.onMobileYouTube = onMobileYouTube;
        this.onInvidious = onInvidious;

        this.createElement(parent);

        this.setupHoverText();
    }

    setupHoverText(): void {
        if (this.onMobileYouTube || this.onInvidious) return;

        // Create label placeholder
        this.categoryTooltip = document.createElement("div");
        this.categoryTooltip.className = "ytp-tooltip-title sponsorCategoryTooltip";

        const tooltipTextWrapper = document.querySelector(".ytp-tooltip-text-wrapper");
        if (!tooltipTextWrapper || !tooltipTextWrapper.parentElement) return;

        // Grab the tooltip from the text wrapper as the tooltip doesn't have its classes on init
        this.tooltipContainer = tooltipTextWrapper.parentElement;
        const titleTooltip = tooltipTextWrapper.querySelector(".ytp-tooltip-title");
        if (!this.tooltipContainer || !titleTooltip) return;

        tooltipTextWrapper.insertBefore(this.categoryTooltip, titleTooltip.nextSibling);

        const seekBar = document.querySelector(".ytp-progress-bar-container");
        if (!seekBar) return;

        let mouseOnSeekBar = false;

        seekBar.addEventListener("mouseenter", () => {
            mouseOnSeekBar = true;
        });

        seekBar.addEventListener("mouseleave", () => {
            mouseOnSeekBar = false;
        });

        const observer = new MutationObserver((mutations) => {
            if (!mouseOnSeekBar || !this.categoryTooltip || !this.tooltipContainer) return;

            // If the mutation observed is only for our tooltip text, ignore
            if (mutations.length === 1 && (mutations[0].target as HTMLElement).classList.contains("sponsorCategoryTooltip")) {
                return;
            }

            const tooltipTextElements = tooltipTextWrapper.querySelectorAll(".ytp-tooltip-text");
            let timeInSeconds: number | null = null;
            let noYoutubeChapters = false;

            for (const tooltipTextElement of tooltipTextElements) {
                if (tooltipTextElement.classList.contains('ytp-tooltip-text-no-title')) noYoutubeChapters = true;

                const tooltipText = tooltipTextElement.textContent;
                if (tooltipText === null || tooltipText.length === 0) continue;

                timeInSeconds = utils.getFormattedTimeToSeconds(tooltipText);

                if (timeInSeconds !== null) break;
            }

            if (timeInSeconds === null) return;

            // Find the segment at that location, using the shortest if multiple found
            let segment: PreviewBarSegment | null = null;
            let currentSegmentLength = Infinity;

            for (const seg of this.segments) {
                if (seg.segment[0] <= timeInSeconds && seg.segment[1] > timeInSeconds) {
                    const segmentLength = seg.segment[1] - seg.segment[0];

                    if (segmentLength < currentSegmentLength) {
                        currentSegmentLength = segmentLength;
                        segment = seg;
                    }
                }
            }

            if (segment === null && this.tooltipContainer.classList.contains(TOOLTIP_VISIBLE_CLASS)) {
                this.tooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            } else if (segment !== null) {
                this.tooltipContainer.classList.add(TOOLTIP_VISIBLE_CLASS);

                if (segment.preview) {
                    this.categoryTooltip.textContent = chrome.i18n.getMessage("preview") + " " + utils.shortCategoryName(segment.category);
                } else {
                    this.categoryTooltip.textContent = utils.shortCategoryName(segment.category);
                }

                // Use the class if the timestamp text uses it to prevent overlapping
                this.categoryTooltip.classList.toggle("ytp-tooltip-text-no-title", noYoutubeChapters);
            }
        });

        observer.observe(tooltipTextWrapper, {
            childList: true,
            subtree: true,
        });
    }

    createElement(parent: HTMLElement): void {
        this.parent = parent;

        if (this.onMobileYouTube) {
            parent.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
            parent.style.opacity = "1";
            
            this.container.style.transform = "none";
        }

        // On the seek bar
        this.parent.prepend(this.container);
    }

    clear(): void {
        this.videoDuration = 0;
        this.segments = [];

        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }

    set(segments: PreviewBarSegment[], videoDuration: number): void {
        this.clear();
        if (!segments) return;

        this.segments = segments;
        this.videoDuration = videoDuration;

        this.segments.sort(({segment: a}, {segment: b}) => {
            // Sort longer segments before short segments to make shorter segments render later
            return (b[1] - b[0]) - (a[1] - a[0]);
        }).forEach((segment) => {
            const bar = this.createBar(segment);

            this.container.appendChild(bar);
        });
    }

    createBar({category, preview, segment}: PreviewBarSegment): HTMLLIElement {
        const bar = document.createElement('li');
        bar.classList.add('previewbar');
        bar.innerHTML = '&nbsp;';

        const fullCategoryName = (preview ? 'preview-' : '') + category;

        bar.setAttribute('sponsorblock-category', fullCategoryName);

        bar.style.backgroundColor = Config.config.barTypes[fullCategoryName]?.color;
        if (!this.onMobileYouTube) bar.style.opacity = Config.config.barTypes[fullCategoryName]?.opacity;

        bar.style.position = "absolute";
        bar.style.width = this.timeToPercentage(segment[1] - segment[0]);
        bar.style.left = this.timeToPercentage(segment[0]);

        return bar;
    }

    remove(): void {
        this.container.remove();

        if (this.categoryTooltip) {
            this.categoryTooltip.remove();
            this.categoryTooltip = undefined;
        }

        if (this.tooltipContainer) {
            this.tooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            this.tooltipContainer = undefined;
        }
    }

    timeToPercentage(time: number): string {
        return Math.min(100, time / this.videoDuration * 100) + '%';
    }
}

export default PreviewBar;
