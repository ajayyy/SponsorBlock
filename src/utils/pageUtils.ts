export function getControls(): HTMLElement | false {
    const controlsSelectors = [
        // YouTube
        ".ytp-right-controls",
        // Mobile YouTube
        ".player-controls-top",
        // Invidious/videojs video element's controls element
        ".vjs-control-bar",
    ];

    for (const controlsSelector of controlsSelectors) {
        const controls = document.querySelectorAll(controlsSelector);

        if (controls && controls.length > 0) {
            return <HTMLElement> controls[controls.length - 1];
        }
    }

    return false;
}

export function isVisible(element: HTMLElement): boolean {
    return element.offsetWidth > 0 && element.offsetHeight > 0;
}

export function findValidElement(selectors: string[]): HTMLElement {
    for (const selector of selectors) {
        const element = document.querySelector(selector) as HTMLElement;
        if (element && isVisible(element)) {
            return element;
        }
    }

    return null;
}