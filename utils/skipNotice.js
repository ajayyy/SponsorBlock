'use strict';

//The notice that tells the user that a sponsor was just skipped
class SkipNotice {
	constructor(parent, UUID) {
        this.parent = parent;
        this.UUID = UUID;

        //the countdown until this notice closes
        this.countdownTime = 4;
        //the id for the setInterval running the countdown
        this.countdownInterval = -1;

        //add notice
        let amountOfPreviousNotices = document.getElementsByClassName("sponsorSkipNotice").length;

        if (amountOfPreviousNotices > 0) {
            //already exists

            let previousNotice = document.getElementsByClassName("sponsorSkipNotice")[0];
            previousNotice.classList.add("secondSkipNotice")
        }

        let noticeElement = document.createElement("div");
        //what sponsor time this is about
        noticeElement.id = "sponsorSkipNotice" + this.UUID;
        noticeElement.classList.add("sponsorSkipObject");
        noticeElement.classList.add("sponsorSkipNotice");
        noticeElement.style.zIndex = 50 + amountOfPreviousNotices;

        //add mouse enter and leave listeners
        noticeElement.addEventListener("mouseenter", this.pauseCountdown.bind(this));
        noticeElement.addEventListener("mouseleave", this.startCountdown.bind(this));

        //the row that will contain the info
        let firstRow = document.createElement("tr");
        firstRow.id = "sponsorSkipNoticeFirstRow" + this.UUID;

        let logoColumn = document.createElement("td");

        let logoElement = document.createElement("img");
        logoElement.id = "sponsorSkipLogo" + this.UUID;
        logoElement.className = "sponsorSkipLogo sponsorSkipObject";
        logoElement.src = chrome.extension.getURL("icons/IconSponsorBlocker256px.png");

        let noticeMessage = document.createElement("span");
        noticeMessage.id = "sponsorSkipMessage" + this.UUID;
        noticeMessage.classList.add("sponsorSkipMessage");
        noticeMessage.classList.add("sponsorSkipObject");
        noticeMessage.innerText = chrome.i18n.getMessage("noticeTitle");

        //create the first column
        logoColumn.appendChild(logoElement);
        logoColumn.appendChild(noticeMessage);

        //add the x button
        let closeButtonContainer = document.createElement("td");
        closeButtonContainer.className = "sponsorSkipNoticeRightSection";
        closeButtonContainer.style.top = "11px";

        let timeLeft = document.createElement("span");
        timeLeft.id = "sponsorSkipNoticeTimeLeft" + this.UUID;
        timeLeft.innerText = this.countdownTime + "s";
        timeLeft.className = "sponsorSkipObject sponsorSkipNoticeTimeLeft";

        let hideButton = document.createElement("img");
        hideButton.src = chrome.extension.getURL("icons/close.png");
        hideButton.className = "sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeCloseButton sponsorSkipNoticeRightButton";
        hideButton.addEventListener("click", this.close.bind(this));

        closeButtonContainer.appendChild(timeLeft);
        closeButtonContainer.appendChild(hideButton);

        //add all objects to first row
        firstRow.appendChild(logoColumn);
        firstRow.appendChild(closeButtonContainer);

        let spacer = document.createElement("hr");
        spacer.id = "sponsorSkipNoticeSpacer" + this.UUID;
        spacer.className = "sponsorBlockSpacer";

        //the row that will contain the buttons
        let secondRow = document.createElement("tr");
        secondRow.id = "sponsorSkipNoticeSecondRow" + this.UUID;
        
        //thumbs up and down buttons
        let voteButtonsContainer = document.createElement("td");
        voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + this.UUID;
        voteButtonsContainer.className = "sponsorTimesVoteButtonsContainer"

        let reportText = document.createElement("span");
        reportText.id = "sponsorTimesReportText" + this.UUID;
        reportText.className = "sponsorTimesInfoMessage sponsorTimesVoteButtonMessage";
        reportText.innerText = chrome.i18n.getMessage("reportButtonTitle");
        reportText.style.marginRight = "5px";
        reportText.setAttribute("title", chrome.i18n.getMessage("reportButtonInfo"));

        let downvoteButton = document.createElement("img");
        downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + this.UUID;
        downvoteButton.className = "sponsorSkipObject voteButton";
        downvoteButton.src = chrome.extension.getURL("icons/report.png");
        downvoteButton.addEventListener("click", () => vote(0, this.UUID, this));
        downvoteButton.setAttribute("title", chrome.i18n.getMessage("reportButtonInfo"));

        //add downvote and report text to container
        voteButtonsContainer.appendChild(reportText);
        voteButtonsContainer.appendChild(downvoteButton);

        //add unskip button
        let unskipContainer = document.createElement("td");
        unskipContainer.className = "sponsorSkipNoticeUnskipSection";

        let unskipButton = document.createElement("button");
        unskipButton.innerText = chrome.i18n.getMessage("goBack");
        unskipButton.className = "sponsorSkipObject sponsorSkipNoticeButton";
        unskipButton.addEventListener("click", () => goBackToPreviousTime(this));

        unskipButton.style.marginLeft = "4px";

        unskipContainer.appendChild(unskipButton);

        //add don't show again button
        let dontshowContainer = document.createElement("td");
        dontshowContainer.className = "sponsorSkipNoticeRightSection";

        let dontShowAgainButton = document.createElement("button");
        dontShowAgainButton.innerText = chrome.i18n.getMessage("Hide");
        dontShowAgainButton.className = "sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton";
        dontShowAgainButton.addEventListener("click", dontShowNoticeAgain);

        dontshowContainer.appendChild(dontShowAgainButton);

        //add to row
        secondRow.appendChild(voteButtonsContainer);
        secondRow.appendChild(unskipContainer);
        secondRow.appendChild(dontshowContainer);

        noticeElement.appendChild(firstRow);
        noticeElement.appendChild(spacer);
        noticeElement.appendChild(secondRow);

        //get reference node
        let referenceNode = document.getElementById("movie_player");
        if (referenceNode == null) {
            //for embeds
            let player = document.getElementById("player");
            referenceNode = player.firstChild;
            let index = 1;

            //find the child that is the video player (sometimes it is not the first)
            while (!referenceNode.classList.contains("html5-video-player") || !referenceNode.classList.contains("ytp-embed")) {
                referenceNode = player.children[index];

                index++;
            }
        }

        referenceNode.prepend(noticeElement);

        this.startCountdown();
    }

