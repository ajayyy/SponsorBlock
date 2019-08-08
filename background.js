//the id of this user, randomly generated once per install
var userID = null;

//the last video id loaded, to make sure it is a video id change
var sponsorVideoID = null;

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  chrome.runtime.sendMessage({
    message: "update",
  });
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
  chrome.storage.sync.get(["shownInstallPage"], function(result) {
    let shownInstallPage = result.shownInstallPage;
    if (shownInstallPage == undefined || !shownInstallPage) {
      //open up the install page
      chrome.tabs.create({url: chrome.extension.getURL("/help/index.html")});

      //save that this happened
      chrome.storage.sync.set({shownInstallPage: true});
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
  getUserID(function(userID) {
    //publish this vote
    sendRequestToServer('GET', "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + "&type=" + type, function(xmlhttp, error) {
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
  chrome.storage.sync.get([sponsorTimeKey], function(result) {
    let sponsorTimes = result[sponsorTimeKey];

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
      //submit these times
      for (let i = 0; i < sponsorTimes.length; i++) {
        getUserID(function(userIDStorage) {
          //submit the sponsorTime
          sendRequestToServer('GET', "/api/postVideoSponsorTimes?videoID=" + videoID + "&startTime=" + sponsorTimes[i][0] + "&endTime=" + sponsorTimes[i][1]
          + "&userID=" + userIDStorage, function(xmlhttp, error) {
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
        });
      }
    }
  });
}

function getUserID(callback) {
  if (userID != null) {
    callback(userID);
    return;
  }

  //if it is not cached yet, grab it from storage
  chrome.storage.sync.get(["userID"], function(result) {
    let userIDStorage = result.userID;
    if (userIDStorage != undefined) {
      userID = userIDStorage;
      callback(userID);
    } else {
      //double check if a UUID hasn't been created since this was first called
      if (userID != null) {
        callback(userID);
        return;
      }

      //generate a userID
      userID = generateUUID();
      
      //save this UUID
      chrome.storage.sync.set({"userID": userID});

      callback(userID);
    }
  });
}

function sendRequestToServer(type, address, callback) {
  let xmlhttp = new XMLHttpRequest();

  xmlhttp.open(type, serverAddress + address, true);

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

//uuid generator function from https://gist.github.com/jed/982883
function generateUUID(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,generateUUID)}
