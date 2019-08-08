//when a new tab is highlighted
chrome.tabs.onActivated.addListener(
  function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
      let id = getYouTubeVideoID(tab.url);

      //if this even is a YouTube tab
      if (id) {
        videoIDChange(id, activeInfo.tabId);
      }
    })
  }
);

//when a tab changes URLs
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo != undefined && changeInfo.url != undefined) {
      let id = getYouTubeVideoID(changeInfo.url);

      //if URL changed and is youtube video message contentScript the video id
      if (changeInfo.url && id) { 
        videoIDChange(id, tabId);
      }
    }
});

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
  if (request.message == "submitTimes") {
    submitTimes(request.videoID, callback);

    //this allows the callback to be called later by the submitTimes function
    return true;
  } else if (request.message == "addSponsorTime") {
    addSponsorTime(request.time, request.videoID, callback);

    //this allows the callback to be called later
    return true;
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

//add help page on install
chrome.runtime.onInstalled.addListener(function (object) {
  chrome.storage.sync.get(["userID"], function(result) {
    const userID = result.userID;
    // If there is no userID, then it is the first install.
    if (!userID){
      //open up the install page
      chrome.tabs.create({url: chrome.extension.getURL("/help/index.html")});

      //generate a userID
      const newUserID = generateUUID();
      //save this UUID
      chrome.storage.sync.set({
        "userID": newUserID,
        "serverAddress": serverAddress,
        //the last video id loaded, to make sure it is a video id change
        "sponsorVideoID": null,
        "previousVideoID": null
      });
    }
  });
});

//gets the sponsor times from memory
function getSponsorTimes(videoID, callback) {
  let sponsorTimes = [];
  let sponsorTimeKey = "sponsorTimes" + videoID;
  chrome.storage.sync.get([sponsorTimeKey], function(result) {
    let sponsorTimesStorage = result[sponsorTimeKey];
    if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
      sponsorTimes = sponsorTimesStorage;
    }

    callback(sponsorTimes)
  });
}

function addSponsorTime(time, videoID, callback) {
  getSponsorTimes(videoID, function(sponsorTimes) {
    //add to sponsorTimes
    if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
      //it is an end time
      sponsorTimes[sponsorTimes.length - 1][1] = time;
    } else {
      //it is a start time
      let sponsorTimesIndex = sponsorTimes.length;
      sponsorTimes[sponsorTimesIndex] = [];

      sponsorTimes[sponsorTimesIndex][0] = time;
    }

    //save this info
    let sponsorTimeKey = "sponsorTimes" + videoID;
    chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes}, callback);
  });
}

function submitVote(type, UUID, callback) {
  chrome.storage.sync.get(["serverAddress", "userID"], function(result) {
    const serverAddress = result.serverAddress;
    const userID = result.userID;

    //publish this vote
    sendRequestToServer("GET", serverAddress + "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + "&type=" + type, function(xmlhttp, error) {
      if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
        callback({
          successType: 1
        });
      } else if (xmlhttp.readyState == 4 && xmlhttp.status == 405) {
        //duplicate vote
        callback({
          successType: 0,
          statusCode: xmlhttp.status
        });
      } else if (error) {
        //error while connect
        callback({
          successType: -1,
          statusCode: xmlhttp.status
        });
      }
    })
  })
}

function submitTimes(videoID, callback) {
  //get the video times from storage
  let sponsorTimeKey = 'sponsorTimes' + videoID;
  chrome.storage.sync.get([sponsorTimeKey, "serverAddress"], function(result) {
    let sponsorTimes = result[sponsorTimeKey];
    const serverAddress = result.serverAddress;
    const userID = result.userID;

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
      //submit these times
      for (let i = 0; i < sponsorTimes.length; i++) {
          //submit the sponsorTime
          sendRequestToServer("GET", serverAddress + "/api/postVideoSponsorTimes?videoID=" + videoID + "&startTime=" + sponsorTimes[i][0] + "&endTime=" + sponsorTimes[i][1]
          + "&userID=" + userID, function(xmlhttp, error) {
            if (xmlhttp.readyState == 4 && !error) {
              callback({
                statusCode: xmlhttp.status
              });

              if (xmlhttp.status == 200) {
                //add these to the storage log
                chrome.storage.sync.get(["sponsorTimesContributed"], function(result) {
                  let currentContributionAmount = 0;
                  if (result.sponsorTimesContributed != undefined) {
                    //current contribution amount is known
                    currentContributionAmount = result.sponsorTimesContributed;
                  }

                  //save the amount contributed
                  chrome.storage.sync.set({"sponsorTimesContributed": currentContributionAmount + sponsorTimes.length});
                });
              }
            } else if (error) {
              callback({
                statusCode: -1
              });
            }
        });
      }
    }
  });
}

function videoIDChange(currentVideoID, tabId) {
  //send a message to the content script
  chrome.tabs.sendMessage(tabId, {
    message: 'ytvideoid',
    id: currentVideoID
  });

  chrome.storage.sync.get(["sponsorVideoID", "previousVideoID"], function(result) {
    const sponsorVideoID = result.sponsorVideoID;
    const previousVideoID = result.previousVideoID;

    //not a url change
    if (sponsorVideoID == currentVideoID){
      return;
    }

    chrome.storage.sync.set({
      "sponsorVideoID": currentVideoID
    });

    //warn them if they had unsubmitted times
    if (previousVideoID != null) {
      //get the sponsor times from storage
      let sponsorTimeKey = 'sponsorTimes' + previousVideoID;
      chrome.storage.sync.get([sponsorTimeKey], function(result) {
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
        chrome.storage.sync.set({
          "previousVideoID": currentVideoID
        });
      });
    } else {
      chrome.storage.sync.set({
        "previousVideoID": currentVideoID
      });
    }
  });
}

function sendRequestToServer(type, address, callback) {
  let xmlhttp = new XMLHttpRequest();

  xmlhttp.open(type, address, true);

  if (callback != undefined) {
    xmlhttp.onreadystatechange = function () {
      callback(xmlhttp, false);
    };
  
    xmlhttp.onerror = function(ev) {
      callback(xmlhttp, true);
    };
  }

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
