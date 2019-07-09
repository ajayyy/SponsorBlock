document.getElementById("sponsorStart").addEventListener("click", sendSponsorStartMessage);
document.getElementById("clearTimes").addEventListener("click", clearTimes);
document.getElementById("submitTimes").addEventListener("click", submitTimes);

//if true, the button now selects the end time
var startTimeChosen = false;

//the start and end time pairs (2d)
var videoTimes = [];

//current video ID of this tab
var currentVideoID = null;

//is this a YouTube tab?
var isYouTubeTab = false;

//if no response comes by this point, give up
setTimeout(function() {
  if (!isYouTubeTab) {
    document.getElementById("loadingIndicator").innerHTML = "This probably isn't a YouTube tab, or you clicked too early." +
      "If you know this is a YouTube tab, close this popup and open it again.";
  }
}, 100);

chrome.tabs.query({
  active: true,
  currentWindow: true
}, loadTabData);

function loadTabData(tabs) {
  //set current videoID
  currentVideoID = getYouTubeVideoID(tabs[0].url);

  //load video times for this video 
  let videoTimeKey = "videoTimes" + currentVideoID;
  chrome.storage.local.get([videoTimeKey], function(result) {
    videoTimes = result[videoTimeKey];
    if (videoTimes != undefined && result.videoTimes != []) {
      if (videoTimes[videoTimes.length - 1]!= undefined && videoTimes[videoTimes.length - 1].length < 2) {
        startTimeChosen = true;
      }

      displayVideoTimes();
    }
  });

  
  
  //check if this video's sponsors are known
  chrome.tabs.sendMessage(
    tabs[0].id,
    {from: 'popup', message: 'isInfoFound'},
    infoFound
  );
}

function infoFound(request) {
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

      displayDownloadedVideoTimes(request);
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
    let videoTimesIndex = videoTimes.length - (startTimeChosen ? 1 : 0);

    if (videoTimes[videoTimesIndex] == undefined) {
      videoTimes[videoTimesIndex] = [];
    }

    videoTimes[videoTimesIndex][startTimeChosen ? 1 : 0] = request.time;

    let videoTimeKey = "videoTimes" + currentVideoID;
    chrome.storage.local.set({[videoTimeKey]: videoTimes});

    //update startTimeChosen variable
    if (!startTimeChosen) {
      startTimeChosen = true;
      document.getElementById("sponsorStart").innerHTML = "Sponsorship Ends";
    } else {
      startTimeChosen = false;
      document.getElementById("sponsorStart").innerHTML = "Sponsorship Start";
    }

    //display video times on screen
    displayVideoTimes();
  }
});

//display the video times from the array
function displayVideoTimes() {
  //set it to the message
  document.getElementById("sponsorMessageTimes").innerHTML = getVideoTimesMessage(videoTimes);
}

//display the video times from the array at the top, in a different section
function displayDownloadedVideoTimes(request) {
  if (request.sponsorTimes != undefined) {
    //set it to the message
    document.getElementById("downloadedSponsorMessageTimes").innerHTML = getVideoTimesMessage(request.sponsorTimes);
  }
}

//get the message that visually displays the video times
function getVideoTimesMessage(sponsorTimes) {
  let sponsorTimesMessage = "";

  for (let i = 0; i < sponsorTimes.length; i++) {
    for (let s = 0; s < sponsorTimes[i].length; s++) {
      let timeMessage = sponsorTimes[i][s].toFixed(1) + "s";
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
  videoTimes = [];

  let videoTimeKey = "videoTimes" + currentVideoID;
  chrome.storage.local.set({[videoTimeKey]: videoTimes});

  displayVideoTimes();
}

function submitTimes() {
  chrome.runtime.sendMessage({
    message: "submitTimes",
    videoID: currentVideoID
  }, function(request) {
    clearTimes();
  });
}

function getYouTubeVideoID(url) { // Return video id or false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}