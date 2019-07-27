
// References
var SB = {};

SB.sponsorStart = document.getElementById("sponsorStart");
SB.clearTimes = document.getElementById("clearTimes");
SB.submitTimes = document.getElementById("submitTimes");
SB.showNoticeAgain = document.getElementById("showNoticeAgain");
SB.hideVideoPlayerControls = document.getElementById("hideVideoPlayerControls");
SB.showVideoPlayerControls = document.getElementById("showVideoPlayerControls");
SB.disableSponsorViewTracking = document.getElementById("disableSponsorViewTracking");
SB.enableSponsorViewTracking = document.getElementById("enableSponsorViewTracking");
SB.optionsButton = document.getElementById("optionsButton");
SB.reportAnIssue = document.getElementById("reportAnIssue");
// sponsorTimesContributions
SB.sponsorTimesContributionsContainer = document.getElementById("sponsorTimesContributionsContainer");
SB.sponsorTimesContributionsDisplay = document.getElementById("sponsorTimesContributionsDisplay");
SB.sponsorTimesContributionsDisplayEndWord = document.getElementById("sponsorTimesContributionsDisplayEndWord");

//setup click listeners
SB.sponsorStart.addEventListener("click", sendSponsorStartMessage);
SB.clearTimes.addEventListener("click", clearTimes);
SB.submitTimes.addEventListener("click", submitTimes);
SB.showNoticeAgain.addEventListener("click", showNoticeAgain);
SB.hideVideoPlayerControls.addEventListener("click", hideVideoPlayerControls);
SB.showVideoPlayerControls.addEventListener("click", showVideoPlayerControls);
SB.disableSponsorViewTracking.addEventListener("click", disableSponsorViewTracking);
SB.enableSponsorViewTracking.addEventListener("click", enableSponsorViewTracking);
SB.optionsButton.addEventListener("click", openOptions);
SB.reportAnIssue.addEventListener("click", reportAnIssue);

//if true, the button now selects the end time
var startTimeChosen = false;

//the start and end time pairs (2d)
var sponsorTimes = [];

//current video ID of this tab
var currentVideoID = null;

//is this a YouTube tab?
var isYouTubeTab = false;

//if the don't show notice again variable is true, an option to 
//  disable should be available
chrome.storage.sync.get(["dontShowNoticeAgain"], function(result) {
  let dontShowNoticeAgain = result.dontShowNoticeAgain;
  if (dontShowNoticeAgain != undefined && dontShowNoticeAgain) {
    SB.showNoticeAgain.style.display = "unset";
  }
});

//show proper video player controls option
chrome.storage.sync.get(["hideVideoPlayerControls"], function(result) {
  let hideVideoPlayerControls = result.hideVideoPlayerControls;
  if (hideVideoPlayerControls != undefined && hideVideoPlayerControls) {
    SB.hideVideoPlayerControls.style.display = "none";
    SB.showVideoPlayerControls.style.display = "unset";
  }
});

//show proper tracking option
chrome.storage.sync.get(["trackViewCount"], function(result) {
  let trackViewCount = result.trackViewCount;
  if (trackViewCount != undefined && !trackViewCount) {
    SB.disableSponsorViewTracking.style.display = "none";
    SB.enableSponsorViewTracking.style.display = "unset";
  }
});

//get the amount of times this user has contributed and display it to thank them
chrome.storage.sync.get(["sponsorTimesContributed"], function(result) {
  if (result.sponsorTimesContributed != undefined) {
    if (result.sponsorTimesContributed > 1) {
      SB.sponsorTimesContributionsDisplayEndWord.innerText = "sponsors."
    } else {
      SB.sponsorTimesContributionsDisplayEndWord.innerText = "sponsor."
    }
    SB.sponsorTimesContributionsDisplay.innerText = result.sponsorTimesContributed;
    SB.sponsorTimesContributionsContainer.style.display = "unset";

    //get the userID
    chrome.storage.sync.get(["userID"], function(result) {
      let userID = result.userID;
      if (userID != undefined) {
        //there are probably some views on these submissions then
        //get the amount of views from the sponsors submitted
        sendRequestToServer("GET", "/api/getViewsForUser?userID=" + userID, function(xmlhttp) {
          if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            let viewCount = JSON.parse(xmlhttp.responseText).viewCount;
            if (viewCount != 0) {
              if (viewCount > 1) {
                SB.sponsorTimesViewsDisplayEndWord.innerText = "sponsor segments."
              } else {
                SB.sponsorTimesViewsDisplayEndWord.innerText = "sponsor segment."
              }
              SB.sponsorTimesViewsDisplay.innerText = viewCount;
              SB.sponsorTimesViewsContainer.style.display = "unset";
            }
          }
        });
      }
    });
  }
});


