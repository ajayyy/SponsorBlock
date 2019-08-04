function getYouTubeVideoID(url) { // Returns with video id else returns false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  var id = new URL(url).searchParams.get("v");
  if (url.includes("/embed/")) {
    //it is an embed, don't search for v
    id = match[7];
  }

  return (match && match[7].length == 11) ? id : false;
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
