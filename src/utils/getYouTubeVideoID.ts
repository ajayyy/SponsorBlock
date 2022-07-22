import Config from "./config";

export function getYouTubeVideoID(document: Document, url?: string): string | boolean {
    url ||= document.URL;
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    const pathname = urlObj.pathname;
    // clips should never skip, going from clip to full video has no indications.
    if (pathname.startsWith("/clip/") && origin.endsWith(".youtube.com")) return false;
    // skip to document and don't hide if on /embed/
    if (pathname.includes("/embed/") && origin.endsWith(".youtube.com")) return getYouTubeVideoIDFromDocument(document, false);
    // skip to URL if matches youtube watch or invidious or matches youtube pattern
    if ((!origin.endsWith(".youtube.com")) || pathname.includes("/watch") || pathname.includes("/shorts/") || pathname.includes("playlist")) return getYouTubeVideoIDFromURL(url);
    // skip to document if matches pattern
    if (pathname.includes("/channel/") || pathname.includes("/user/") || pathname.includes("/c/")) return getYouTubeVideoIDFromDocument(document);
    // not sure, try URL then document
    return getYouTubeVideoIDFromURL(url) || getYouTubeVideoIDFromDocument(document, false);
}

export function getYouTubeVideoIDFromDocument(document: Document, hideIcon = true): string | boolean {
    // get ID from document (channel trailer / embedded playlist)
    const videoURL = document.querySelector("[data-sessionlink='feature=player-title']")?.getAttribute("href");
    if (videoURL) {
        onInvidious = hideIcon;
        return getYouTubeVideoIDFromURL(videoURL);
    } else {
        return false
    }
}

export function getYouTubeVideoIDFromURL(url: string): string | boolean {
    if(url.startsWith("https://www.youtube.com/tv#/")) url = url.replace("#", "");

    //Attempt to parse url
    let urlObject: URL = null;
    try {
        urlObject = new URL(url);
    } catch (e) {
        console.error("[SB] Unable to parse URL: " + url);
        return false;
    }

    // Check if valid hostname
    if (Config.config && Config.config.invidiousInstances.includes(urlObject.host)) {
        onInvidious = true;
    } else if (urlObject.host === "m.youtube.com") {
        onMobileYouTube = true;
    } else if (!["m.youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "music.youtube.com"].includes(urlObject.host)) {
        if (!Config.config) {
            // Call this later, in case this is an Invidious tab
            utils.wait(() => Config.config !== null).then(() => videoIDChange(getYouTubeVideoIDFromURL(url)));
        }

        return false;
    } else {
        onInvidious = false;
    }

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        const id = urlObject.searchParams.get("v");
        return id.length == 11 ? id : false;
    } else if (urlObject.pathname.startsWith("/embed/") || urlObject.pathname.startsWith("/shorts/")) {
        try {
            const id = urlObject.pathname.split("/")[2]
            if (id?.length >=11 ) return id.slice(0, 11);
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return false;
        }
    }
    return false;
}