chrome.tabs.query({
  active: true,
  currentWindow: true
}, loadTabData);

function loadTabData(tabs) {
  //set current videoID
  currentVideoID = getYouTubeVideoID(tabs[0].url);

  if (!currentVideoID) {
    //this isn't a YouTube video then
    displayNoVideo();
    return;
  }

  //load video times for this video 
  let sponsorTimeKey = "sponsorTimes" + currentVideoID;
  chrome.storage.sync.get([sponsorTimeKey], function(result) {
    let sponsorTimesStorage = result[sponsorTimeKey];
    if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
      if (sponsorTimesStorage[sponsorTimesStorage.length - 1] != undefined && sponsorTimesStorage[sponsorTimesStorage.length - 1].length < 2) {
        startTimeChosen = true;
        SB.sponsorStart.innerHTML = "Sponsorship Ends Now";
      }

      sponsorTimes = sponsorTimesStorage;

      displaySponsorTimes();

      //show submission section
      document.getElementById("submissionSection").style.display = "unset";

      showSubmitTimesIfNecessary();
    }
  });

  //check if this video's sponsors are known
  chrome.tabs.sendMessage(
    tabs[0].id,
    {message: 'isInfoFound'},
    infoFound
  );
}

function infoFound(request) {
  if(chrome.runtime.lastError) {
    //This page doesn't have the injected content script, or at least not yet
    displayNoVideo();
    return;
  }

  //if request is undefined, then the page currently being browsed is not YouTube
  if (request != undefined) {
    //this must be a YouTube video
    //set variable
    isYouTubeTab = true;

    //remove loading text
    document.getElementById("mainControls").style.display = "unset"
    document.getElementById("loadingIndicator").innerHTML = "";

    if (request.found) {
      document.getElementById("videoFound").innerHTML = "This video's sponsors are in the database!"

      displayDownloadedSponsorTimes(request);
    } else {
      document.getElementById("videoFound").innerHTML = "No sponsors found"
    }
  }
}

function setVideoID(request) {
  //if request is undefined, then the page currently being browsed is not YouTube
  if (request != undefined) {
    videoID = request.videoID;
  }
}

function sendSponsorStartMessage() {
    //the content script will get the message if a YouTube page is open
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {from: 'popup', message: 'sponsorStart'}
      );
    });
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
  if (request.message == "time") {
    let sponsorTimesIndex = sponsorTimes.length - (startTimeChosen ? 1 : 0);

    if (sponsorTimes[sponsorTimesIndex] == undefined) {
      sponsorTimes[sponsorTimesIndex] = [];
    }

    sponsorTimes[sponsorTimesIndex][startTimeChosen ? 1 : 0] = request.time;

    let sponsorTimeKey = "sponsorTimes" + currentVideoID;
    chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes});

    updateStartTimeChosen();

    //display video times on screen
    displaySponsorTimes();

    //show submission section
    document.getElementById("submissionSection").style.display = "unset";

    showSubmitTimesIfNecessary();
  }
});

//display the video times from the array
function displaySponsorTimes() {
  //set it to the message
  document.getElementById("sponsorMessageTimes").innerHTML = getSponsorTimesMessage(sponsorTimes);
}

