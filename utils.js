function getYouTubeVideoID(url) {

    try { // Attempt to parse url
        var obj = new URL(url);
    } catch (e) {      
        console.error("[SB] Unable to parser URL");
        return false
    }
  
    if(!["www.youtube.com","www.youtube-nocookie.com"].includes(obj.host)) return false // Check if valid hostname
    
    if (obj.pathname == "/watch" && obj.searchParams.has("v")) {
      id = obj.searchParams.get("v"); // Get ID from searchParam
      return id.length == 11 ? id : false;
    } else if (obj.pathname.startsWith("/embed/")) {
      try {
        return obj.pathname.substr(7, 11);
      } catch (e) {
        console.error("[SB] Video ID not valid");
        return false
      }
    }
}

//returns the start time of the video if there was one specified (ex. ?t=5s)
function getYouTubeVideoStartTime(url) {
  let searchParams = new URL(url).searchParams;
  var startTime = searchParams.get("t");
  if (startTime == null) {
    startTime = searchParams.get("time_continue");
  }

  return startTime;
}
