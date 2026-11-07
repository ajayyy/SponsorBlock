/**
 * Calls the listener whenever the playback rate of the video changes.
 *
 * Other extensions (such as Video Speed Controller) stop ratechange events from propagating
 * in a capturing listener on the document, so a listener on the video would not be called.
 * A capturing listener on the window runs before those.
 *
 * @returns a function that removes the listener
 */
export function addRateChangeListener(video: HTMLVideoElement, listener: () => void): () => void {
    const windowListener = (e: Event) => {
        if (e.target === video) listener();
    };
    window.addEventListener("ratechange", windowListener, true);

    return () => window.removeEventListener("ratechange", windowListener, true);
}