    //called every second to lower the countdown before hiding the notice
    countdown() {
        this.countdownTime--;

        if (this.countdownTime <= 0) {
            //remove this from setInterval
            clearInterval(this.countdownInterval);

            //time to close this notice
            this.close();

            return;
        }

        this.updateTimerDisplay();
    }

    pauseCountdown() {
        //remove setInterval
        clearInterval(this.countdownInterval);
        this.countdownInterval = -1;

        //reset countdown
        this.countdownTime = 4;
        
        //inform the user
        let timeLeft = document.getElementById("sponsorSkipNoticeTimeLeft" + this.UUID);
        timeLeft.innerText = chrome.i18n.getMessage("paused");
    }

    startCountdown() {
        //if it has already started, don't start it again
        if (this.countdownInterval != -1) return;

        this.countdownInterval = setInterval(this.countdown.bind(this), 1000);

        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        //update the timer display
        let timeLeft = document.getElementById("sponsorSkipNoticeTimeLeft" + this.UUID);
        timeLeft.innerText = this.countdownTime + "s";
    }

    afterDownvote() {
        this.addVoteButtonInfo(chrome.i18n.getMessage("Voted"));
        this.addNoticeInfoMessage(chrome.i18n.getMessage("hitGoBack"));
        
        //remove this sponsor from the sponsors looked up
        //find which one it is
        for (let i = 0; i < sponsorTimes.length; i++) {
            if (UUIDs[i] == this.UUID) {
                //this one is the one to hide
                
                //add this as a hidden sponsorTime
                hiddenSponsorTimes.push(i);
            
                let sponsorTimesLeft = sponsorTimes.slice();
                for (let j = 0; j < hiddenSponsorTimes.length; j++) {
                    //remove this sponsor time
                    sponsorTimesLeft.splice(hiddenSponsorTimes[j], 1);
                }
            
                //update the preview
                previewBar.set(sponsorTimesLeft, [], v.duration);
            
                break;
            }
        }
    }
    
    addNoticeInfoMessage(message) {
        let previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + this.UUID);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.UUID).removeChild(previousInfoMessage);
        }
        
        //add info
        let thanksForVotingText = document.createElement("p");
        thanksForVotingText.id = "sponsorTimesInfoMessage" + this.UUID;
        thanksForVotingText.className = "sponsorTimesInfoMessage";
        thanksForVotingText.innerText = message;
        
        //add element to div
        document.getElementById("sponsorSkipNotice" + this.UUID).insertBefore(thanksForVotingText, document.getElementById("sponsorSkipNoticeSpacer" + this.UUID));
    }
    
    resetNoticeInfoMessage() {
        let previousInfoMessage = document.getElementById("sponsorTimesInfoMessage" + this.UUID);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNotice" + this.UUID).removeChild(previousInfoMessage);
        }
    }
    
    addVoteButtonInfo(message) {
        this.resetVoteButtonInfo();
        
        //hide report button and text for it
        let downvoteButton = document.getElementById("sponsorTimesDownvoteButtonsContainer" + this.UUID);
        if (downvoteButton != null) {
            downvoteButton.style.display = "none";
        }
        let downvoteButtonText = document.getElementById("sponsorTimesReportText" + this.UUID);
        if (downvoteButtonText != null) {
            downvoteButtonText.style.display = "none";
        }
        
        //add info
        let thanksForVotingText = document.createElement("td");
        thanksForVotingText.id = "sponsorTimesVoteButtonInfoMessage" + this.UUID;
        thanksForVotingText.className = "sponsorTimesInfoMessage sponsorTimesVoteButtonMessage";
        thanksForVotingText.innerText = message;
        
        //add element to div
        document.getElementById("sponsorSkipNoticeSecondRow" + this.UUID).prepend(thanksForVotingText);
    }
    
    resetVoteButtonInfo() {
        let previousInfoMessage = document.getElementById("sponsorTimesVoteButtonInfoMessage" + this.UUID);
        if (previousInfoMessage != null) {
            //remove it
            document.getElementById("sponsorSkipNoticeSecondRow" + this.UUID).removeChild(previousInfoMessage);
        }
        
        //show button again
        document.getElementById("sponsorTimesDownvoteButtonsContainer" + this.UUID).style.removeProperty("display");
    }
    
    //close this notice
    close() {
        let notice = document.getElementById("sponsorSkipNotice" + this.UUID);
        if (notice != null) {
            notice.remove();
        }
    }

}