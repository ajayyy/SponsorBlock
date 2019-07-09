if(id = getYouTubeVideoID(document.URL)){ // Direct Links
  sponsorsLookup(id);
}

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;


chrome.runtime.onMessage.addListener( // Detect URL Changes
  function(request, sender, sendResponse) {
    if (request.message === 'ytvideoid') { // Message from background script
        sponsorsLookup(request.id);
    }

    //messages from popup script
    if (request.message === 'sponsorStart') {
      sponsorMessageStarted();
    }

    if (request.message === 'infoFound') {
      sendResponse({
        found: sponsorDataFound
      })
    }
});

function sponsorsLookup(id) {
    v = document.querySelector('video') // Youtube video player
    var xmlhttp = new XMLHttpRequest();
    
    //check database for sponsor times
    xmlhttp.open('GET', 'http://localhost/api/getVideoSponsorTimes?videoID=' + id, true);

    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            sponsorDataFound = true;

            sponsors = JSON.parse(xmlhttp.responseText);

            // If the sponsor data exists, add the event to run on the videos "ontimeupdate"
            v.ontimeupdate = function () { 
                sponsorCheck(sponsors);
            };
        }
    };
    xmlhttp.send(null);
}

function sponsorCheck(sponsors) { // Video skipping
    sponsors.forEach(function (el, index) { // Foreach Sponsor in video
        if ((Math.floor(v.currentTime)) == el[0]) { // Check time has sponsor
            v.currentTime = el[1]; // Set new time
        }
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