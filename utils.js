function getTrailerID() { // Requires DOM level access
    let p = document.location.pathname;
    if(!document.location.origin === "https://www.youtube.com") return false
    if(!p.startsWith("/user/")  && !p.startsWith("/channel/"))  return false
    if(document.getElementsByClassName("ytp-title-link")[1] === undefined) return false
    let id = document.getElementsByClassName("ytp-title-link")[1].href.split("?v=")[1];
    return id.length == 11 ? id : false;
}

function getYouTubeVideoID(url) {
    if(url === undefined) {
        if(id = getTrailerID()) return id;
        url = document.URL;
    }
    //Attempt to parse url
    try {
        urlObject = new URL(url);
    } catch (e) {      
        console.error("[SB] Unable to parse URL: " + url);
        return false
    }
    //Check if valid hostname
    if(!["www.youtube.com","www.youtube-nocookie.com"].includes(urlObject.host)) return false; 
    
    //Get ID from searchParam
    if ((urlObject.pathname == "/watch" || urlObject.pathname == "/watch/") && urlObject.searchParams.has("v")) {
      id = urlObject.searchParams.get("v"); 
      return id.length == 11 ? id : false;
    } else if (urlObject.pathname.startsWith("/embed/")) {
      try {
        return urlObject.pathname.substr(7, 11);
      } catch (e) {
        console.error("[SB] Video ID not valid for " + url);
        return false;
      }
    }
}

//returns the start time of the video if there was one specified (ex. ?t=5s)
function getYouTubeVideoStartTime(url) {
  let searchParams = new URL(url).searchParams;
  let startTime = searchParams.get("t");
  if (startTime == null) {
    startTime = searchParams.get("time_continue");
  }

  return startTime;
}
