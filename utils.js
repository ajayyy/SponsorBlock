// Function that can be used to wait for a condition before returning
async function wait(condition, timeout = 5000, check = 100) { 
    return await new Promise((resolve, reject) => {
        setTimeout(() => reject("TIMEOUT"), timeout);

        let intervalCheck = () => {
            let result = condition();
            if (result !== false) {
                resolve(result);
                clearInterval(interval);
            };
        };

        let interval = setInterval(intervalCheck, check);
        
        //run the check once first, this speeds it up a lot
        intervalCheck();
    });
}

// Contains both getYouTubeVideoID functions
async function getYouTubeVideoIDAsync() {
    let id = false;

    id = getYouTubeVideoID();
    if(id) return id;

    let id = await wait(getYouTubeVideoID_ALT);

    return id;
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
        
        if(!title[index] || !title[index].hasAttribute("href")) return false;
        
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
    var objects = document.getElementsByClassName("popupBody")[0].children;
    for (var j = 0; j < objects.length; j++) {
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
