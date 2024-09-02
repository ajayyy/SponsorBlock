import { isOnInvidious, parseYouTubeVideoIDFromURL } from "../../maze-utils/src/video";
import Config from "../config";
import { getVideoLabel } from "./videoLabels";
import { getThumbnailSelector, setThumbnailListener } from "../../maze-utils/src/thumbnailManagement";
import { VideoID } from "../types";
import { getSegmentsForVideo } from "./segmentData";

export async function handleThumbnails(thumbnails: HTMLImageElement[]): Promise<void> {
    await Promise.all(thumbnails.map((t) => {
        labelThumbnail(t);
        setupThumbnailHover(t);
    }));
}

export async function labelThumbnail(thumbnail: HTMLImageElement): Promise<HTMLElement | null> {
    if (!Config.config?.fullVideoSegments || !Config.config?.fullVideoLabelsOnThumbnails) {
        hideThumbnailLabel(thumbnail);
        return null;
    }
    
    const videoID = extractVideoID(thumbnail);
    if (!videoID) {
        hideThumbnailLabel(thumbnail);
        return null;
    }

    const category = await getVideoLabel(videoID);
    if (!category) {
        hideThumbnailLabel(thumbnail);
        return null;
    }

    const { overlay, text } = createOrGetThumbnail(thumbnail);

    overlay.style.setProperty('--category-color', `var(--sb-category-preview-${category}, var(--sb-category-${category}))`);
    overlay.style.setProperty('--category-text-color', `var(--sb-category-text-preview-${category}, var(--sb-category-text-${category}))`);
    text.innerText = chrome.i18n.getMessage(`category_${category}`);
    overlay.classList.add("sponsorThumbnailLabelVisible");

    return overlay;
}

export async function setupThumbnailHover(thumbnail: HTMLImageElement): Promise<void> {
    // Cache would be reset every load due to no SPA
    if (isOnInvidious()) return;

    const mainElement = thumbnail.closest("#dismissible") as HTMLElement;
    if (mainElement) {
        mainElement.removeEventListener("mouseenter", thumbnailHoverListener);
        mainElement.addEventListener("mouseenter", thumbnailHoverListener);
    }
}

function thumbnailHoverListener(e: MouseEvent) {
    if (!chrome.runtime?.id) return;

    const thumbnail = (e.target as HTMLElement).querySelector(getThumbnailSelector()) as HTMLImageElement;
    if (!thumbnail) return;

    // Pre-fetch data for this video
    const videoID = extractVideoID(thumbnail);
    if (videoID) {
        void getSegmentsForVideo(videoID, false);
    }
}

function extractVideoID(thumbnail: HTMLImageElement): VideoID | null {
    const link = (isOnInvidious() ? thumbnail.parentElement : thumbnail.querySelector("#thumbnail")) as HTMLAnchorElement
    if (!link || link.nodeName !== "A" || !link.href) return null; // no link found

    return parseYouTubeVideoIDFromURL(link.href)?.videoID;
}

function getOldThumbnailLabel(thumbnail: HTMLImageElement): HTMLElement | null {
    return thumbnail.querySelector(".sponsorThumbnailLabel") as HTMLElement | null;
}   

function hideThumbnailLabel(thumbnail: HTMLImageElement): void {
    const oldLabel = getOldThumbnailLabel(thumbnail);
    if (oldLabel) {
        oldLabel.classList.remove("sponsorThumbnailLabelVisible");
    }
}

function createOrGetThumbnail(thumbnail: HTMLImageElement): { overlay: HTMLElement; text: HTMLElement } {
    const oldElement = getOldThumbnailLabel(thumbnail);
    if (oldElement) {
        return {
            overlay: oldElement as HTMLElement,
            text: oldElement.querySelector("span") as HTMLElement
        };
    }

    const overlay = document.createElement("div") as HTMLElement;
    overlay.classList.add("sponsorThumbnailLabel");
    // Disable hover autoplay
    overlay.addEventListener("pointerenter", (e) => {
        e.stopPropagation();
        thumbnail.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    });
    overlay.addEventListener("pointerleave", (e) => {
        e.stopPropagation();
        thumbnail.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    });

    const icon = createSBIconElement();
    const text = document.createElement("span");
    overlay.appendChild(icon);
    overlay.appendChild(text);
    thumbnail.appendChild(overlay);

    return {
        overlay,
        text
    };
}

function createSBIconElement(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 565.15 568");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#SponsorBlockIcon");
    svg.appendChild(use);
    return svg;
}


// Inserts the icon svg definition, so it can be used elsewhere
function insertSBIconDefinition() {
    const container = document.createElement("span");

    // svg from /public/icons/PlayerStartIconSponsorBlocker.svg, with useless stuff removed
    container.innerHTML = `
<svg viewBox="0 0 565.15 568" style="display: none">
  <defs>
    <g id="SponsorBlockIcon">
      <path d="M282.58,568a65,65,0,0,1-34.14-9.66C95.41,463.94,2.54,300.46,0,121A64.91,64.91,0,0,1,34,62.91a522.56,522.56,0,0,1,497.16,0,64.91,64.91,0,0,1,34,58.12c-2.53,179.43-95.4,342.91-248.42,437.3A65,65,0,0,1,282.58,568Zm0-548.31A502.24,502.24,0,0,0,43.4,80.22a45.27,45.27,0,0,0-23.7,40.53c2.44,172.67,91.81,330,239.07,420.83a46.19,46.19,0,0,0,47.61,0C453.64,450.73,543,293.42,545.45,120.75a45.26,45.26,0,0,0-23.7-40.54A502.26,502.26,0,0,0,282.58,19.69Z"/>
      <path d="M 284.70508 42.693359 A 479.9 479.9 0 0 0 54.369141 100.41992 A 22.53 22.53 0 0 0 42.669922 120.41992 C 45.069922 290.25992 135.67008 438.63977 270.83008 522.00977 A 22.48 22.48 0 0 0 294.32031 522.00977 C 429.48031 438.63977 520.08047 290.25992 522.48047 120.41992 A 22.53 22.53 0 0 0 510.7793 100.41992 A 479.9 479.9 0 0 0 284.70508 42.693359 z M 220.41016 145.74023 L 411.2793 255.93945 L 220.41016 366.14062 L 220.41016 145.74023 z "/>
    </g>
  </defs>
</svg>`;
    document.body.appendChild(container.children[0]);
}

export function setupThumbnailListener(): void {
    setThumbnailListener(handleThumbnails, () => {
        insertSBIconDefinition();
    }, () => Config.isReady());
}