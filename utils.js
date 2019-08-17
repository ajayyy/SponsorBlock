// Function that can be used to wait for a condition before returning
async function wait(condition, timeout = 5000, check = 100) { 
  return await new Promise((resolve, reject) => {
    setTimeout(() => {reject("TIMEOUT")}, timeout);
    const interval = setInterval(() => {
      let result = condition();
      if (result !== false) {
        resolve(result);
        clearInterval(interval);
      };
    }, check);
  });
}

function getYouTubeVideoID_ALT() { // Content based VideoID parser (Requires DOM level access)
    let id;
    let index = 0;
    let p = document.location.pathname;
    if(!document.location.origin === "https://www.youtube.com") return false
    let title = document.getElementsByClassName("ytp-title-link");
    if(p.startsWith("/user/") || p.startsWith("/channel/") || p.startsWith("/embed/")) {
		if(title.length > 1) {
			index = (title[0].hasAttribute("href")) ? 0 : 1;
		}
		if(!title[index] || !title[index].hasAttribute("href")) return false
		id = title[index].href.split("?v=")[1];
    }
    return (id && id.length == 11) ? id : false;
}


function getYouTubeVideoID(url = document.URL) {
    let id = false;
    //Attempt to parse url
    let urlObject = null;
    try { 
        urlObject = new URL(url);
    } catch (e) {      
        console.error("[SB] Unable to parse URL: " + url);
        return false
    }
  
    //Check if valid hostname
    if(!["www.youtube.com","www.youtube-nocookie.com"].includes(urlObject.host)) return false; 
    
    //Get ID from searchParam
    if ((urlObject.pathname == "/watch" || urlObject.pathname == "/watch/") && urlObject.searchParams.has("v")) {
      id = urlObject.searchParams.get("v"); 
      return id.length == 11 ? id : false;
    } else if (urlObject.pathname.startsWith("/embed/")) {
      try {
        return urlObject.pathname.substr(7, 11);
      } catch (e) {
        console.error("[SB] Video ID not valid for " + url);
        return false;
      }
    }
	return false;
}


//returns the start time of the video if there was one specified (ex. ?t=5s)
function getYouTubeVideoStartTime(url = document.URL) {
  let searchParams = new URL(url).searchParams;
  let startTime = searchParams.get("t");
  if (startTime == null) {
    startTime = searchParams.get("time_continue");
  }

  return startTime;
}
