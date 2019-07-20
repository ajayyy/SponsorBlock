var previousVideoID = null

//the id of this user, randomly generated once per install
var userID = null;

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
  } else if (request.message == "ytvideoid") {
    if (previousVideoID != request.videoID) {
      videoIDChange(request.videoID);
    }
  } else if (request.message == "addSponsorTime") {
    addSponsorTime(request.time);
  } else if (request.message == "getSponsorTimes") {
    getSponsorTimes(request.videoID, function(sponsorTimes) {
      callback({
        sponsorTimes: sponsorTimes
      })
    });

    //this allows the callback to be called later
    return true;
  } else if (request.message == "submitVote") {
    submitVote(request.type, request.UUID, callback);

    //this allows the callback to be called later
    return true;
  }
});


//gets the sponsor times from memory
function getSponsorTimes(videoID, callback) {
  let sponsorTimes = [];
  let sponsorTimeKey = "sponsorTimes" + videoID;
  chrome.storage.local.get([sponsorTimeKey], function(result) {
    let sponsorTimesStorage = result[sponsorTimeKey];
    if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
      sponsorTimes = sponsorTimesStorage;
    }

    callback(sponsorTimes)
  });
}

function addSponsorTime(time) {
  getSponsorTimes(previousVideoID, function(sponsorTimes) {
    //add to sponsorTimes
    if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
      //it is an end time
      sponsorTimes[sponsorTimes.length - 1][1] = parseInt(time);
    } else {
      //it is a start time
      let sponsorTimesIndex = sponsorTimes.length;
      sponsorTimes[sponsorTimesIndex] = [];

      sponsorTimes[sponsorTimesIndex][0] = parseInt(time);
    }

    //save this info
    let sponsorTimeKey = "sponsorTimes" + previousVideoID;
    chrome.storage.local.set({[sponsorTimeKey]: sponsorTimes});
  });
}

function submitVote(type, UUID, callback) {
  getUserID(function(userID) {
    //publish this vote
    sendRequestToUser('GET', "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + "&type=" + type, function(xmlhttp, error) {
      if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
        callback({
          successType: 1
        });
      } else if (xmlhttp.readyState == 4 && xmlhttp.status == 405) {
        //duplicate vote
        callback({
          successType: 0
        });
      } else if (error) {
        //error while connect
        callback({
          successType: -1
        });
      }
    })
  })
}

function submitTimes(videoID) {
  //get the video times from storage
  let sponsorTimeKey = 'sponsorTimes' + videoID;
  chrome.storage.local.get([sponsorTimeKey], function(result) {
    let sponsorTimes = result[sponsorTimeKey];

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
      //submit these times
      for (let i = 0; i < sponsorTimes.length; i++) {
        let xmlhttp = new XMLHttpRequest();

        let userIDStorage = getUserID(function(userIDStorage) {
          //submit the sponsorTime
          xmlhttp.open('GET', serverAddress + "/api/postVideoSponsorTimes?videoID=" + videoID + "&startTime=" + sponsorTimes[i][0] + "&endTime=" + sponsorTimes[i][1]
          + "&userID=" + userIDStorage, true);
          xmlhttp.send();
        });
      }
    }
  });
}

function videoIDChange(currentVideoID) {
  //warn them if they had unsubmitted times
  if (previousVideoID != null) {
    //get the sponsor times from storage
    let sponsorTimeKey = 'sponsorTimes' + previousVideoID;
    chrome.storage.local.get([sponsorTimeKey], function(result) {
      let sponsorTimes = result[sponsorTimeKey];

      if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        //warn them that they have unsubmitted sponsor times
        chrome.notifications.create("stillThere" + Math.random(), {
          type: "basic",
          title: "Do you want to submit the sponsor times for watch?v=" + previousVideoID + "?",
          message: "You seem to have left some sponsor times unsubmitted. Go back to that page to submit them (they are not deleted).",
          iconUrl: "./icons/LogoSponsorBlocker256px.png"
        });
      }

      //set the previous video id to the currentID
      previousVideoID = currentVideoID;
    });
  } else {
    previousVideoID = currentVideoID;
  }
}

function getUserID(callback) {
  if (userID != null) {
    callback(userID);
    return;
  }

  //if it is not cached yet, grab it from storage
  chrome.storage.local.get(["userID"], function(result) {
    let userIDStorage = result.userID;
    if (userIDStorage != undefined) {
      userID = userIDStorage;
      callback(userID);
    } else {
      //generate a userID
      userID = generateUUID();
      
      //save this UUID
      chrome.storage.local.set({"userID": userID});

      callback(userID);
    }
  });
}

function sendRequestToUser(type, address, callback) {
  let xmlhttp = new XMLHttpRequest();

  xmlhttp.open(type, serverAddress + address, true);

  xmlhttp.onreadystatechange = function () {
    callback(xmlhttp, false);
  };

  xmlhttp.onerror = function(ev) {
    callback(xmlhttp, true);
  };

  //submit this request
  xmlhttp.send();
}

function getYouTubeVideoID(url) { // Return video id or false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}

//uuid generator function from https://gist.github.com/jed/982883
function generateUUID(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,generateUUID)}