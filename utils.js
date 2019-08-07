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
    } else if (obj.pathname.startsWith("/embed/")) {
      id = obj.pathname.slice("/embed/".length); // Get ID from end or URL
    }

    return id.length == 11 ? id : false; // If ID is not 11 in length return false
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
