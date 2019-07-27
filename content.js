if(id = getYouTubeVideoID(document.URL)){ // Direct Links
  videoIDChange(id);
}

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;

//the actual sponsorTimes if loaded and UUIDs associated with them
var sponsorTimes = undefined;
var UUIDs = undefined;

//the video
var v;

//the last time looked at (used to see if this time is in the interval)
var lastTime = -1;

//the actual time (not video time) that the last skip happened
var lastUnixTimeSkipped = -1;

//the last time in the video a sponsor was skipped
//used for the go back button
var lastSponsorTimeSkipped = null;
//used for ratings
var lastSponsorTimeSkippedUUID = null;

//if showing the start sponsor button or the end sponsor button on the player
var showingStartSponsor = true;

//should the video controls buttons be added
var hideVideoPlayerControls = false;

//should view counts be tracked
var trackViewCount = false;
chrome.storage.sync.get(["trackViewCount"], function(result) {
  let trackViewCountStorage = result.trackViewCount;
  if (trackViewCountStorage != undefined) {
    trackViewCount = trackViewCountStorage;
  } else {
    trackViewCount = true;
  }
});

//if the notice should not be shown
//happens when the user click's the "Don't show notice again" button
var dontShowNotice = false;
chrome.storage.sync.get(["dontShowNoticeAgain"], function(result) {
  let dontShowNoticeAgain = result.dontShowNoticeAgain;
  if (dontShowNoticeAgain != undefined) {
    dontShowNotice = dontShowNoticeAgain;
  }
});

chrome.runtime.onMessage.addListener( // Detect URL Changes
  function(request, sender, sendResponse) {
    //message from background script
    if (request.message == "ytvideoid") { 
      videoIDChange(request.id);
    }

    //messages from popup script
    if (request.message == "sponsorStart") {
      sponsorMessageStarted();
    }

    if (request.message == "isInfoFound") {
      //send the sponsor times along with if it's found
      sendResponse({
        found: sponsorDataFound,
        sponsorTimes: sponsorTimes,
        UUIDs: UUIDs
      })
    }

    if (request.message == "getVideoID") {
      sendResponse({
        videoID: getYouTubeVideoID(document.URL)
      })
    }

    if (request.message == "showNoticeAgain") {
      dontShowNotice = false;
    }

    if (request.message == "changeStartSponsorButton") {
      changeStartSponsorButton(request.showStartSponsor, request.uploadButtonVisible);
    }

    if (request.message == "changeVideoPlayerControlsVisibility") {
      hideVideoPlayerControls = request.value;

      updateVisibilityOfPlayerControlsButton();
    }

    if (request.message == "trackViewCount") {
      trackViewCount = request.value;
    }
});

//check for hotkey pressed
document.onkeydown = function(e){
  e = e || window.event;
  var key = e.which || e.keyCode;

  let video = document.getElementById("movie_player");

  //is the video in focus, otherwise they could be typing a comment
  if (document.activeElement === video) {
    if(key == 186){
      //semicolon
      startSponsorClicked();
    } else if (key == 222) {
      //single quote
      submitSponsorTimes();
    }
  }
}

function videoIDChange(id) {
  //reset last sponsor times
  lastTime = -1;
  lastUnixTimeSkipped = -1;

  //reset sponsor times
  sponsorTimes = undefined;
  UUIDs = undefined;

  //reset sponsor data found check
  sponsorDataFound = false;
  sponsorsLookup(id);

  //see if the onvideo control image needs to be changed
  chrome.runtime.sendMessage({
    message: "getSponsorTimes",
    videoID: id
  }, function(response) {
    if (response != undefined) {
      let sponsorTimes = response.sponsorTimes;
      if (sponsorTimes != undefined && sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length >= 2) {
        document.getElementById("submitButton").style.display = "unset";
      } else if (sponsorTimes != undefined && sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
        toggleStartSponsorButton();
      }
    }
  });

  //see if video control buttons should be added
  chrome.storage.sync.get(["hideVideoPlayerControls"], function(result) {
    if (result.hideVideoPlayerControls != undefined) {
      hideVideoPlayerControls = result.hideVideoPlayerControls;
    }

    updateVisibilityOfPlayerControlsButton();
  });
}

