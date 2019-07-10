if(id = getYouTubeVideoID(document.URL)){ // Direct Links
  //reset sponsor data found check
  sponsorDataFound = false;
  sponsorsLookup(id);

  //tell background.js about this
  chrome.runtime.sendMessage({
    message: "ytvideoid",
    videoID: id
  });
}

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;

//the actual sponsorTimes if loaded
var sponsorTimes = undefined;

//the video
var v;

//the last time looked at (used to see if this time is in the interval)
var lastTime;

//the last time in the video a sponsor was skipped
//used for the go back button
var lastSponsorTimeSkipped = null;

chrome.runtime.onMessage.addListener( // Detect URL Changes
  function(request, sender, sendResponse) {
    //message from background script
    if (request.message === 'ytvideoid') { 
      //reset sponsor data found check
      sponsorDataFound = false;
      sponsorsLookup(request.id);
    }

    //messages from popup script
    if (request.message === 'sponsorStart') {
      sponsorMessageStarted();
    }

    if (request.message === 'isInfoFound') {
      //send the sponsor times along with if it's found
      sendResponse({
        found: sponsorDataFound,
        sponsorTimes: sponsorTimes
      })
    }

    if (request.message === 'getVideoID') {
      sendResponse({
        videoID: getYouTubeVideoID(document.URL)
      })
    }
});

function sponsorsLookup(id) {
    v = document.querySelector('video') // Youtube video player
    let xmlhttp = new XMLHttpRequest();
    
    //check database for sponsor times
    xmlhttp.open('GET', 'http://localhost/api/getVideoSponsorTimes?videoID=' + id, true);

    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
          sponsorDataFound = true;

          sponsorTimes = JSON.parse(xmlhttp.responseText).sponsorTimes;

          // If the sponsor data exists, add the event to run on the videos "ontimeupdate"
          v.ontimeupdate = function () { 
              sponsorCheck(sponsorTimes);
          };
        } else {
          sponsorDataFound = false;
        }
    };
    xmlhttp.send(null);
}

function sponsorCheck(sponsorTimes) { // Video skipping
    //see if any sponsor start time was just passed
    sponsorTimes.forEach(function (sponsorTime, index) { // Foreach Sponsor in video
        //the sponsor time is in between these times, skip it
        //if the time difference is more than 1 second, than the there was probably a skip in time, 
        //  and it's not due to playback
        if (Math.abs(v.currentTime - lastTime) < 1 && sponsorTime[0] >= lastTime && sponsorTime[0] <= v.currentTime) {
          //skip it
          v.currentTime = sponsorTime[1];

          lastSponsorTimeSkipped = sponsorTime[0];

          //send out the message saying that a sponsor message was skipped
          openSkipNotice();

          setTimeout(closeSkipNotice, 2500);
        }

        lastTime = v.currentTime;
    });
}

function goBackToPreviousTime() {
  if (lastSponsorTimeSkipped != null) {
    //add a tiny bit of time to make sure it is not skipped again
    v.currentTime = lastSponsorTimeSkipped + 0.001;

    closeSkipNotice();
  }
}

//Opens the notice that tells the user that a sponsor was just skipped
function openSkipNotice(){
  var noticeElement = document.createElement("div");
  
  noticeElement.id = 'sponsorSkipNotice'
  noticeElement.style.minHeight = "75px";
  noticeElement.style.minWidth = "400px";
  noticeElement.style.backgroundColor = "rgba(153, 153, 153, 0.8)";
  noticeElement.style.fontSize = "24px";
  noticeElement.style.position = "absolute"
  noticeElement.style.zIndex = "1";

	var noticeMessage = document.createElement("p");
	noticeMessage.innerText = "Hey, you just skipped a sponsor!";
  noticeMessage.style.fontSize = "18px";
  noticeMessage.style.color = "#000000";
  noticeMessage.style.textAlign = "center";
  noticeMessage.style.marginTop = "10px";

  var buttonContainer = document.createElement("div");
  buttonContainer.setAttribute("align", "center");

  var goBackButton = document.createElement("button");
	goBackButton.innerText = "Go back";
  goBackButton.style.fontSize = "13px";
  goBackButton.style.color = "#000000";
  goBackButton.setAttribute("align", "center");
  goBackButton.style.marginTop = "5px";
  goBackButton.addEventListener("click", goBackToPreviousTime);

  buttonContainer.appendChild(goBackButton);

  noticeElement.appendChild(noticeMessage);
  noticeElement.appendChild(buttonContainer);

  var referenceNode = document.getElementById("info");
  if (referenceNode == null) {
    //old YouTube
    referenceNode = document.getElementById("watch-header");
  }
  referenceNode.prepend(noticeElement);
}

//Closes the notice that tells the user that a sponsor was just skipped
function closeSkipNotice(){
  let notice = document.getElementById("sponsorSkipNotice");
  if (notice != null) {
    notice.remove();
  }
}

function sponsorMessageStarted() {
    let v = document.querySelector('video');

    console.log(v.currentTime)

    //send back current time
    chrome.runtime.sendMessage({
      message: "time",
      time: v.currentTime
    });
}

function getYouTubeVideoID(url) { // Returns with video id else returns false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}