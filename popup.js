
//make this a function to allow this to run on the content page
function runThePopup() {

  //is it in the popup or content script
  var inPopup = true;
  if (chrome.tabs == undefined) {
      //this is on the content script, use direct communication
      chrome.tabs = {};
      chrome.tabs.sendMessage = function(id, request, callback) {
          messageListener(request, null, callback);
      }
  
      //add a dummy query method
      chrome.tabs.query = function(config, callback) {
          callback([{
              url: document.URL,
              id: -1
          }]);
      }
  
      inPopup = false;
  }
  
  var SB = {};

  ["sponsorStart",
  "whitelistChannel",
  "unwhitelistChannel",
  "clearTimes",
  "submitTimes",
  "showNoticeAgain",
  "hideVideoPlayerControls",
  "showVideoPlayerControls",
  "hideInfoButtonPlayerControls",
  "showInfoButtonPlayerControls",
  "hideDeleteButtonPlayerControls",
  "showDeleteButtonPlayerControls",
  "disableSponsorViewTracking",
  "enableSponsorViewTracking",
  "optionsButton",
  "reportAnIssue",
  // sponsorTimesContributions
  "sponsorTimesContributionsContainer",
  "sponsorTimesContributionsDisplay",
  "sponsorTimesContributionsDisplayEndWord",
  // sponsorTimesViewsDisplay
  "sponsorTimesViewsContainer",
  "sponsorTimesViewsDisplay",
  "sponsorTimesViewsDisplayEndWord",
  // discordButtons
  "discordButtonContainer",
  "hideDiscordButton",
  // submitTimesInfoMessage
  "submitTimesInfoMessageContainer",
  "submitTimesInfoMessage",
  // More
  "submissionSection",
  "mainControls",
  "loadingIndicator",
  "videoFound",
  "sponsorMessageTimes",
  "downloadedSponsorMessageTimes",
  ].forEach(id => SB[id] = document.getElementById(id));

  //setup click listeners
  SB.sponsorStart.addEventListener("click", sendSponsorStartMessage);
  SB.whitelistChannel.addEventListener("click", whitelistChannel);
  SB.unwhitelistChannel.addEventListener("click", unwhitelistChannel);
  SB.clearTimes.addEventListener("click", clearTimes);
  SB.submitTimes.addEventListener("click", submitTimes);
  SB.showNoticeAgain.addEventListener("click", showNoticeAgain);
  SB.hideVideoPlayerControls.addEventListener("click", hideVideoPlayerControls);
  SB.showVideoPlayerControls.addEventListener("click", showVideoPlayerControls);
  SB.hideInfoButtonPlayerControls.addEventListener("click", hideInfoButtonPlayerControls);
  SB.showInfoButtonPlayerControls.addEventListener("click", showInfoButtonPlayerControls);
  SB.hideDeleteButtonPlayerControls.addEventListener("click", hideDeleteButtonPlayerControls);
  SB.showDeleteButtonPlayerControls.addEventListener("click", showDeleteButtonPlayerControls);
  SB.disableSponsorViewTracking.addEventListener("click", disableSponsorViewTracking);
  SB.enableSponsorViewTracking.addEventListener("click", enableSponsorViewTracking);
  SB.optionsButton.addEventListener("click", openOptions);
  SB.reportAnIssue.addEventListener("click", reportAnIssue);
  SB.hideDiscordButton.addEventListener("click", hideDiscordButton);
  
  //setup error message languages
  var EN_US = new Map();

  EN_US.set(400, 'Server said this request was invalid"')
     .set(429, 'You have submitted too many sponsor times for this one video, are you sure there are this many?')
     .set(409, 'This has already been submitted before')
     .set(502, 'It seems the server is down. Contact the dev to inform them.')
     .set('Unknown', 'There was an error submitting your sponsor times, please try again later.');

  //if true, the button now selects the end time
  let startTimeChosen = false;
  
  //the start and end time pairs (2d)
  let sponsorTimes = [];
  
  //current video ID of this tab
  let currentVideoID = null;
  
  //is this a YouTube tab?
  let isYouTubeTab = false;
  
  //see if discord link can be shown
  chrome.storage.sync.get(["hideDiscordLink"], function(result) {
    let hideDiscordLink = result.hideDiscordLink;
    if (hideDiscordLink == undefined || !hideDiscordLink) {
      chrome.storage.sync.get(["hideDiscordLaunches"], function(result) {
        let hideDiscordLaunches = result.hideDiscordLaunches;
        //only if less than 5 launches
        if (hideDiscordLaunches == undefined || hideDiscordLaunches < 10) {
          SB.discordButtonContainer.style.display = null;
          
          if (hideDiscordLaunches == undefined) {
            hideDiscordButton = 1;
          }
  
          chrome.storage.sync.set({"hideDiscordLaunches": hideDiscordButton + 1});
        }
      });
    }
  });

  //see if whitelist button should be swapped
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      {message: 'isChannelWhitelisted'},
      function(response) {
        if (response.value) {
          SB.whitelistChannel.style.display = "none";
          SB.unwhitelistChannel.style.display = "unset";

          SB.downloadedSponsorMessageTimes.innerText = "Channel Whitelisted!";
          SB.downloadedSponsorMessageTimes.style.fontWeight = "bold";
        }
      });
    }
  );
  
  //if the don't show notice again letiable is true, an option to 
  //  disable should be available
  chrome.storage.sync.get(["dontShowNoticeAgain"], function(result) {
    let dontShowNoticeAgain = result.dontShowNoticeAgain;
    if (dontShowNoticeAgain != undefined && dontShowNoticeAgain) {
      SB.showNoticeAgain.style.display = "unset";
    }
  });
  
  //show proper video player controls options
  chrome.storage.sync.get(["hideVideoPlayerControls"], function(result) {
    let hideVideoPlayerControls = result.hideVideoPlayerControls;
    if (hideVideoPlayerControls != undefined && hideVideoPlayerControls) {
      SB.hideVideoPlayerControls.style.display = "none";
      SB.showVideoPlayerControls.style.display = "unset";
    }
  });
  chrome.storage.sync.get(["hideInfoButtonPlayerControls"], function(result) {
    let hideInfoButtonPlayerControls = result.hideInfoButtonPlayerControls;
    if (hideInfoButtonPlayerControls != undefined && hideInfoButtonPlayerControls) {
      SB.hideInfoButtonPlayerControls.style.display = "none";
      SB.showInfoButtonPlayerControls.style.display = "unset";
    }
  });
  chrome.storage.sync.get(["hideDeleteButtonPlayerControls"], function(result) {
    let hideDeleteButtonPlayerControls = result.hideDeleteButtonPlayerControls;
    if (hideDeleteButtonPlayerControls != undefined && hideDeleteButtonPlayerControls) {
      SB.hideDeleteButtonPlayerControls.style.display = "none";
      SB.showDeleteButtonPlayerControls.style.display = "unset";
    }
  });
  
  //show proper tracking option
  chrome.storage.sync.get(["trackViewCount"], function(result) {
    let trackViewCount = result.trackViewCount;
    if (trackViewCount != undefined && !trackViewCount) {
      SB.disableSponsorViewTracking.style.display = "none";
      SB.enableSponsorViewTracking.style.display = "unset";
    }
  });
  
  //get the amount of times this user has contributed and display it to thank them
  chrome.storage.sync.get(["sponsorTimesContributed"], function(result) {
    if (result.sponsorTimesContributed != undefined) {
      if (result.sponsorTimesContributed > 1) {
        SB.sponsorTimesContributionsDisplayEndWord.innerText = "sponsors."
      } else {
        SB.sponsorTimesContributionsDisplayEndWord.innerText = "sponsor."
      }
      SB.sponsorTimesContributionsDisplay.innerText = result.sponsorTimesContributed;
      SB.sponsorTimesContributionsContainer.style.display = "unset";
  
      //get the userID
      chrome.storage.sync.get(["userID"], function(result) {
        let userID = result.userID;
        if (userID != undefined) {
          //there are probably some views on these submissions then
          //get the amount of views from the sponsors submitted
          sendRequestToServer("GET", "/api/getViewsForUser?userID=" + userID, function(xmlhttp) {
            if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
              let viewCount = JSON.parse(xmlhttp.responseText).viewCount;
              if (viewCount != 0) {
                if (viewCount > 1) {
                  SB.sponsorTimesViewsDisplayEndWord.innerText = "sponsor segments."
                } else {
                  SB.sponsorTimesViewsDisplayEndWord.innerText = "sponsor segment."
                }

                SB.sponsorTimesViewsDisplay.innerText = viewCount;
                SB.sponsorTimesViewsContainer.style.display = "unset";
              }
            }
          });
        }
      });
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
    chrome.storage.sync.get([sponsorTimeKey], function(result) {
      let sponsorTimesStorage = result[sponsorTimeKey];
      if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
        if (sponsorTimesStorage[sponsorTimesStorage.length - 1] != undefined && sponsorTimesStorage[sponsorTimesStorage.length - 1].length < 2) {
          startTimeChosen = true;
          SB.sponsorStart.innerHTML = "Sponsorship Ends Now";
        }
  
        sponsorTimes = sponsorTimesStorage;
  
        displaySponsorTimes();
  
        //show submission section
        SB.submissionSection.style.display = "unset";
  
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
      //set letiable
      isYouTubeTab = true;
  
      //remove loading text
      SB.mainControls.style.display = "unset"
      SB.loadingIndicator.innerHTML = "";

      if (request.found) {
        SB.videoFound.innerHTML = "This video's sponsors are in the database!"

        displayDownloadedSponsorTimes(request);
      } else {
        SB.videoFound.innerHTML = "No sponsors found"
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
          {from: 'popup', message: 'sponsorStart'},
          startSponsorCallback
        );
      });
  }
  
  function startSponsorCallback(response) {
    let sponsorTimesIndex = sponsorTimes.length - (startTimeChosen ? 1 : 0);
  
    if (sponsorTimes[sponsorTimesIndex] == undefined) {
      sponsorTimes[sponsorTimesIndex] = [];
    }
  
    sponsorTimes[sponsorTimesIndex][startTimeChosen ? 1 : 0] = response.time;
  
    let sponsorTimeKey = "sponsorTimes" + currentVideoID;
    let localStartTimeChosen = startTimeChosen;
    chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes}, function() {
      //send a message to the client script
      if (localStartTimeChosen) {
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, tabs => {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {message: "sponsorDataChanged"}
          );
        });
      }
    });
  
    updateStartTimeChosen();
  
    //display video times on screen
    displaySponsorTimes();
  
    //show submission section
    SB.submissionSection.style.display = "unset";
  
    showSubmitTimesIfNecessary();
  }
  
  //display the video times from the array
  function displaySponsorTimes() {
    //remove all children
    while (SB.sponsorMessageTimes.firstChild) {
      SB.sponsorMessageTimes.removeChild(SB.sponsorMessageTimes.firstChild);
    }

    //add sponsor times
    SB.sponsorMessageTimes.appendChild(getSponsorTimesMessageDiv(sponsorTimes));
  }
  
  //display the video times from the array at the top, in a different section
  function displayDownloadedSponsorTimes(request) {
    if (request.sponsorTimes != undefined) {
      //set it to the message
      if (SB.downloadedSponsorMessageTimes.innerText != "Channel Whitelisted!") {
        SB.downloadedSponsorMessageTimes.innerText = getSponsorTimesMessage(request.sponsorTimes);
      }

      //add them as buttons to the issue reporting container
      let container = document.getElementById("issueReporterTimeButtons");
      for (let i = 0; i < request.sponsorTimes.length; i++) {
        let sponsorTimeButton = document.createElement("button");
        sponsorTimeButton.className = "warningButton popupElement";
        sponsorTimeButton.innerText = getFormattedTime(request.sponsorTimes[i][0]) + " to " + getFormattedTime(request.sponsorTimes[i][1]);
        
        let votingButtons = document.createElement("div");
  
        let UUID = request.UUIDs[i];
  
        //thumbs up and down buttons
        let voteButtonsContainer = document.createElement("div");
        voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
        voteButtonsContainer.setAttribute("align", "center");
        voteButtonsContainer.style.display = "none"
  
        let upvoteButton = document.createElement("img");
        upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
        upvoteButton.className = "voteButton popupElement";
        upvoteButton.src = chrome.extension.getURL("icons/upvote.png");
        upvoteButton.addEventListener("click", () => vote(1, UUID));
  
        let downvoteButton = document.createElement("img");
        downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
        downvoteButton.className = "voteButton popupElement";
        downvoteButton.src = chrome.extension.getURL("icons/downvote.png");
        downvoteButton.addEventListener("click", () => vote(0, UUID));
  
        //add thumbs up and down buttons to the container
        voteButtonsContainer.appendChild(document.createElement("br"));
        voteButtonsContainer.appendChild(document.createElement("br"));
        voteButtonsContainer.appendChild(upvoteButton);
        voteButtonsContainer.appendChild(downvoteButton);
  
        //add click listener to open up vote panel
        sponsorTimeButton.addEventListener("click", function() {
          voteButtonsContainer.style.display = "unset";
        });
  
        container.appendChild(sponsorTimeButton);
        container.appendChild(voteButtonsContainer);
  
        //if it is not the last iteration
        if (i != request.sponsorTimes.length - 1) {
          container.appendChild(document.createElement("br"));
          container.appendChild(document.createElement("br"));
        }
      }
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
  
  //get the message that visually displays the video times
  //this version is a div that contains each with delete buttons
  function getSponsorTimesMessageDiv(sponsorTimes) {
    // let sponsorTimesMessage = "";
    let sponsorTimesContainer = document.createElement("div");
    sponsorTimesContainer.id = "sponsorTimesContainer";
  
    for (let i = 0; i < sponsorTimes.length; i++) {
      let currentSponsorTimeContainer = document.createElement("div");
      currentSponsorTimeContainer.id = "sponsorTimeContainer" + i;
      currentSponsorTimeContainer.className = "sponsorTime popupElement";
      let currentSponsorTimeMessage = "";
  
      let deleteButton = document.createElement("span");
      deleteButton.id = "sponsorTimeDeleteButton" + i;
      deleteButton.innerText = "Delete";
      deleteButton.className = "mediumLink popupElement";
      let index = i;
      deleteButton.addEventListener("click", () => deleteSponsorTime(index));
  
      let spacer = document.createElement("span");
      spacer.innerText = " ";
  
      let editButton = document.createElement("span");
      editButton.id = "sponsorTimeEditButton" + i;
      editButton.innerText = "Edit";
      editButton.className = "mediumLink popupElement";
      editButton.addEventListener("click", () => editSponsorTime(index));
  
      for (let s = 0; s < sponsorTimes[i].length; s++) {
        let timeMessage = getFormattedTime(sponsorTimes[i][s]);
        //if this is an end time
        if (s == 1) {
          timeMessage = " to " + timeMessage;
        } else if (i > 0) {
          //add commas if necessary
          timeMessage = timeMessage;
        }
  
        currentSponsorTimeMessage += timeMessage;
      }
  
      currentSponsorTimeContainer.innerText = currentSponsorTimeMessage;
      currentSponsorTimeContainer.addEventListener("click", () => editSponsorTime(index));
  
      sponsorTimesContainer.appendChild(currentSponsorTimeContainer);
      sponsorTimesContainer.appendChild(deleteButton);
  
      //only if it is a complete sponsor time
      if (sponsorTimes[i].length > 1) {
        sponsorTimesContainer.appendChild(editButton);
      }
    }
  
    return sponsorTimesContainer;
  }
  
  function editSponsorTime(index) {
    if (document.getElementById("startTimeMinutes" + index) != null) {
      //already open
      return;
    }

    //hide submit button
    document.getElementById("submitTimesContainer").style.display = "none";
  
    let sponsorTimeContainer = document.getElementById("sponsorTimeContainer" + index);
  
    //get sponsor time minutes and seconds boxes
    let startTimeMinutes = document.createElement("input");
    startTimeMinutes.id = "startTimeMinutes" + index;
    startTimeMinutes.className = "sponsorTime popupElement";
    startTimeMinutes.type = "text";
    startTimeMinutes.value = getTimeInMinutes(sponsorTimes[index][0]);
    startTimeMinutes.style.width = "45px";
    
    let startTimeSeconds = document.createElement("input");
    startTimeSeconds.id = "startTimeSeconds" + index;
    startTimeSeconds.className = "sponsorTime popupElement";
    startTimeSeconds.type = "text";
    startTimeSeconds.value = getTimeInFormattedSeconds(sponsorTimes[index][0]);
    startTimeSeconds.style.width = "60px";
  
    let endTimeMinutes = document.createElement("input");
    endTimeMinutes.id = "endTimeMinutes" + index;
    endTimeMinutes.className = "sponsorTime popupElement";
    endTimeMinutes.type = "text";
    endTimeMinutes.value = getTimeInMinutes(sponsorTimes[index][1]);
    endTimeMinutes.style.width = "45px";
    
    let endTimeSeconds = document.createElement("input");
    endTimeSeconds.id = "endTimeSeconds" + index;
    endTimeSeconds.className = "sponsorTime popupElement";
    endTimeSeconds.type = "text";
    endTimeSeconds.value = getTimeInFormattedSeconds(sponsorTimes[index][1]);
    endTimeSeconds.style.width = "60px";
  
    let colonText = document.createElement("span");
    colonText.innerText = ":";
  
    let toText = document.createElement("span");
    toText.innerText = " to ";
  
    //remove all children to replace
    while (sponsorTimeContainer.firstChild) {
      sponsorTimeContainer.removeChild(sponsorTimeContainer.firstChild);
    }
  
    sponsorTimeContainer.appendChild(startTimeMinutes);
    sponsorTimeContainer.appendChild(colonText);
    sponsorTimeContainer.appendChild(startTimeSeconds);
    sponsorTimeContainer.appendChild(toText);
    sponsorTimeContainer.appendChild(endTimeMinutes);
    sponsorTimeContainer.appendChild(colonText);
    sponsorTimeContainer.appendChild(endTimeSeconds);
  
    //add save button and remove edit button
    let saveButton = document.createElement("span");
    saveButton.id = "sponsorTimeSaveButton" + index;
    saveButton.innerText = "Save";
    saveButton.className = "mediumLink popupElement";
    saveButton.addEventListener("click", () => saveSponsorTimeEdit(index));
  
    let editButton = document.getElementById("sponsorTimeEditButton" + index);
    let sponsorTimesContainer = document.getElementById("sponsorTimesContainer");
  
    sponsorTimesContainer.replaceChild(saveButton, editButton);
  }
  
  function saveSponsorTimeEdit(index) {
    let startTimeMinutes = document.getElementById("startTimeMinutes" + index);
    let startTimeSeconds = document.getElementById("startTimeSeconds" + index);
  
    let endTimeMinutes = document.getElementById("endTimeMinutes" + index);
    let endTimeSeconds = document.getElementById("endTimeSeconds" + index);
  
    sponsorTimes[index][0] = parseInt(startTimeMinutes.value) * 60 + parseFloat(startTimeSeconds.value);
    sponsorTimes[index][1] = parseInt(endTimeMinutes.value) * 60 + parseFloat(endTimeSeconds.value);
  
    //save this
    let sponsorTimeKey = "sponsorTimes" + currentVideoID;
    chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes}, function() {
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, tabs => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {message: "sponsorDataChanged"}
        );
      });
    });
  
    displaySponsorTimes();

    showSubmitTimesIfNecessary();
  }
  
  //deletes the sponsor time submitted at an index
  function deleteSponsorTime(index) {
    //if it is not a complete sponsor time
    if (sponsorTimes[index].length < 2) {
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          message: "changeStartSponsorButton",
          showStartSponsor: true,
          uploadButtonVisible: false
        });
      });
  
      resetStartTimeChosen();
    }
  
    sponsorTimes.splice(index, 1);
  
    //save this
    let sponsorTimeKey = "sponsorTimes" + currentVideoID;
    chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes}, function() {
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, tabs => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {message: "sponsorDataChanged"}
        );
      });
    });
  
    //update display
    displaySponsorTimes();
  
    //if they are all removed
    if (sponsorTimes.length == 0) {
      //update chrome tab
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          message: "changeStartSponsorButton",
          showStartSponsor: true,
          uploadButtonVisible: false
        });
      });
  
      //hide submission section
      document.getElementById("submissionSection").style.display = "none";
    }
  }
  
  function clearTimes() {
    //send new sponsor time state to tab
    if (sponsorTimes.length > 0) {
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          message: "changeStartSponsorButton",
          showStartSponsor: true,
          uploadButtonVisible: false
        });
      });
    }
  
    //reset sponsorTimes
    sponsorTimes = [];
  
    let sponsorTimeKey = "sponsorTimes" + currentVideoID;
    chrome.storage.sync.set({[sponsorTimeKey]: sponsorTimes}, function() {
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, tabs => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {message: "sponsorDataChanged"}
        );
      });
    });
  
    displaySponsorTimes();
  
    //hide submission section
    document.getElementById("submissionSection").style.display = "none";
  
    resetStartTimeChosen();
  }
  
  function getErrorMessage(lang, statusCode) {
    if(lang.has(statusCode)) return lang.get(statusCode);
    return lang.get('Unknown').concat(" Error code: ") + statusCode;
  } 

  function submitTimes() {
    //make info message say loading
    SB.submitTimesInfoMessage.innerText = "Loading...";
    SB.submitTimesInfoMessageContainer.style.display = "unset";
  
    if (sponsorTimes.length > 0) {
      chrome.runtime.sendMessage({
        message: "submitTimes",
        videoID: currentVideoID
      }, function(response) {
        if (response != undefined) {
          if (response.statusCode == 200) {
            //hide loading message
            SB.submitTimesInfoMessageContainer.style.display = "none";

            clearTimes();
          } else {
            let errorMessage = getErrorMessage(EN_US, response.statusCode);

            document.getElementById("submitTimesInfoMessage").innerText = errorMessage;
            document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";

            SB.submitTimesInfoMessageContainer.style.display = "unset";
          }
        }
      });
    }
  }
  
  function showNoticeAgain() {
    chrome.storage.sync.set({"dontShowNoticeAgain": false});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "showNoticeAgain"
      });
    });
  
    SB.showNoticeAgain.style.display = "none";
  }
  
  function hideVideoPlayerControls() {
    chrome.storage.sync.set({"hideVideoPlayerControls": true});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeVideoPlayerControlsVisibility",
        value: true
      });
    });
  
    SB.hideVideoPlayerControls.style.display = "none";
    SB.showVideoPlayerControls.style.display = "unset";
  }
  
  function showVideoPlayerControls() {
    chrome.storage.sync.set({"hideVideoPlayerControls": false});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeVideoPlayerControlsVisibility",
        value: false
      });
    });
  
    SB.hideVideoPlayerControls.style.display = "unset";
    SB.showVideoPlayerControls.style.display = "none";
  }
  
  function hideInfoButtonPlayerControls() {
    chrome.storage.sync.set({"hideInfoButtonPlayerControls": true});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeInfoButtonPlayerControlsVisibility",
        value: true
      });
    });
  
    SB.hideInfoButtonPlayerControls.style.display = "none";
    SB.showInfoButtonPlayerControls.style.display = "unset";
  }
  
  function showInfoButtonPlayerControls() {
    chrome.storage.sync.set({"hideInfoButtonPlayerControls": false});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeVideoPlayerCochangeInfoButtonPlayerControlsVisibilityntrolsVisibility",
        value: false
      });
    });
  
    SB.hideInfoButtonPlayerControls.style.display = "unset";
    SB.showInfoButtonPlayerControls.style.display = "none";
  }
  
  function hideDeleteButtonPlayerControls() {
    chrome.storage.sync.set({"hideDeleteButtonPlayerControls": true});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeDeleteButtonPlayerControlsVisibility",
        value: true
      });
    });
  
    SB.hideDeleteButtonPlayerControls.style.display = "none";
    SB.showDeleteButtonPlayerControls.style.display = "unset";
  }
  
  function showDeleteButtonPlayerControls() {
    chrome.storage.sync.set({"hideDeleteButtonPlayerControls": false});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "changeVideoPlayerCochangeDeleteButtonPlayerControlsVisibilityntrolsVisibility",
        value: false
      });
    });
  
    SB.hideDeleteButtonPlayerControls.style.display = "unset";
    SB.showDeleteButtonPlayerControls.style.display = "none";
  }
  
  function disableSponsorViewTracking() {
    chrome.storage.sync.set({"trackViewCount": false});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "trackViewCount",
        value: false
      });
    });
  
    SB.disableSponsorViewTracking.style.display = "none";
    SB.enableSponsorViewTracking.style.display = "unset";
  }
  
  function enableSponsorViewTracking() {
    chrome.storage.sync.set({"trackViewCount": true});
  
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "trackViewCount",
        value: true
      });
    });
  
    SB.enableSponsorViewTracking.style.display = "none";
    SB.disableSponsorViewTracking.style.display = "unset";
  }
  
  function updateStartTimeChosen() {
    //update startTimeChosen letiable
    if (!startTimeChosen) {
      startTimeChosen = true;
    SB.sponsorStart.innerHTML = "Sponsorship Ends Now";
    } else {
      resetStartTimeChosen();
    }
  }
  
  //set it to false
  function resetStartTimeChosen() {
    startTimeChosen = false;
    SB.sponsorStart.innerHTML = "Sponsorship Starts Now";
  }
  
  //hides and shows the submit times button when needed
  function showSubmitTimesIfNecessary() {
    //check if an end time has been specified for the latest sponsor time
    if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length > 1) {
      //show submit times button
      document.getElementById("submitTimesContainer").style.display = "unset";
    } else {
      //hide submit times button
      document.getElementById("submitTimesContainer").style.display = "none";
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
  
  function reportAnIssue() {
    document.getElementById("issueReporterContainer").style.display = "unset";
    SB.reportAnIssue.style.display = "none";
  }
  
  function addVoteMessage(message, UUID) {
    let container = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
    //remove all children
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  
    let thanksForVotingText = document.createElement("h2");
    thanksForVotingText.innerText = message;
    //there are already breaks there
    thanksForVotingText.style.marginBottom = "0px";
  
    container.appendChild(thanksForVotingText);
  }
  
  function vote(type, UUID) {
    //add loading info
    addVoteMessage("Loading...", UUID)
  
    //send the vote message to the tab
    chrome.runtime.sendMessage({
      message: "submitVote",
      type: type,
      UUID: UUID
    }, function(response) {
      if (response != undefined) {
        //see if it was a success or failure
        if (response.successType == 1) {
          //success
          addVoteMessage("Thanks for voting!", UUID)
        } else if (response.successType == 0) {
          //failure: duplicate vote
          addVoteMessage("You have already voted this way before.", UUID)
        } else if (response.successType == -1) {
          if (response.statusCode == 502) {
            addVoteMessage("It seems the sever is down. Contact the dev immediately.", UUID)
          } else {
            //failure: unknown error
            addVoteMessage("A connection error has occured. Error code: " + response.statusCode, UUID)
          }
        }
      }
    });
  }
  
  function hideDiscordButton() {
    chrome.storage.sync.set({"hideDiscordLink": false});
  
    SB.discordButtonContainer.style.display = "none";
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

  function whitelistChannel() {
    //get the channel url
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {message: 'getChannelURL'},
        function(response) {
          //get whitelisted channels
          chrome.storage.sync.get(["whitelistedChannels"], function(result) {
            let whitelistedChannels = result.whitelistedChannels;
            if (whitelistedChannels == undefined) {
              whitelistedChannels = [];
            }

            //add on this channel
            whitelistedChannels.push(response.channelURL);

            //change button
            SB.whitelistChannel.style.display = "none";
            SB.unwhitelistChannel.style.display = "unset";

            SB.downloadedSponsorMessageTimes.innerText = "Channel Whitelisted!";
            SB.downloadedSponsorMessageTimes.style.fontWeight = "bold";

            //save this
            chrome.storage.sync.set({whitelistedChannels: whitelistedChannels});

            //send a message to the client
            chrome.tabs.query({
              active: true,
              currentWindow: true
            }, tabs => {
              chrome.tabs.sendMessage(
                tabs[0].id, {
                  message: 'whitelistChange',
                  value: true
                });
              }
            );
          });
        }
      );
    });
  }

  function unwhitelistChannel() {
    //get the channel url
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {message: 'getChannelURL'},
        function(response) {
          //get whitelisted channels
          chrome.storage.sync.get(["whitelistedChannels"], function(result) {
            let whitelistedChannels = result.whitelistedChannels;
            if (whitelistedChannels == undefined) {
              whitelistedChannels = [];
            }

            //remove this channel
            let index = whitelistedChannels.indexOf(response.channelURL);
            whitelistedChannels.splice(index, 1);

            //change button
            SB.whitelistChannel.style.display = "unset";
            SB.unwhitelistChannel.style.display = "none";

            SB.downloadedSponsorMessageTimes.innerText = "";
            SB.downloadedSponsorMessageTimes.style.fontWeight = "unset";

            //save this
            chrome.storage.sync.set({whitelistedChannels: whitelistedChannels});

            //send a message to the client
            chrome.tabs.query({
              active: true,
              currentWindow: true
            }, tabs => {
              chrome.tabs.sendMessage(
                tabs[0].id, {
                  message: 'whitelistChange',
                  value: false
                });
              }
            );
          });
        }
      );
    });
  }
  
  //converts time in seconds to minutes
  function getTimeInMinutes(seconds) {
    let minutes = Math.floor(seconds / 60);
  
    return minutes;
  }
  
  //converts time in seconds to seconds past the last minute
  function getTimeInFormattedSeconds(seconds) {
    let secondsFormatted = (seconds % 60).toFixed(3);
  
    if (secondsFormatted < 10) {
      secondsFormatted = "0" + secondsFormatted;
    }
  
    return secondsFormatted;
  }
  
  function sendRequestToServer(type, address, callback) {
    let xmlhttp = new XMLHttpRequest();
  
    xmlhttp.open(type, serverAddress + address, true);
  
    if (callback != undefined) {
      xmlhttp.onreadystatechange = function () {
        callback(xmlhttp, false);
      };
    
      xmlhttp.onerror = function(ev) {
        callback(xmlhttp, true);
      };
    }
  
    //submit this request
    xmlhttp.send();
  }
  
  function getYouTubeVideoID(url) { // Returns with video id else returns false
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    var id = new URL(url).searchParams.get("v");
    return (match && match[7].length == 11) ? id : false;
  }
  
//end of function
}

if (chrome.tabs != undefined) {
  //add the width restriction (because Firefox)
  document.getElementById("sponorBlockStyleSheet").sheet.insertRule('.popupBody { width: 300 }', 0);

  //this means it is actually opened in the popup
  runThePopup();
}