function sponsorsLookup(id) {
    v = document.querySelector('video') // Youtube video player
    
    //check database for sponsor times
    sendRequestToServer('GET', "/api/getVideoSponsorTimes?videoID=" + id, function(xmlhttp) {
      if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
        sponsorDataFound = true;

        sponsorTimes = JSON.parse(xmlhttp.responseText).sponsorTimes;
        UUIDs = JSON.parse(xmlhttp.responseText).UUIDs;

        // If the sponsor data exists, add the event to run on the videos "ontimeupdate"
        v.ontimeupdate = function () { 
            sponsorCheck(sponsorTimes);
        };
      } else if (xmlhttp.readyState == 4) {
        sponsorDataFound = false;

        //check if this video was uploaded recently
        //use the invidious api to get the time published
        sendRequestToCustomServer('GET', "https://invidio.us/api/v1/videos/" + id, function(xmlhttp, error) {
          if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            let unixTimePublished = JSON.parse(xmlhttp.responseText).published;

            //if less than 3 days old
            if ((Date.now() / 1000) - unixTimePublished < 259200) {
              setTimeout(() => sponsorsLookup(id), 10000);
            }
          }
        });
      }
    });
}

function sponsorCheck(sponsorTimes) { // Video skipping
  //see if any sponsor start time was just passed
  for (let i = 0; i < sponsorTimes.length; i++) {
    //this means part of the video was just skipped
    if (Math.abs(v.currentTime - lastTime) > 1 && lastTime != -1) {
      //make lastTime as if the video was playing normally
      lastTime = v.currentTime - 0.0001;
    }

    let currentTime = Date.now();

    //If the sponsor time is in between these times, skip it
    //Checks if the last time skipped to is not too close to now, to make sure not to get too many
    //  sponsor times in a row (from one troll)
    //the last term makes 0 second start times possible
    if ((Math.abs(v.currentTime - sponsorTimes[i][0]) < 0.3 && sponsorTimes[i][0] >= lastTime && sponsorTimes[i][0] <= v.currentTime
          && (lastUnixTimeSkipped == -1 || currentTime - lastUnixTimeSkipped > 500)) || (lastTime == -1 && sponsorTimes[i][0] == 0)) {
      //skip it
      v.currentTime = sponsorTimes[i][1];

      lastSponsorTimeSkipped = sponsorTimes[i][0];
      
      let currentUUID =  UUIDs[i];
      lastSponsorTimeSkippedUUID = currentUUID; 

      //send out the message saying that a sponsor message was skipped
      openSkipNotice(currentUUID);

      setTimeout(() => closeSkipNotice(currentUUID), 7000);

      //send telemetry that a this sponsor was skipped happened
      if (trackViewCount) {
        sendRequestToServer("GET", "/api/viewedVideoSponsorTime?UUID=" + currentUUID);
      }
    }
  }

  //don't keep track until they are loaded in
  if (sponsorTimes.length > 0) {
    lastTime = v.currentTime;
  }
}

function goBackToPreviousTime(UUID) {
  if (sponsorTimes != undefined) {
    //add a tiny bit of time to make sure it is not skipped again
    v.currentTime = sponsorTimes[UUIDs.indexOf(UUID)][0] + 0.001;

    closeSkipNotice(UUID);
  }
}

//Adds a sponsorship starts button to the player controls
function addPlayerControlsButton() {
  if (document.getElementById("startSponsorButton") != null) {
    //it's already added
    return;
  }

  let startSponsorButton = document.createElement("button");
  startSponsorButton.id = "startSponsorButton";
  startSponsorButton.className = "ytp-button playerButton";
  startSponsorButton.setAttribute("title", "Sponsor Starts Now");
  startSponsorButton.addEventListener("click", startSponsorClicked);

  let startSponsorImage = document.createElement("img");
  startSponsorImage.id = "startSponsorImage";
  startSponsorImage.className = "playerButtonImage";
  startSponsorImage.src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");

  //add the image to the button
  startSponsorButton.appendChild(startSponsorImage);

  let referenceNode = document.getElementsByClassName("ytp-right-controls")[0];
  
  referenceNode.prepend(startSponsorButton);
}

function removePlayerControlsButton() {
  document.getElementById("startSponsorButton").style.display = "none";
  document.getElementById("submitButton").style.display = "none";
}

