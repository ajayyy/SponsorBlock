 /**
 * Starts a spinning animation and returns a function to be called when it should be stopped
 * The callback will be called when the animation is finished 
 * It waits until a full rotation is complete
 */
function applyLoadingAnimation(element: HTMLElement, time: number, callback?: () => void): () => Promise<void> {
    element.style.animation = `rotate ${time}s 0s infinite`;

    return async () => new Promise((resolve) => {
        // Make the animation finite
        element.style.animation = `rotate ${time}s`;

        // When the animation is over, hide the button
        const animationEndListener = () => {
            if (callback) callback();

            element.style.animation = "none";

            element.removeEventListener("animationend", animationEndListener);

            resolve();
        };

        element.addEventListener("animationend", animationEndListener);
    });
}

function setupCustomHideAnimation(element: Element, container: Element, enabled = true, rightSlide = true): { hide: () => void, show: () => void } {
    if (enabled) element.classList.add("autoHiding");
    element.classList.add("hidden");
    element.classList.add("animationDone");
    if (!rightSlide) element.classList.add("autoHideLeft");

    let mouseEntered = false;

    return {
        hide: () => {
            mouseEntered = false;
            if (element.classList.contains("autoHiding")) {
                element.classList.add("hidden");
            }
        },
        show: () => {
            mouseEntered = true;
            element.classList.remove("animationDone");

            // Wait for next event loop
            setTimeout(() => {
                if (mouseEntered) element.classList.remove("hidden")
            }, 10);
        }
    };
}

function setupAutoHideAnimation(element: Element, container: Element, enabled = true, rightSlide = true): void {
    const { hide, show } = this.setupCustomHideAnimation(element, container, enabled, rightSlide);

    container.addEventListener("mouseleave", () => hide());
    container.addEventListener("mouseenter", () => show());
}

function enableAutoHideAnimation(element: Element): void {
    element.classList.add("autoHiding");
    element.classList.add("hidden");
}

function disableAutoHideAnimation(element: Element): void {
    element.classList.remove("autoHiding");
    element.classList.remove("hidden");
}

export const AnimationUtils = {
    applyLoadingAnimation,
    setupAutoHideAnimation,
    setupCustomHideAnimation,
    enableAutoHideAnimation,
    disableAutoHideAnimation
};