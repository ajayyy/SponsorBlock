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

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
  console.log(request.message)
  if (request.message == "submitTimes") {
    submitTimes(request.videoID);

    callback({
      success: true
    });
  }
});

function submitTimes(videoID) {
  //get the video times from storage
  let sponsorTimeKey = 'videoTimes' + videoID;
  chrome.storage.local.get([sponsorTimeKey], function(result) {
    let videoTimes = result[sponsorTimeKey];

    if (videoTimes != undefined && result.videoTimes != []) {
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

function getYouTubeVideoID(url) { // Return video id or false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}