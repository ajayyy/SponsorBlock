//setup click listeners
document.getElementById("sponsorStart").addEventListener("click", sendSponsorStartMessage);
document.getElementById("clearTimes").addEventListener("click", clearTimes);
document.getElementById("submitTimes").addEventListener("click", submitTimes);
document.getElementById("showNoticeAgain").addEventListener("click", showNoticeAgain);
document.getElementById("hideVideoPlayerControls").addEventListener("click", hideVideoPlayerControls);
document.getElementById("showVideoPlayerControls").addEventListener("click", showVideoPlayerControls);
document.getElementById("optionsButton").addEventListener("click", openOptions);

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
chrome.storage.local.get(["dontShowNoticeAgain"], function(result) {
  let dontShowNoticeAgain = result.dontShowNoticeAgain;
  if (dontShowNoticeAgain != undefined && dontShowNoticeAgain) {
    document.getElementById("showNoticeAgain").style.display = "unset";
  }
});

//show proper video player controls option
chrome.storage.local.get(["hideVideoPlayerControls"], function(result) {
  let hideVideoPlayerControls = result.hideVideoPlayerControls;
  if (hideVideoPlayerControls != undefined && hideVideoPlayerControls) {
    document.getElementById("hideVideoPlayerControls").style.display = "none";
    document.getElementById("showVideoPlayerControls").style.display = "unset";
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
  chrome.storage.local.get([sponsorTimeKey], function(result) {
    let sponsorTimesStorage = result[sponsorTimeKey];
    if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
      if (sponsorTimesStorage[sponsorTimesStorage.length - 1] != undefined && sponsorTimesStorage[sponsorTimesStorage.length - 1].length < 2) {
        startTimeChosen = true;
        document.getElementById("sponsorStart").innerHTML = "Sponsorship Ends Now";
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
    chrome.storage.local.set({[sponsorTimeKey]: sponsorTimes});

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
  //check if the player controls should be toggled
  if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "toggleStartSponsorButton"
      });
    });
  }

  //reset sponsorTimes
  sponsorTimes = [];

  let sponsorTimeKey = "sponsorTimes" + currentVideoID;
  chrome.storage.local.set({[sponsorTimeKey]: sponsorTimes});

  displaySponsorTimes();

  //hide submission section
  document.getElementById("submissionSection").style.display = "none";

  resetStartTimeChosen();
}

function submitTimes() {
  if (sponsorTimes.length > 0) {
    chrome.runtime.sendMessage({
      message: "submitTimes",
      videoID: currentVideoID
    }, function(request) {
      clearTimes();
    });
  }
}

function showNoticeAgain() {
  chrome.storage.local.set({"dontShowNoticeAgain": false});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "showNoticeAgain"
    });
  });

  document.getElementById("showNoticeAgain").style.display = "none";
}

function hideVideoPlayerControls() {
  chrome.storage.local.set({"hideVideoPlayerControls": true});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "changeVideoPlayerControlsVisibility",
      value: true
    });
  });

  document.getElementById("hideVideoPlayerControls").style.display = "none";
  document.getElementById("showVideoPlayerControls").style.display = "unset";
}

function showVideoPlayerControls() {
  chrome.storage.local.set({"hideVideoPlayerControls": false});

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      message: "changeVideoPlayerControlsVisibility",
      value: false
    });
  });

  document.getElementById("hideVideoPlayerControls").style.display = "unset";
  document.getElementById("showVideoPlayerControls").style.display = "none";
}

function updateStartTimeChosen() {
  //update startTimeChosen variable
  if (!startTimeChosen) {
    startTimeChosen = true;
  document.getElementById("sponsorStart").innerHTML = "Sponsorship Ends Now";
  } else {
    resetStartTimeChosen();
  }
}

//set it to false
function resetStartTimeChosen() {
  startTimeChosen = false;
  document.getElementById("sponsorStart").innerHTML = "Sponsorship Starts Now";
}

function showSubmitTimesIfNecessary() {
  //check if an end time has been specified for the latest sponsor time
  if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length > 1) {
    //show submit times button
    document.getElementById("submitTimes").style.display = "unset";
  } else {
    document.getElementById("submitTimes").style.display = "none";
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

function getYouTubeVideoID(url) { // Return video id or false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}