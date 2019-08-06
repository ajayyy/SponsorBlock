function getYouTubeVideoID(url) {
  let obj = new URL(url);
  if(obj.host !== "www.youtube.com" || "www.youtube-nocookie.com") return false // Check if valid hostname
  if (obj.pathname == "/watch") id = obj.searchParams.get("v"); // Get ID from searchParam
  if (obj.pathname.startsWith("/embed/")) id = obj.pathname.slice("/embed/".length); // Get ID from end or URL
  return id.length == 11 ? id : false;
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
