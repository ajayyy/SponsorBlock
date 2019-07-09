document.getElementById("sponsorStart").addEventListener("click", sendSponsorStartMessage);
document.getElementById("clearTimes").addEventListener("click", clearTimes);

//if true, the button now selects the end time
var startTimeChosen = false;

//the start and end time pairs (2d)
var videoTimes = [];
//load video times
chrome.storage.local.get(['videoTimes'], function(result) {
  if (result.videoTimes != undefined && result.videoTimes != []) {
    videoTimes = result.videoTimes;

    if (videoTimes[videoTimes.length - 1]!= undefined && videoTimes[videoTimes.length - 1].length < 2) {
      startTimeChosen = true;
    }

    displayVideoTimes();
  }
});

//check if this video's sponsors are known
chrome.tabs.query({
  active: true,
  currentWindow: true
}, tabs => {
  chrome.tabs.sendMessage(
    tabs[0].id,
    {from: 'popup', message: 'infoFound'},
    infoFound
  );
})

function infoFound(request) {
  if (request.found) {
    document.getElementById("videoFound").innerHTML = "This video's sponsors are in the database!"
  } else {
    document.getElementById("videoFound").innerHTML = "No sponsors found"
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
    let timeMessage = request.time.toFixed(2) + "s";

    let videoTimesIndex = videoTimes.length - (startTimeChosen ? 1 : 0);

    if (videoTimes[videoTimesIndex] == undefined) {
      videoTimes[videoTimesIndex] = [];
    }

    videoTimes[videoTimesIndex][startTimeChosen ? 1 : 0] = request.time;

    chrome.storage.local.set({"videoTimes": videoTimes});

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
  //make sure the div is empty first
  document.getElementById("sponsorMessageTimes").innerHTML = "";

  for (let i = 0; i < videoTimes.length; i++) {
    console.log(videoTimes)
    for (let s = 0; s < videoTimes[i].length; s++) {
      let timeMessage = videoTimes[i][s] + "s";
      //if this is an end time
      if (s == 1) {
        timeMessage = " to " + timeMessage;
      } else if (i > 0) {
        //add commas if necessary
        timeMessage = ", " + timeMessage;
      }

      document.getElementById("sponsorMessageTimes").innerHTML += timeMessage;
    }
  }
}

function clearTimes() {
  videoTimes = [];

  chrome.storage.local.set({"videoTimes": videoTimes});

  displayVideoTimes();
}