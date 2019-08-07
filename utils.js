// Returns with video id else returns false
function getYouTubeVideoID(url) {
    // https://caniuse.com/#feat=url
    let urlObject = new URL(url)

    // Check if valid hostname
    if(!["www.youtube.com","www.youtube-nocookie.com"].includes(obj.host)) {
        return false
    }

    if (urlObject.pathname == "/watch/" || urlObject.pathname == "/watch") {
        // https://caniuse.com/#feat=urlsearchparams
        let id = urlObject.searchParams.get("v");
        return id.length == 11 ? id : false
    }

    if (urlObject.pathname.startsWith("/embed/")) {
        let id = urlObject.pathname.slice("/embed/".length)
        if (id[11] && id[11] == "/")
            id = id.slice(0, 11)

        return id.length == 11 ? id : false
    }

    return false
}
