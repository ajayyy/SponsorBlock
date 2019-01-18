chrome.tabs.onUpdated.addListener( // On tab update
  function(tabId, changeInfo, tab) {
    if (changeInfo.url && id = youtube_parser(changeInfo.url)) { // If URL changed and is youtube video message ContentScript the video id
      chrome.tabs.sendMessage( tabId, {
        message: 'ytvideoid',
        id: id
      })
    }
  }
);
function youtube_parser(url) { // Return video id or false
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}
