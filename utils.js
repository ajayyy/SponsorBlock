function getYouTubeVideoID(url) {
    // If no url provided guess its in a contentscript
    if (url === undefined) {
        // Diffrent way works on channel trailer and watch?v=
        let shere_url = document.getElementById("share-url");
        if (shere_url) {
            let id = shere_url.split(".be/")[1];
            if(id.length == 11) return id;
        }
        url = document.location; // Already parsed :D
    }
    urlBasedParser(url);
    }
}

function urlBasedParser(url) {
    //Attempt to parse url
    if(typeof url === 'string') {
        try {
            url = new URL(url);
        } catch (e) {      
            console.error("[SB] Unable to parse URL: " + url);
            return false
        }
    }
  
    //Check if valid hostname
    if(!["www.youtube.com","www.youtube-nocookie.com"].includes(url.host)) return false; 
    
    //Get ID from searchParam
    if ((url.pathname == "/watch" || url.pathname == "/watch/") && url.searchParams.has("v")) {
      id = url.searchParams.get("v"); 
      return id.length == 11 ? id : false;
    } else if (url.pathname.startsWith("/embed/")) {
      try {
        return url.pathname.substr(7, 11);
      } catch (e) {
        console.error("[SB] Video ID not valid for " + url);
        return false;
      }
    }
}

//returns the start time of the video if there was one specified (ex. ?t=5s)
function getYouTubeVideoStartTime(url) {
  let searchParams = new URL(url).searchParams;
  let startTime = searchParams.get("t");
  if (startTime == null) {
    startTime = searchParams.get("time_continue");
  }

  return startTime;
}
