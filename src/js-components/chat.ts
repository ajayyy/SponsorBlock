import Config from "../config";
import Utils from "../utils";
const utils = new Utils();

export interface ChatConfig {
    displayName: string,
    composerInitialValue?: string,
    customDescription?: string
}

export function openChat(config: ChatConfig): void {
    const chat = document.createElement("div");
    chat.classList.add("sbChatNotice");
    chat.style.zIndex = "2000";

    const iframe= document.createElement("iframe");
    iframe.src = "https://chat.sponsor.ajay.app/#" + utils.objectToURI("", config, false);
    chat.appendChild(iframe);

    const closeButton  = document.createElement("img");
    closeButton.classList.add("sbChatClose");
    closeButton.src = chrome.extension.getURL("icons/close.png");
    closeButton.addEventListener("click", () => {
        chat.remove();
        closeButton.remove();
    });
    chat.appendChild(closeButton);

    const referenceNode = utils.findReferenceNode();
    referenceNode.prepend(chat);
}

export async function openWarningChat(warningMessage: string): Promise<void> {
    const warningReasonMatch = warningMessage.match(/Warning reason: '(.+)'/);
    alert(chrome.i18n.getMessage("warningChatInfo") + `\n\n${warningReasonMatch ? ` Warning reason: ${warningReasonMatch[1]}` : ``}`);

    const userNameData = await utils.asyncRequestToServer("GET", "/api/getUsername?userID=" + Config.config.userID);
    const userName = userNameData.ok ? JSON.parse(userNameData.responseText).userName : "";
    const publicUserID = await utils.getHash(Config.config.userID);

    openChat({
        displayName: `${userName ? userName : ``}${userName !== publicUserID ? ` | ${publicUserID}` : ``}`,
        composerInitialValue: `I got a warning and confirm I [REMOVE THIS CAPITAL TEXT TO CONFIRM] reread the guidelines.` +
                                warningReasonMatch ? ` Warning reason: ${warningReasonMatch[1]}` : ``,
        customDescription: chrome.i18n.getMessage("warningChatInfo")
    });
}