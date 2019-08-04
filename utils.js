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
