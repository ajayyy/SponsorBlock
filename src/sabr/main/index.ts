/*
 * Entry point of the page-side SABR script ("Faster skipping"), injected into the page's own
 * JavaScript context only when the experimental option is on. It does nothing outside the top
 * frame of www.youtube.com.
 */

import { PageWindow, installSabrShaper } from "./install";

const SUPPORTED_HOST = "www.youtube.com";

if (window === window.top && window.location.hostname === SUPPORTED_HOST) {
    // The real window satisfies PageWindow structurally; the cast only bridges DOM element types.
    installSabrShaper(window as unknown as PageWindow);
}
