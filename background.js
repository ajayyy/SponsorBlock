chrome.tabs.onUpdated.addListener( // On tab update
  function(tabId, changeInfo, tab) {
    if (changeInfo != undefined && changeInfo.url != undefined) {
      let id = getYouTubeVideoID(changeInfo.url);
      if (changeInfo.url && id) { // If URL changed and is youtube video message contentScript the video id
        chrome.tabs.sendMessage( tabId, {
          message: 'ytvideoid',
          id: id
        })
      }
    }
  }
);

function getYouTubeVideoID(url) { // Return video id or false
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
  console.log(request.message)
  if (request.message == "submitTimes") {
    submitTimes(request.videoID);
  }
});

function submitTimes(videoID) {
  //get the video times from storage
  chrome.storage.local.get(['videoTimes' + videoID], function(result) {
    if (result.videoTimes != undefined && result.videoTimes != []) {
      let videoTimes = result.videoTimes;

      //TODO: remove this, just temp
      let videoID = "TEST";
  
      //submit these times
      for (let i = 0; i < videoTimes.length; i++) {
        let xmlhttp = new XMLHttpRequest();
        //submit the sponsorTime
        xmlhttp.open('GET', 'http://localhost/api/postVideoSponsorTimes?videoID=' + videoID + "&startTime=" + videoTimes[i][0] + "&endTime=" + videoTimes[i][1], true);
        xmlhttp.send();
      }
    }
  });
}