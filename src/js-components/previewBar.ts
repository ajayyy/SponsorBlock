/*
Parts of this are inspired from code from VideoSegments, but rewritten and under the LGPLv3 license
https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

import Config from "../config";
import { ActionType, Category, SegmentContainer, SponsorSourceType, SponsorTime } from "../types";
import { partition } from "../utils/arrayUtils";
import { shortCategoryName } from "../utils/categoryUtils";
import { GenericUtils } from "../utils/genericUtils";

const TOOLTIP_VISIBLE_CLASS = 'sponsorCategoryTooltipVisible';
const MIN_CHAPTER_SIZE = 0.003;

export interface PreviewBarSegment {
    segment: [number, number];
    category: Category;
    actionType: ActionType;
    unsubmitted: boolean;
    showLarger: boolean;
    description: string;
    source: SponsorSourceType;
}

interface ChapterGroup extends SegmentContainer {
    originalDuration: number 
}

class PreviewBar {
    container: HTMLUListElement;
    categoryTooltip?: HTMLDivElement;
    categoryTooltipContainer?: HTMLElement;
    chapterTooltip?: HTMLDivElement;

    parent: HTMLElement;
    onMobileYouTube: boolean;
    onInvidious: boolean;

    segments: PreviewBarSegment[] = [];
    videoDuration = 0;

    // For chapter bar
    hoveredSection: HTMLElement;
    customChaptersBar: HTMLElement;
    chaptersBarSegments: PreviewBarSegment[];

    constructor(parent: HTMLElement, onMobileYouTube: boolean, onInvidious: boolean, test=false) {
        if (test) return;
        this.container = document.createElement('ul');
        this.container.id = 'previewbar';

        this.parent = parent;
        this.onMobileYouTube = onMobileYouTube;
        this.onInvidious = onInvidious;

        this.createElement(parent);
        this.createChapterMutationObserver();

        this.setupHoverText();
    }

    setupHoverText(): void {
        if (this.onMobileYouTube || this.onInvidious) return;

        // Create label placeholder
        this.categoryTooltip = document.createElement("div");
        this.categoryTooltip.className = "ytp-tooltip-title sponsorCategoryTooltip";
        this.chapterTooltip = document.createElement("div");
        this.chapterTooltip.className = "ytp-tooltip-title sponsorCategoryTooltip";

        const tooltipTextWrapper = document.querySelector(".ytp-tooltip-text-wrapper");
        if (!tooltipTextWrapper || !tooltipTextWrapper.parentElement) return;

        // Grab the tooltip from the text wrapper as the tooltip doesn't have its classes on init
        this.categoryTooltipContainer = tooltipTextWrapper.parentElement;
        const titleTooltip = tooltipTextWrapper.querySelector(".ytp-tooltip-title");
        if (!this.categoryTooltipContainer || !titleTooltip) return;

        tooltipTextWrapper.insertBefore(this.categoryTooltip, titleTooltip.nextSibling);
        tooltipTextWrapper.insertBefore(this.chapterTooltip, titleTooltip.nextSibling);

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
            if (!mouseOnSeekBar || !this.categoryTooltip || !this.categoryTooltipContainer) return;

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

                timeInSeconds = GenericUtils.getFormattedTimeToSeconds(tooltipText);

                if (timeInSeconds !== null) break;
            }

            if (timeInSeconds === null) return;

            // Find the segment at that location, using the shortest if multiple found
            const [normalSegments, chapterSegments] = 
                partition(this.segments.filter((s) => s.source !== SponsorSourceType.YouTube), 
                    (segment) => segment.actionType !== ActionType.Chapter);
            let mainSegment = this.getSmallestSegment(timeInSeconds, normalSegments);
            let secondarySegment = this.getSmallestSegment(timeInSeconds, chapterSegments);
            if (mainSegment === null && secondarySegment !== null) {
                mainSegment = secondarySegment;
                secondarySegment = this.getSmallestSegment(timeInSeconds, chapterSegments.filter((s) => s !== secondarySegment));
            }

            if (mainSegment === null && secondarySegment === null) {
                this.categoryTooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            } else {
                this.categoryTooltipContainer.classList.add(TOOLTIP_VISIBLE_CLASS);
                if (mainSegment !== null && secondarySegment !== null) {
                    this.categoryTooltipContainer.classList.add("sponsorTwoTooltips");
                } else {
                    this.categoryTooltipContainer.classList.remove("sponsorTwoTooltips");
                }

                this.setTooltipTitle(mainSegment, this.categoryTooltip);
                this.setTooltipTitle(secondarySegment, this.chapterTooltip);

                // Used to prevent overlapping
                this.categoryTooltip.classList.toggle("ytp-tooltip-text-no-title", noYoutubeChapters);
                this.chapterTooltip.classList.toggle("ytp-tooltip-text-no-title", noYoutubeChapters);
            }
        });

        observer.observe(tooltipTextWrapper, {
            childList: true,
            subtree: true,
        });
    }

    private setTooltipTitle(segment: PreviewBarSegment, tooltip: HTMLElement): void {
        if (segment) {
            const name = segment.description || shortCategoryName(segment.category);
            if (segment.unsubmitted) {
                tooltip.textContent = chrome.i18n.getMessage("unsubmitted") + " " + name;
            } else {
                tooltip.textContent = name;
            }

            tooltip.style.removeProperty("display");
        } else {
            tooltip.style.display = "none";
        }
    }

    createElement(parent: HTMLElement): void {
        this.parent = parent;

        if (this.onMobileYouTube) {
            if (parent.classList.contains("progress-bar-background")) {
                parent.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
                parent.style.opacity = "1";
            }

            this.container.style.transform = "none";
        } else if (!this.onInvidious) {
            // Hover listener
            this.parent.addEventListener("mouseenter", () => this.container.classList.add("hovered"));

            this.parent.addEventListener("mouseleave", () => this.container.classList.remove("hovered"));
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

        const sortedSegments = this.segments.sort(({ segment: a }, { segment: b }) => {
            // Sort longer segments before short segments to make shorter segments render later
            return (b[1] - b[0]) - (a[1] - a[0]);
        });
        for (const segment of sortedSegments) {
            const bar = this.createBar(segment);

            this.container.appendChild(bar);
        }

        this.createChaptersBar(segments.sort((a, b) => a.segment[0] - b.segment[0]));

        const chapterChevron = document.querySelector(".ytp-chapter-title-chevron") as HTMLElement;
        if (!Config.config.renderAsChapters || segments.some((segment) => segment.source === SponsorSourceType.YouTube)) {
            chapterChevron.style.removeProperty("display");
        } else {
            chapterChevron.style.display = "none";
        }
    }

    createBar(barSegment: PreviewBarSegment): HTMLLIElement {
        const { category, unsubmitted, segment, showLarger } = barSegment;

        const bar = document.createElement('li');
        bar.classList.add('previewbar');
        bar.innerHTML = showLarger ? '&nbsp;&nbsp;' : '&nbsp;';

        const fullCategoryName = (unsubmitted ? 'preview-' : '') + category;
        bar.setAttribute('sponsorblock-category', fullCategoryName);

        bar.style.backgroundColor = Config.config.barTypes[fullCategoryName]?.color;
        if (!this.onMobileYouTube) bar.style.opacity = Config.config.barTypes[fullCategoryName]?.opacity;

        bar.style.position = "absolute";
        const duration = Math.min(segment[1], this.videoDuration) - segment[0];
        if (duration > 0) {
            bar.style.width = `calc(${this.timeToPercentage(segment[1] - segment[0])}${
                Config.config.renderAsChapters && this.chapterFilter(barSegment) ? ' - 2px' : ''})`;
        }
        
        const time = segment[1] ? Math.min(this.videoDuration, segment[0]) : segment[0];
        bar.style.left = this.timeToPercentage(time);

        return bar;
    }

    createChaptersBar(segments: PreviewBarSegment[]): void {
        const progressBar = document.querySelector('.ytp-progress-bar') as HTMLElement;
        const chapterBar = document.querySelector(".ytp-chapters-container:not(.sponsorBlockChapterBar)") as HTMLElement;
        if (!progressBar || !chapterBar || chapterBar.childElementCount <= 0) return;

        if (!Config.config.renderAsChapters) {
            if (this.customChaptersBar) this.customChaptersBar.style.display = "none";
            chapterBar.style.removeProperty("display");
            return;
        }

        // Merge overlapping chapters
        const filteredSegments = segments?.filter((segment) => this.chapterFilter(segment));
        const chaptersToRender = this.createChapterRenderGroups(filteredSegments).filter((segment) => this.chapterGroupFilter(segment));

        if (chaptersToRender?.length <= 0) {
            if (this.customChaptersBar) this.customChaptersBar.style.display = "none";
            chapterBar.style.removeProperty("display");
            return;
        }

        // Create it from cloning
        let createFromScratch = false;
        if (!this.customChaptersBar) {
            createFromScratch = true;
            this.customChaptersBar = chapterBar.cloneNode(true) as HTMLElement;
            this.customChaptersBar.classList.add("sponsorBlockChapterBar");
        }
        this.customChaptersBar.style.removeProperty("display");
        const originalSections = this.customChaptersBar.querySelectorAll(".ytp-chapter-hover-container");
        const originalSection = originalSections[0];

        this.customChaptersBar = this.customChaptersBar;
        this.chaptersBarSegments = segments;

        // For switching to a video with less chapters
        if (originalSections.length > chaptersToRender.length) {
            for (let i = originalSections.length - 1; i >= chaptersToRender.length; i--) {
                this.customChaptersBar.removeChild(originalSections[i]);
            }
        }

        // Modify it to have sections for each segment
        for (let i = 0; i < chaptersToRender.length; i++) {
            const chapter = chaptersToRender[i].segment;
            const duration = chapter[1] - chapter[0];
            let newSection = originalSections[i] as HTMLElement;
            if (!newSection) {
                newSection = originalSection.cloneNode(true) as HTMLElement;

                this.firstTimeSetupChapterSection(newSection);
                this.customChaptersBar.appendChild(newSection);
            }

            this.setupChapterSection(newSection, duration, i !== chaptersToRender.length - 1);
        }

        // Hide old bar
        chapterBar.style.display = "none";

        if (createFromScratch) {
            if (this.container?.parentElement === progressBar) {
                progressBar.insertBefore(this.customChaptersBar, this.container.nextSibling);
            } else {
                progressBar.prepend(this.customChaptersBar);
            }
        }

        this.updateChapterAllMutation(chapterBar, progressBar, true);
    }

    createChapterRenderGroups(segments: PreviewBarSegment[]): ChapterGroup[] {
        const result: ChapterGroup[] = [];

        segments?.forEach((segment, index) => {
            const latestChapter = result[result.length - 1];
            if (latestChapter && latestChapter.segment[1] > segment.segment[0]) {
                const segmentDuration = segment.segment[1] - segment.segment[0];
                if (segment.segment[0] < latestChapter.segment[0] 
                        || segmentDuration < latestChapter.originalDuration) {
                    // Remove latest if it starts too late
                    let latestValidChapter = latestChapter;
                    const chaptersToAddBack: ChapterGroup[] = []
                    while (latestValidChapter?.segment[0] >= segment.segment[0]) {
                        const invalidChapter = result.pop();
                        if (invalidChapter.segment[1] > segment.segment[1]) {
                            if (invalidChapter.segment[0] === segment.segment[0]) {
                                invalidChapter.segment[0] = segment.segment[1];
                            }

                            chaptersToAddBack.push(invalidChapter);
                        }
                        latestValidChapter = result[result.length - 1];
                    }

                    // Split the latest chapter if smaller
                    result.push({
                        segment: [segment.segment[0], segment.segment[1]],
                        originalDuration: segmentDuration,
                    });
                    if (latestValidChapter?.segment[1] > segment.segment[1]) {
                        result.push({
                            segment: [segment.segment[1], latestValidChapter.segment[1]],
                            originalDuration: latestValidChapter.originalDuration
                        });
                    }

                    chaptersToAddBack.reverse();
                    let lastChapterChecked: number[] = segment.segment;
                    for (const chapter of chaptersToAddBack) {
                        if (chapter.segment[0] < lastChapterChecked[1]) {
                            chapter.segment[0] = lastChapterChecked[1];
                        }

                        lastChapterChecked = chapter.segment;
                    }
                    result.push(...chaptersToAddBack);
                    if (latestValidChapter) latestValidChapter.segment[1] = segment.segment[0];
                } else {
                    // Start at end of old one otherwise
                    result.push({
                        segment: [latestChapter.segment[1], segment.segment[1]],
                        originalDuration: segmentDuration
                    });
                }
            } else {
                // Add empty buffer before segment if needed
                const lastTime = latestChapter?.segment[1] || 0;
                if (segment.segment[0] > lastTime) {
                    result.push({
                        segment: [lastTime, segment.segment[0]],
                        originalDuration: 0
                    });
                }

                // Normal case
                const endTime = Math.min(segment.segment[1], this.videoDuration);
                result.push({
                    segment: [segment.segment[0], endTime],
                    originalDuration: endTime - segment.segment[0]
                });
            }

            // Add empty buffer after segment if needed
            if (index === segments.length - 1) {
                const nextSegment = segments[index + 1];
                const nextTime = nextSegment ? nextSegment.segment[0] : this.videoDuration;
                const lastTime = result[result.length - 1]?.segment[1] || segment.segment[1];
                if (this.timeToDecimal(nextTime - lastTime) > MIN_CHAPTER_SIZE) {
                    result.push({
                        segment: [lastTime, nextTime],
                        originalDuration: 0
                    });
                }
            }
        });

        return result;
    }

    private setupChapterSection(section: HTMLElement, duration: number, addMargin: boolean): void {
        if (addMargin) {
            section.style.marginRight = "2px";
            section.style.width = `calc(${this.timeToPercentage(duration)} - 2px)`;
        } else {
            section.style.marginRight = "0";
            section.style.width = this.timeToPercentage(duration);
        }
        section.setAttribute("decimal-width", String(this.timeToDecimal(duration)));
    }

    private firstTimeSetupChapterSection(section: HTMLElement): void {
        section.addEventListener("mouseenter", () => {
            this.hoveredSection?.classList.remove("ytp-exp-chapter-hover-effect");
            section.classList.add("ytp-exp-chapter-hover-effect");
            this.hoveredSection = section;
        });
    }

    private createChapterMutationObserver(): void {
        const progressBar = document.querySelector('.ytp-progress-bar') as HTMLElement;
        const chapterBar = document.querySelector(".ytp-chapters-container:not(.sponsorBlockChapterBar)") as HTMLElement;
        if (!progressBar || !chapterBar) return;

        const observer = new MutationObserver((mutations) => {
            const changes: Record<string, HTMLElement> = {};
            for (const mutation of mutations) {
                const currentElement = mutation.target as HTMLElement;
                if (mutation.type === "attributes"
                    && currentElement.parentElement?.classList.contains("ytp-progress-list")) {
                    changes[currentElement.classList[0]] = mutation.target as HTMLElement;
                }
            }

            this.updateChapterMutation(changes, progressBar);
        });

        observer.observe(chapterBar, {
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class"],
        });
    }

    private updateChapterAllMutation(originalChapterBar: HTMLElement, progressBar: HTMLElement, firstUpdate = false): void {
        const elements = originalChapterBar.querySelectorAll(".ytp-progress-list > *");
        const changes: Record<string, HTMLElement> = {};
        for (const element of elements) {
            changes[element.classList[0]] = element as HTMLElement;
        }

        this.updateChapterMutation(changes, progressBar, firstUpdate);
    }

    private updateChapterMutation(changes: Record<string, HTMLElement>, progressBar: HTMLElement, firstUpdate = false): void {
        // Go through each newly generated chapter bar and update the width based on changes array
        if (this.customChaptersBar) {
            // Width reached so far in decimal percent
            let cursor = 0;

            const sections = this.customChaptersBar.querySelectorAll(".ytp-chapter-hover-container") as NodeListOf<HTMLElement>;
            for (const section of sections) {
                const sectionWidthDecimal = parseFloat(section.getAttribute("decimal-width"));

                for (const className in changes) {
                    const selector = `.${className}`
                    const customChangedElement = section.querySelector(selector) as HTMLElement;
                    if (customChangedElement) {
                        const changedElement = changes[className];
                        const changedData = this.findLeftAndScale(selector, changedElement, progressBar);

                        const left = (changedData.left) / progressBar.clientWidth;
                        const calculatedLeft = Math.max(0, Math.min(1, (left - cursor) / sectionWidthDecimal));
                        if (!isNaN(left) && !isNaN(calculatedLeft)) {
                            customChangedElement.style.left = `${calculatedLeft * 100}%`;
                            customChangedElement.style.removeProperty("display");
                        }

                        if (changedData.scale !== null) {
                            const transformScale = (changedData.scale) / progressBar.clientWidth;
                            
                            customChangedElement.style.transform = 
                                `scaleX(${Math.max(0, Math.min(1 - calculatedLeft, (transformScale - cursor) / sectionWidthDecimal - calculatedLeft))}`;
                            if (firstUpdate) {
                                customChangedElement.style.transition = "none";
                                setTimeout(() => customChangedElement.style.removeProperty("transition"), 50);
                            }
                        }

                        if (customChangedElement.className !== changedElement.className) {
                            customChangedElement.className = changedElement.className;
                        }
                    }
                }

                cursor += sectionWidthDecimal;
            }
        }
    }

    private findLeftAndScale(selector: string, currentElement: HTMLElement, progressBar: HTMLElement): 
            { left: number, scale: number } {
        const sections = currentElement.parentElement.parentElement.parentElement.children;
        let currentWidth = 0;

        let left = 0;
        let leftPosition = 0;

        let scale = null;
        let scalePosition = 0;
        let scaleWidth = 0;

        for (const sectionElement of sections) {
            const section = sectionElement as HTMLElement;
            const checkElement = section.querySelector(selector) as HTMLElement;
            const currentSectionWidthNoMargin = this.getPartialChapterSectionStyle(section, "width") || progressBar.clientWidth;
            const currentSectionWidth = currentSectionWidthNoMargin 
                + this.getPartialChapterSectionStyle(section, "marginRight");

            // First check for left
            const checkLeft = parseFloat(checkElement.style.left.replace("px", ""));
            if (checkLeft !== 0) {
                left = checkLeft;
                leftPosition = currentWidth;
            }

            // Then check for scale
            const transformMatch = checkElement.style.transform.match(/scaleX\(([0-9.]+?)\)/);
            if (transformMatch) {
                const transformScale = parseFloat(transformMatch[1]);
                if (transformScale < 1 && transformScale + checkLeft / currentSectionWidthNoMargin < 0.99999) {
                    scale = transformScale;
                    scaleWidth = currentSectionWidth;

                    if (transformScale > 0) {
                        // reached the end of this section for sure, since the scale is now between 0 and 1
                        // if the scale is always zero, then it will go through all sections but still return 0

                        scalePosition = currentWidth;
                        if (checkLeft !== 0) {
                            scalePosition += left;
                        }
                        break;
                    }
                }
            }

            currentWidth += currentSectionWidth;
        }

        return { 
            left: left + leftPosition, 
            scale: scale !== null ? scale * scaleWidth + scalePosition : null
        };
    }

    private getPartialChapterSectionStyle(element: HTMLElement, param: string): number {
        const data = element.style[param];
        if (data?.includes("100%")) {
            return 0;
        } else {
            return parseInt(element.style[param].match(/\d+/g)?.[0]) || 0;
        }
    }

    updateChapterText(segments: SponsorTime[], submittingSegments: SponsorTime[], currentTime: number): void {
        if (!segments && submittingSegments?.length <= 0) return;

        segments ??= [];
        if (submittingSegments?.length > 0) segments = segments.concat(submittingSegments);
        const activeSegments = segments.filter((segment) => {
            return segment.segment[0] <= currentTime && segment.segment[1] > currentTime;
        });

        this.setActiveSegments(activeSegments);
    }

    /**
     * Adds the text to the chapters slot if not filled by default
     */
    private setActiveSegments(segments: SponsorTime[]): void {
        const chaptersContainer = document.querySelector(".ytp-chapter-container") as HTMLDivElement;

        if (chaptersContainer) {
            // TODO: Check if existing chapters exist (if big chapters menu is available?)

            if (segments.length > 0) {
                chaptersContainer.style.removeProperty("display");

                const chosenSegment = segments.sort((a, b) => {
                    if (a.actionType === ActionType.Chapter && b.actionType !== ActionType.Chapter) {
                        return -1;
                    } else if (a.actionType !== ActionType.Chapter && b.actionType === ActionType.Chapter) {
                        return 1;
                    } else {
                        return (b.segment[0] - a.segment[0]);
                    }
                })[0];
                console.log(segments.sort((a, b) => {
                    if (a.actionType === ActionType.Chapter && b.actionType !== ActionType.Chapter) {
                        return -1;
                    } else if (a.actionType !== ActionType.Chapter && b.actionType === ActionType.Chapter) {
                        return 1;
                    } else {
                        return (b.segment[0] - a.segment[0]);
                    }
                }))

                const chapterButton = chaptersContainer.querySelector("button.ytp-chapter-title") as HTMLButtonElement;
                chapterButton.classList.remove("ytp-chapter-container-disabled");
                chapterButton.disabled = false;

                const chapterTitle = chaptersContainer.querySelector(".ytp-chapter-title-content") as HTMLDivElement;
                chapterTitle.innerText = chosenSegment.description || shortCategoryName(chosenSegment.category);
            } else {
                // Hide chapters menu again
                chaptersContainer.style.display = "none";
            }
        }
    }

    remove(): void {
        this.container.remove();

        if (this.categoryTooltip) {
            this.categoryTooltip.remove();
            this.categoryTooltip = undefined;
        }

        if (this.categoryTooltipContainer) {
            this.categoryTooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            this.categoryTooltipContainer = undefined;
        }
    }

    private chapterFilter(segment: PreviewBarSegment): boolean {
        return segment.actionType !== ActionType.Poi
                && this.chapterGroupFilter(segment);
    }

    private chapterGroupFilter(segment: SegmentContainer): boolean {
        return segment.segment.length === 2 && this.timeToDecimal(segment.segment[1] - segment.segment[0]) > MIN_CHAPTER_SIZE;
    }

    timeToPercentage(time: number): string {
        return Math.min(100, time / this.videoDuration * 100) + '%';
    }

    timeToDecimal(time: number): number {
        return Math.min(1, time / this.videoDuration);
    }

    /*
    * Approximate size on preview bar for smallest element (due to &nbsp)
    */
    getMinimumSize(showLarger = false): number {
        return this.videoDuration * (showLarger ? 0.006 : 0.003);
    }

    private getSmallestSegment(timeInSeconds: number, segments: PreviewBarSegment[]): PreviewBarSegment | null {
        let segment: PreviewBarSegment | null = null;
        let currentSegmentLength = Infinity;

        for (const seg of segments) { //
            const segmentLength = seg.segment[1] - seg.segment[0];
            const minSize = this.getMinimumSize(seg.showLarger);

            const startTime = segmentLength !== 0 ? seg.segment[0] : Math.floor(seg.segment[0]);
            const endTime = segmentLength > minSize ? seg.segment[1] : Math.ceil(seg.segment[0] + minSize);
            if (startTime <= timeInSeconds && endTime >= timeInSeconds) {
                if (segmentLength < currentSegmentLength) {
                    currentSegmentLength = segmentLength;
                    segment = seg;
                }
            }
        }

        return segment;
    }
}

export default PreviewBar;
