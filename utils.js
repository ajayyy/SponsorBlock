function getYouTubeVideoID(url) {
    if(url === undefined) {
        shere_url = document.getElementById("share-url");
        if(shere_url) {
            id = shere_url.split(".be/")[1];
            return id.length == 11 ? id : false;
        }
        url = document.location;
    } else {
        try {
            url = new URL(url);
        } catch (e) {      
            console.error("[SB] Unable to parse URL: " + url);
            return false
        }
    }
    if(url.pathname.startWith("/embed"))) {
        try {
            return url.pathname.substr(7, 11);
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return false;
        }  
        return id.length == 11 ? id : false;
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
