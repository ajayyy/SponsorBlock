var previousVideoID = null

chrome.tabs.onUpdated.addListener( // On tab update
  function(tabId, changeInfo, tab) {
    if (changeInfo != undefined && changeInfo.url != undefined) {
      let id = getYouTubeVideoID(changeInfo.url);
      if (changeInfo.url && id) { // If URL changed and is youtube video message contentScript the video id
        videoIDChange(id);

        chrome.tabs.sendMessage( tabId, {
          message: 'ytvideoid',
          id: id
        });
      }
    }
  }
);



chrome.runtime.onMessage.addListener(function (request, sender, callback) {
  if (request.message == "submitTimes") {
    submitTimes(request.videoID);

    callback({
      success: true
    });
  } else if(request.message == "ytvideoid") {
    if (previousVideoID != request.videoID) {
      videoIDChange(request.videoID);
    }
  }
});

function submitTimes(videoID) {
  //get the video times from storage
  let sponsorTimeKey = 'videoTimes' + videoID;
  chrome.storage.local.get([sponsorTimeKey], function(result) {
    let videoTimes = result[sponsorTimeKey];

    if (videoTimes != undefined && videoTimes != []) {
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

function videoIDChange(currentVideoID) {
  //warn them if they had unsubmitted times
  if (previousVideoID != null) {
    //get the sponsor times from storage
    let sponsorTimeKey = 'videoTimes' + previousVideoID;
    chrome.storage.local.get([sponsorTimeKey], function(result) {
      let videoTimes = result[sponsorTimeKey];

      if (videoTimes != undefined && videoTimes.length > 0) {
        //warn them that they have unsubmitted sponsor times
        chrome.notifications.create("stillThere" + Math.random(), {
          type: "basic",
          title: "Do you want to submit the sponsor times for watch?v=" + previousVideoID + "?",
          message: "You seem to have left some sponsor times unsubmitted. Go back to that page to submit them (they are not deleted).",
          iconUrl: "icon.png"
        });
      }

      //set the previous video id to the currentID
      previousVideoID = currentVideoID;
    });
  } else {
    console.log(currentVideoID)
    previousVideoID = currentVideoID;
  }
}

function getYouTubeVideoID(url) { // Return video id or false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}