//adds or removes the player controls button to what it should be
function updateVisibilityOfPlayerControlsButton() {
  addPlayerControlsButton();
  addSubmitButton();
  if (hideVideoPlayerControls) {
    removePlayerControlsButton();
  }
}

function startSponsorClicked() {
  toggleStartSponsorButton();

  //send back current time with message
  chrome.runtime.sendMessage({
    message: "addSponsorTime",
    time: v.currentTime,
    videoID: getYouTubeVideoID(document.URL)
  });
}

function changeStartSponsorButton(showStartSponsor, uploadButtonVisible) {
  if (showStartSponsor) {
    showingStartSponsor = true;
    document.getElementById("startSponsorImage").src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");

    if (document.getElementById("startSponsorImage").style.display != "none" && uploadButtonVisible) {
      document.getElementById("submitButton").style.display = "unset";
    } else if (!uploadButtonVisible) {
      //disable submit button
      document.getElementById("submitButton").style.display = "none";
    }
  } else {
    showingStartSponsor = false;
    document.getElementById("startSponsorImage").src = chrome.extension.getURL("icons/PlayerStopIconSponsorBlocker256px.png");

    //disable submit button
    document.getElementById("submitButton").style.display = "none";
  }
}

function toggleStartSponsorButton() {
  changeStartSponsorButton(!showingStartSponsor, true);
}

//shows the submit button on the video player
function addSubmitButton() {
  if (document.getElementById("submitButton") != null) {
    //it's already added
    return;
  }
  
  //make a submit button
  let submitButton = document.createElement("button");
  submitButton.id = "submitButton";
  submitButton.className = "ytp-button playerButton";
  submitButton.setAttribute("title", "Submit Sponsor Times");
  submitButton.addEventListener("click", submitSponsorTimes);
  //hide it at the start
  submitButton.style.display = "none";

  let submitImage = document.createElement("img");
  submitImage.id = "submitButtonImage";
  submitImage.className = "playerButtonImage";
  submitImage.src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker256px.png");

  //add the image to the button
  submitButton.appendChild(submitImage);

  let referenceNode = document.getElementsByClassName("ytp-right-controls")[0];
  referenceNode.prepend(submitButton);
}