//display the video times from the array at the top, in a different section
function displayDownloadedSponsorTimes(request) {
  if (request.sponsorTimes != undefined) {
    //set it to the message
    document.getElementById("downloadedSponsorMessageTimes").innerHTML = getSponsorTimesMessage(request.sponsorTimes);

    //add them as buttons to the issue reporting container
    let container = document.getElementById("issueReporterTimeButtons");
    for (let i = 0; i < request.sponsorTimes.length; i++) {
      let sponsorTimeButton = document.createElement("button");
      sponsorTimeButton.className = "warningButton";
      sponsorTimeButton.innerText = getFormattedTime(request.sponsorTimes[i][0]) + " to " + getFormattedTime(request.sponsorTimes[i][1]);
      
      let votingButtons = document.createElement("div");

      let UUID = request.UUIDs[i];

      //thumbs up and down buttons
      let voteButtonsContainer = document.createElement("div");
      voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
      voteButtonsContainer.setAttribute("align", "center");
      voteButtonsContainer.style.display = "none"

      let upvoteButton = document.createElement("img");
      upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
      upvoteButton.className = "voteButton";
      upvoteButton.src = chrome.extension.getURL("icons/upvote.png");
      upvoteButton.addEventListener("click", () => vote(1, UUID));

      let downvoteButton = document.createElement("img");
      downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
      downvoteButton.className = "voteButton";
      downvoteButton.src = chrome.extension.getURL("icons/downvote.png");
      downvoteButton.addEventListener("click", () => vote(0, UUID));

      //add thumbs up and down buttons to the container
      voteButtonsContainer.appendChild(document.createElement("br"));
      voteButtonsContainer.appendChild(document.createElement("br"));
      voteButtonsContainer.appendChild(upvoteButton);
      voteButtonsContainer.appendChild(downvoteButton);

      //add click listener to open up vote panel
      sponsorTimeButton.addEventListener("click", function() {
        voteButtonsContainer.style.display = "unset";
      });

      container.appendChild(sponsorTimeButton);
      container.appendChild(voteButtonsContainer);

      //if it is not the last iteration
      if (i != request.sponsorTimes.length - 1) {
        container.appendChild(document.createElement("br"));
        container.appendChild(document.createElement("br"));
      }
    }
  }
}

//get the message that visually displays the video times
function getSponsorTimesMessage(sponsorTimes) {
  let sponsorTimesMessage = "";

  for (let i = 0; i < sponsorTimes.length; i++) {
    for (let s = 0; s < sponsorTimes[i].length; s++) {
      let timeMessage = getFormattedTime(sponsorTimes[i][s]);
      //if this is an end time
      if (s == 1) {
        timeMessage = " to " + timeMessage;
      } else if (i > 0) {
        //add commas if necessary
        timeMessage = ", " + timeMessage;
      }

      sponsorTimesMessage += timeMessage;
    }
  }

  return sponsorTimesMessage;
}

function clearTimes() {
  //send new sponsor time state to tab
  if (sponsorTimes.length > 0) {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeStartSponsorButton",
        showStartSponsor: true,
        uploadButtonVisible: false
      });
    });
  }

  //reset sponsorTimes
  sponsorTimes = [];

  let sponsorTimeKey = "sponsorTimes" + currentVideoID;
  chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes});

  displaySponsorTimes();

  //hide submission section
  document.getElementById("submissionSection").style.display = "none";

  resetStartTimeChosen();
}

function submitTimes() {
  //make info message say loading
  document.getElementById("submitTimesInfoMessage").innerText = "Loading...";
  document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";

  if (sponsorTimes.length > 0) {
    chrome.runtime.sendMessage({
      message: "submitTimes",
      videoID: currentVideoID
    }, function(response) {
      if (response != undefined) {
        if (response.statusCode == 200) {
          //hide loading message
          document.getElementById("submitTimesInfoMessageContainer").style.display = "none";
  
          clearTimes();
        } else if(response.statusCode == 400) {
          document.getElementById("submitTimesInfoMessage").innerText = "Server said this request was invalid";
          document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";
        } else if(response.statusCode == 429) {
          document.getElementById("submitTimesInfoMessage").innerText = "You have submitted too many sponsor times for this one video, are you sure there are this many?";
          document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";
        } else if(response.statusCode == 409) {
          document.getElementById("submitTimesInfoMessage").innerText = "This has already been submitted before";
          document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";
        } else {
          document.getElementById("submitTimesInfoMessage").innerText = "There was an error submitting your sponsor times, please try again later. Error code " + response.statusCode;
          document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";
        }
      }
    });
  }
}

