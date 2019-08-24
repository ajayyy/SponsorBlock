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

function getYouTubeVideoID(url) {
    //Attempt to parse url
    let urlObject = null;
    try { 
        urlObject = new URL(url);
    } catch (e) {      
        console.error("[SB] Unable to parse URL: " + url);
        return false;
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

function localizeHtmlPage() {
    //Localize by replacing __MSG_***__ meta tags
    var objects = document.getElementsByTagName('html');
    for (var j = 0; j < objects.length; j++)
    {
        var obj = objects[j];

        var valStrH = obj.innerHTML.toString();
        var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1)
        {
            return v1 ? chrome.i18n.getMessage(v1) : "";
        });

        if(valNewH != valStrH)
        {
            obj.innerHTML = valNewH;
        }
    }
}
