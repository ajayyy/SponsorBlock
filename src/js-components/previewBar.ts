/*
	This is based on code from VideoSegments.
	https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

import Config from "../config";
import Utils from "../utils";
const utils = new Utils();

class PreviewBar {
    container: HTMLUListElement;
    parent: HTMLElement;
    onMobileYouTube: boolean;
    onInvidious: boolean;

    timestamps: number[][];
    types: string[];

    constructor(parent: HTMLElement, onMobileYouTube: boolean, onInvidious: boolean) {
        this.container = document.createElement('ul');
        this.container.id = 'previewbar';
        this.parent = parent;

        this.onMobileYouTube = onMobileYouTube;
        this.onInvidious = onInvidious;

        this.updatePosition(parent);

        this.setupHoverText();
    }

    setupHoverText(): void {
        if (this.onMobileYouTube || this.onInvidious) return;

        const seekBar = document.querySelector(".ytp-progress-bar-container");

        // Create label placeholder
        const tooltipTextWrapper = document.querySelector(".ytp-tooltip-text-wrapper");
        const titleTooltip = document.querySelector(".ytp-tooltip-title");
        const categoryTooltip = document.createElement("div");
        categoryTooltip.className = "sbHidden ytp-tooltip-title";
        categoryTooltip.id = "sponsor-block-category-tooltip"

        tooltipTextWrapper.insertBefore(categoryTooltip, titleTooltip.nextSibling);

        let mouseOnSeekBar = false;

        seekBar.addEventListener("mouseenter", () => {
            mouseOnSeekBar = true;
        });

        seekBar.addEventListener("mouseleave", () => {
            mouseOnSeekBar = false;
            categoryTooltip.classList.add("sbHidden");
        });

        const observer = new MutationObserver((mutations) => {
            if (!mouseOnSeekBar) return;

            // See if mutation observed is only this ID (if so, ignore)
            if (mutations.length == 1 && (mutations[0].target as HTMLElement).id === "sponsor-block-category-tooltip") {
                return;
            }

            const tooltips = document.querySelectorAll(".ytp-tooltip-text");
            for (const tooltip of tooltips) {
                const splitData = tooltip.textContent.split(":");
                if (splitData.length === 2 && !isNaN(parseInt(splitData[0])) && !isNaN(parseInt(splitData[1]))) {
                    // Add label
                    const timeInSeconds = parseInt(splitData[0]) * 60 + parseInt(splitData[1]);

                    // Find category at that location
                    let category = null;
                    for (let i = 0; i < this.timestamps?.length; i++) {
                        if (this.timestamps[i][0] < timeInSeconds && this.timestamps[i][1] > timeInSeconds){
                            category = this.types[i];
                        } 
                    }

                    if (category === null && !categoryTooltip.classList.contains("sbHidden")) {
                        categoryTooltip.classList.add("sbHidden");
                        tooltipTextWrapper.classList.remove("sbTooltipTwoTitleThumbnailOffset");
                        tooltipTextWrapper.classList.remove("sbTooltipOneTitleThumbnailOffset");
                    } else if (category !== null) {
                        categoryTooltip.classList.remove("sbHidden");
                        categoryTooltip.textContent = utils.shortCategoryName(category)
                            || (chrome.i18n.getMessage("preview") + " " + utils.shortCategoryName(category.split("preview-")[1]));

                        // There is a title now
                        tooltip.classList.remove("ytp-tooltip-text-no-title");

                        // Add the correct offset for the number of titles there are
                        if (titleTooltip.textContent !== "") {
                            if (!tooltipTextWrapper.classList.contains("sbTooltipTwoTitleThumbnailOffset")) {
                                tooltipTextWrapper.classList.add("sbTooltipTwoTitleThumbnailOffset");
                            }
                        } else if (!tooltipTextWrapper.classList.contains("sbTooltipOneTitleThumbnailOffset")) {
                            tooltipTextWrapper.classList.add("sbTooltipOneTitleThumbnailOffset");
                        }
                    }

                    break;
                }
            }
        });

        observer.observe(tooltipTextWrapper, {
            childList: true,
            subtree: true
        });
    }

    updatePosition(parent: HTMLElement): void {
        //below the seek bar
        // this.parent.insertAdjacentElement("afterEnd", this.container);

        this.parent = parent;

        if (this.onMobileYouTube) {
            parent.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
            parent.style.opacity = "1";

            this.container.style.transform = "none";
        }

        //on the seek bar
        this.parent.insertAdjacentElement("afterbegin", this.container);
    }

    updateColor(segment: string, color: string, opacity: string): void {
        const bars = <NodeListOf<HTMLElement>> document.querySelectorAll('[data-vs-segment-type=' + segment + ']');
        for (const bar of bars) {
            bar.style.backgroundColor = color;
            bar.style.opacity = opacity;
        }
    }

    set(timestamps: number[][], types: string[], duration: number): void {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        if (!timestamps || !types) {
            return;
        }

        this.timestamps = timestamps;
        this.types = types;

        // to avoid rounding error resulting in width more than 100% 
        duration = Math.floor(duration * 100) / 100;
        let width;
        for (let i = 0; i < timestamps.length; i++) {
            if (types[i] == null) continue;

            width = (timestamps[i][1] - timestamps[i][0]) / duration * 100;
            width = Math.floor(width * 100) / 100;

            const bar = this.createBar();
            bar.setAttribute('data-vs-segment-type', types[i]);

            bar.style.backgroundColor = Config.config.barTypes[types[i]].color;
            if (!this.onMobileYouTube) bar.style.opacity = Config.config.barTypes[types[i]].opacity;
            bar.style.width = width + '%';
            bar.style.left = (timestamps[i][0] / duration * 100) + "%";
            bar.style.position = "absolute"

            this.container.insertAdjacentElement("beforeend", bar);
        }
    }

    createBar(): HTMLLIElement {
        const bar = document.createElement('li');
        bar.classList.add('previewbar');
        bar.innerHTML = '&nbsp;';
        return bar;
    }

    remove(): void {
        this.container.remove();
        this.container = undefined;
    }
}

export default PreviewBar;
