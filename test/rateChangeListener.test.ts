/**
 * @jest-environment jsdom
 */

import { addRateChangeListener } from "../src/utils/rateChangeListener";

describe("addRateChangeListener", () => {
    let video: HTMLVideoElement;
    beforeEach(() => {
        video = document.createElement("video");
        document.body.appendChild(video);
    });

    afterEach(() => {
        video.remove();
    });

    it("is called when the playback rate changes", () => {
        const listener = jest.fn();
        addRateChangeListener(video, listener);

        video.dispatchEvent(new Event("ratechange"));

        expect(listener).toHaveBeenCalledTimes(1);
    });

    // Video Speed Controller does this for one second after every speed change it makes
    it("is called when another extension stops propagation on the document", () => {
        const blockingListener = (e: Event) => e.stopImmediatePropagation();
        document.addEventListener("ratechange", blockingListener, true);

        const listener = jest.fn();
        addRateChangeListener(video, listener);

        video.dispatchEvent(new Event("ratechange"));
        document.removeEventListener("ratechange", blockingListener, true);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("ignores rate changes of other videos", () => {
        const otherVideo = document.createElement("video");
        document.body.appendChild(otherVideo);

        const listener = jest.fn();
        addRateChangeListener(video, listener);

        otherVideo.dispatchEvent(new Event("ratechange"));
        otherVideo.remove();

        expect(listener).not.toHaveBeenCalled();
    });

    it("is not called after being removed", () => {
        const listener = jest.fn();
        const removeListener = addRateChangeListener(video, listener);

        removeListener();
        video.dispatchEvent(new Event("ratechange"));

        expect(listener).not.toHaveBeenCalled();
    });
});
