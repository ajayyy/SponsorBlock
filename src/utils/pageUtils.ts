import { ActionType, Category, SponsorSourceType, SponsorTime, VideoID } from "../types";
import { getFormattedTimeToSeconds } from "../../maze-utils/src/formating";

export function getControls(): HTMLElement {
    const controlsSelectors = [
        // YouTube
        ".ytp-right-controls",
        // Mobile YouTube
        ".player-controls-top",
        // Invidious/videojs video element's controls element
        ".vjs-control-bar",
        // Piped shaka player
        ".shaka-bottom-controls"
    ];

    for (const controlsSelector of controlsSelectors) {
        const controls = Array.from(document.querySelectorAll(controlsSelector)).filter(el => !isInPreviewPlayer(el));

        if (controls.length > 0) {
            return <HTMLElement> controls[controls.length - 1];
        }
    }

    return null;
}

export function isInPreviewPlayer(element: Element): boolean {
    return !!element.closest("#inline-preview-player");
}

export function isVisible(element: HTMLElement): boolean {
    return element && element.offsetWidth > 0 && element.offsetHeight > 0;
}

export function getHashParams(): Record<string, unknown> {
    const windowHash = window.location.hash.slice(1);
    if (windowHash) {
        const params: Record<string, unknown> = windowHash.split('&').reduce((acc, param) => {
            const [key, value] = param.split('=');
            const decoded = decodeURIComponent(value);
            try {
                acc[key] = decoded?.match(/{|\[/) ? JSON.parse(decoded) : value;
            } catch (e) {
                console.error(`Failed to parse hash parameter ${key}: ${value}`);
            }

            return acc;
        }, {});

        return params;
    }

    return {};
}

export function getExistingChapters(currentVideoID: VideoID, duration: number): SponsorTime[] {
    const chaptersBox = document.querySelector("ytd-macro-markers-list-renderer");
    const title = document.querySelector("[target-id=engagement-panel-macro-markers-auto-chapters] #title-text");
    if (title?.textContent?.includes("Key moment")) return [];

    const chapters: SponsorTime[] = [];
    // .ytp-timed-markers-container indicates that key-moments are present, which should not be divided
    if (chaptersBox) {
        let lastSegment: SponsorTime = null;
        const links = chaptersBox.querySelectorAll("ytd-macro-markers-list-item-renderer > a");
        for (const link of links) {
            const timeElement = link.querySelector("#time") as HTMLElement;
            const description = link.querySelector("#details h4") as HTMLElement;
            if (timeElement && description?.innerText?.length > 0 && link.getAttribute("href")?.includes(currentVideoID)) {
                const time = getFormattedTimeToSeconds(timeElement.innerText.replace(/\./g, ":"));
                if (time === null) return [];

                if (lastSegment) {
                    lastSegment.segment[1] = time;
                    chapters.push(lastSegment);
                }

                lastSegment = {
                    segment: [time, null],
                    category: "chapter" as Category,
                    actionType: ActionType.Chapter,
                    description: description.innerText,
                    source: SponsorSourceType.YouTube,
                    UUID: null
                };
            }
        }

        if (lastSegment) {
            lastSegment.segment[1] = duration;
            chapters.push(lastSegment);
        }
    }

    return chapters;
}

export function isPlayingPlaylist() {
    return !!document.URL.includes("&list=");
}