//Opens the notice that tells the user that a sponsor was just skipped
function openSkipNotice(UUID){
  if (dontShowNotice) {
    //don't show, return
    return;
  }

  //check if page is loaded yet (for 0 second sponsors, the page might not be loaded yet)
  //it looks for the view count div and sees if it is full yet
  //querySelectorAll is being used like findElementById for multiple objects, because for
  //some reason YouTube has put more than one object with one ID.
  let viewCountNode = document.querySelectorAll("#count");
  //check to see if the length is over zero, otherwise it's a different YouTube theme probably
  if (viewCountNode.length > 0) {
    //check if any of these have text
    let viewCountVisible = false;
    for (let i = 0; i < viewCountNode.length; i++) {
      if (viewCountNode[i].innerText != null) {
        viewCountVisible = true;
        break;
      }
    }
    if (!viewCountVisible) {
      //this is the new YouTube layout and it is still loading
      //wait a bit for opening the notice
      setTimeout(() => openSkipNotice(UUID), 200);
      return;
    }
  }

  let amountOfPreviousNotices = document.getElementsByClassName("sponsorSkipNotice").length;

  if (amountOfPreviousNotices > 0) {
    //already exists

    let previousNotice = document.getElementsByClassName("sponsorSkipNotice")[0];
    previousNotice.classList.add("secondSkipNotice")
  }

  let noticeElement = document.createElement("div");
  //what sponsor time this is about
  noticeElement.id = "sponsorSkipNotice" + UUID;
  noticeElement.classList.add("sponsorSkipObject");
  noticeElement.classList.add("sponsorSkipNotice");
  noticeElement.style.zIndex = 5 + amountOfPreviousNotices;

  let logoElement = document.createElement("img");
  logoElement.id = "sponsorSkipLogo" + UUID;
  logoElement.className = "sponsorSkipLogo";
  logoElement.src = chrome.extension.getURL("icons/LogoSponsorBlocker256px.png");

  let noticeMessage = document.createElement("div");
  noticeMessage.id = "sponsorSkipMessage" + UUID;
  noticeMessage.classList.add("sponsorSkipMessage");
  noticeMessage.classList.add("sponsorSkipObject");
  noticeMessage.innerText = "Hey, you just skipped a sponsor!";
  
  let noticeInfo = document.createElement("p");
  noticeInfo.id = "sponsorSkipInfo" + UUID;
  noticeInfo.classList.add("sponsorSkipInfo");
  noticeInfo.classList.add("sponsorSkipObject");
  noticeInfo.innerText = "This message will disapear in 7 seconds";
  
  //thumbs up and down buttons
  let voteButtonsContainer = document.createElement("div");
  voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
  voteButtonsContainer.setAttribute("align", "center");

  let upvoteButton = document.createElement("img");
  upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
  upvoteButton.className = "sponsorSkipObject voteButton";
  upvoteButton.src = chrome.extension.getURL("icons/upvote.png");
  upvoteButton.addEventListener("click", () => vote(1, UUID));

  let downvoteButton = document.createElement("img");
  downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
  downvoteButton.className = "sponsorSkipObject voteButton";
  downvoteButton.src = chrome.extension.getURL("icons/downvote.png");
  downvoteButton.addEventListener("click", () => vote(0, UUID));

  //add thumbs up and down buttons to the container
  voteButtonsContainer.appendChild(upvoteButton);
  voteButtonsContainer.appendChild(downvoteButton);

  let buttonContainer = document.createElement("div");
  buttonContainer.setAttribute("align", "center");

  let goBackButton = document.createElement("button");
  goBackButton.innerText = "Go back";
  goBackButton.className = "sponsorSkipButton";
  goBackButton.addEventListener("click", () => goBackToPreviousTime(UUID));

  let hideButton = document.createElement("button");
  hideButton.innerText = "Dismiss";
  hideButton.className = "sponsorSkipButton";
  hideButton.addEventListener("click", () => closeSkipNotice(UUID));

  let dontShowAgainButton = document.createElement("button");
  dontShowAgainButton.innerText = "Don't Show This Again";
  dontShowAgainButton.className = "sponsorSkipDontShowButton";
  dontShowAgainButton.addEventListener("click", dontShowNoticeAgain);

  buttonContainer.appendChild(goBackButton);
  buttonContainer.appendChild(hideButton);
  buttonContainer.appendChild(document.createElement("br"));
  buttonContainer.appendChild(document.createElement("br"));
  buttonContainer.appendChild(dontShowAgainButton);

  noticeElement.appendChild(logoElement);
  noticeElement.appendChild(noticeMessage);
  noticeElement.appendChild(noticeInfo);
  noticeElement.appendChild(voteButtonsContainer);
  noticeElement.appendChild(buttonContainer);

  let referenceNode = document.getElementById("info");
  if (referenceNode == null) {
    //old YouTube
    referenceNode = document.getElementById("watch-header");
  }
  referenceNode.prepend(noticeElement);
}

function afterDownvote(UUID) {
  //change text to say thanks for voting
  //remove buttons
  let upvoteButton = document.getElementById("sponsorTimesUpvoteButtonsContainer" + UUID);
  let downvoteButton = document.getElementById("sponsorTimesDownvoteButtonsContainer" + UUID);
  if (upvoteButton != null) {
    document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).removeChild(upvoteButton);
  }
  if (downvoteButton != null) {
    document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).removeChild(downvoteButton);
  }

  let previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + UUID);
  if (previousInfoMessage != null) {
    //remove it
    document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).removeChild(previousInfoMessage);
  }

  //add thanks for voting text
  let thanksForVotingText = document.createElement("p");
  thanksForVotingText.id = "sponsorTimesThanksForVotingText";
  thanksForVotingText.innerText = "Thanks for voting!"

  //add extra info for voting
  let thanksForVotingInfoText = document.createElement("p");
  thanksForVotingInfoText.id = "sponsorTimesThanksForVotingInfoText";
  thanksForVotingInfoText.innerText = "Hit go back to get to where you came from."

  //add element to div
  document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).appendChild(thanksForVotingText);
  document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).appendChild(thanksForVotingInfoText);
}