function showNoticeAgain() {
  chrome.storage.sync.set({"dontShowNoticeAgain": false});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "showNoticeAgain"
    });
  });

  SB.showNoticeAgain.style.display = "none";
}

function hideVideoPlayerControls() {
  chrome.storage.sync.set({"hideVideoPlayerControls": true});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "changeVideoPlayerControlsVisibility",
      value: true
    });
  });

  SB.hideVideoPlayerControls.style.display = "none";
  SB.showVideoPlayerControls.style.display = "unset";
}

function showVideoPlayerControls() {
  chrome.storage.sync.set({"hideVideoPlayerControls": false});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "changeVideoPlayerControlsVisibility",
      value: false
    });
  });

  SB.hideVideoPlayerControls.style.display = "unset";
  SB.showVideoPlayerControls.style.display = "none";
}

function disableSponsorViewTracking() {
  chrome.storage.sync.set({"trackViewCount": false});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "trackViewCount",
      value: false
    });
  });

  SB.disableSponsorViewTracking.style.display = "none";
  SB.enableSponsorViewTracking.style.display = "unset";
}

function enableSponsorViewTracking() {
  chrome.storage.sync.set({"trackViewCount": true});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "trackViewCount",
      value: true
    });
  });

  SB.enableSponsorViewTracking.style.display = "none";
  SB.disableSponsorViewTracking.style.display = "unset";
}

function updateStartTimeChosen() {
  //update startTimeChosen variable
  if (!startTimeChosen) {
    startTimeChosen = true;
  SB.sponsorStart.innerHTML = "Sponsorship Ends Now";
  } else {
    resetStartTimeChosen();
  }
}

//set it to false
function resetStartTimeChosen() {
  startTimeChosen = false;
  SB.sponsorStart.innerHTML = "Sponsorship Starts Now";
}

//hides and shows the submit times button when needed
function showSubmitTimesIfNecessary() {
  //check if an end time has been specified for the latest sponsor time
  if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length > 1) {
    //show submit times button
    document.getElementById("submitTimesContainer").style.display = "unset";
  } else {
    //hide submit times button
    document.getElementById("submitTimesContainer").style.display = "none";
  }
}

//make the options div visisble
function openOptions() {
  document.getElementById("optionsButtonContainer").style.display = "none";
  document.getElementById("options").style.display = "unset";
}

//this is not a YouTube video page
function displayNoVideo() {
  document.getElementById("loadingIndicator").innerHTML = "This probably isn't a YouTube tab, or you clicked too early. " +
      "If you know this is a YouTube tab, close this popup and open it again.";
}

function reportAnIssue() {
  document.getElementById("issueReporterContainer").style.display = "unset";
  SB.reportAnIssue.style.display = "none";
}

function addVoteMessage(message, UUID) {
  let container = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
  //remove all children
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  let thanksForVotingText = document.createElement("h2");
  thanksForVotingText.innerText = message;
  //there are already breaks there
  thanksForVotingText.style.marginBottom = "0px";

  container.appendChild(thanksForVotingText);
}

function vote(type, UUID) {
  //add loading info
  addVoteMessage("Loading...", UUID)

  //send the vote message to the tab
  chrome.runtime.sendMessage({
    message: "submitVote",
    type: type,
    UUID: UUID
  }, function(response) {
    if (response != undefined) {
      //see if it was a success or failure
      if (response.successType == 1) {
        //success
        addVoteMessage("Thanks for voting!", UUID)
      } else if (response.successType == 0) {
        //failure: duplicate vote
        addVoteMessage("You have already voted this way before.", UUID)
      } else if (response.successType == -1) {
        //failure: duplicate vote
        addVoteMessage("A connection error has occured.", UUID)
      }
    }
  });
}

//converts time in seconds to minutes:seconds
function getFormattedTime(seconds) {
  let minutes = Math.floor(seconds / 60);
  let secondsDisplay = Math.round(seconds - minutes * 60);
  if (secondsDisplay < 10) {
    //add a zero
    secondsDisplay = "0" + secondsDisplay;
  }

  let formatted = minutes+ ":" + secondsDisplay;

  return formatted;
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

function getYouTubeVideoID(url) { // Return video id or false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}
