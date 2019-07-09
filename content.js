if(id = getYouTubeVideoID(document.URL)){ // Direct Links
  sponsorsLookup(id);
}

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;

//the video
var v;

//the last time looked at (used to see if this time is in the interval)
var lastTime;

chrome.runtime.onMessage.addListener( // Detect URL Changes
  function(request, sender, sendResponse) {
    if (request.message === 'ytvideoid') { // Message from background script
        sponsorsLookup(request.id);
    }

    //messages from popup script
    if (request.message === 'sponsorStart') {
      sponsorMessageStarted();
    }

    if (request.message === 'isInfoFound') {
      sendResponse({
        found: sponsorDataFound
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
        }

        lastTime = v.currentTime;
    });
}

function getYouTubeVideoID(url) { // Returns with video id else returns false
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
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