function addLoadingInfo(message, UUID) {
  //change text to say thanks for message
  //remove buttons
  let upvoteButton = document.getElementById("sponsorTimesUpvoteButtonsContainer" + UUID);
  let downvoteButton = document.getElementById("sponsorTimesDownvoteButtonsContainer" + UUID);
  if (upvoteButton != null) {
    document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).removeChild(upvoteButton);
  }
  if (downvoteButton != null) {
    document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).removeChild(downvoteButton);
  }

  let previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + UUID);
  if (previousInfoMessage != null) {
    //remove it
    document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).removeChild(previousInfoMessage);
  }

  //add thanks for voting text
  let thanksForVotingText = document.createElement("p");
  thanksForVotingText.id = "sponsorTimesInfoMessage" + UUID;
  thanksForVotingText.className = "sponsorTimesInfoMessage";
  thanksForVotingText.innerText = message;

  //add element to div
  document.getElementById("sponsorTimesVoteButtonsContainer" + UUID).appendChild(thanksForVotingText);
}

function vote(type, UUID) {
  //add loading info
  addLoadingInfo("Loading...", UUID)

  chrome.runtime.sendMessage({
    message: "submitVote",
    type: type,
    UUID: UUID
  }, function(response) {
    if (response != undefined) {
      //see if it was a success or failure
      if (response.successType == 1) {
        //success
        if (type == 0) {
          afterDownvote(UUID);
        } else if (type == 1) {
          closeSkipNotice(UUID);
        }
      } else if (response.successType == 0) {
        //failure: duplicate vote
        addLoadingInfo("It seems you've already voted before", UUID)
      } else if (response.successType == -1) {
        //failure: duplicate vote
        addLoadingInfo("A connection error has occured.", UUID)
      }
    }
  });
}

//Closes the notice that tells the user that a sponsor was just skipped for this UUID
function closeSkipNotice(UUID){
  let notice = document.getElementById("sponsorSkipNotice" + UUID);
  if (notice != null) {
    notice.remove();
  }
}

//Closes all notices that tell the user that a sponsor was just skipped
function closeAllSkipNotices(){
  let notices = document.getElementsByClassName("sponsorSkipNotice");
  for (let i = 0; i < notices.length; i++) {
    notices[i].remove();
  }
}

function dontShowNoticeAgain() {
  chrome.storage.sync.set({"dontShowNoticeAgain": true});

  dontShowNotice = true;

  closeAllSkipNotices();
}

function sponsorMessageStarted() {
    let v = document.querySelector('video');

    //send back current time
    chrome.runtime.sendMessage({
      message: "time",
      time: v.currentTime
    });

    //update button
    toggleStartSponsorButton();
}

function submitSponsorTimes() {
  if(!confirm("Are you sure you want to submit this?")) return;

  if (document.getElementById("submitButton").style.display == "none") {
    //don't submit, not ready
    return;
  }

  //add loading animation
  document.getElementById("submitButtonImage").src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker256px.png");
  document.getElementById("submitButton").style.animation = "rotate 1s 0s infinite";

  let currentVideoID = getYouTubeVideoID(document.URL);

  chrome.runtime.sendMessage({
    message: "submitTimes",
    videoID: currentVideoID
  }, function(response) {
    if (response != undefined) {
      if (response.statusCode == 200) {
        //hide loading message
        let submitButton = document.getElementById("submitButton");
        //finish this animation
        submitButton.style.animation = "rotate 1s";
        //when the animation is over, hide the button
        submitButton.addEventListener("animationend", function() {
          submitButton.style.animation = "unset";
          submitButton.style.display = "none";
        });

        //clear the sponsor times
        let sponsorTimeKey = "sponsorTimes" + currentVideoID;
        chrome.storage.sync.set({[sponsorTimeKey]: []});
      } else {
        //for a more detailed error message, they should check the popup
        //show that the upload failed
        document.getElementById("submitButton").style.animation = "unset";
        document.getElementById("submitButtonImage").src = chrome.extension.getURL("icons/PlayerUploadFailedIconSponsorBlocker256px.png");
      }
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

function sendRequestToCustomServer(type, fullAddress, callback) {
  let xmlhttp = new XMLHttpRequest();

  xmlhttp.open(type, fullAddress, true);

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

function getYouTubeVideoID(url) { // Returns with video id else returns false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}
