import Config from "../config";
import Utils from "../utils";
const utils = new Utils();

export interface ChatConfig {
    displayName: string,
    composerInitialValue?: string,
    customDescription?: string
}

export function openChat(config: ChatConfig): void {
    const chat = document.createElement("iframe");
    chat.src = "https://chat.sponsor.ajay.app/#" + utils.objectToURI("", config, false);
    chat.classList.add("chatNotice");
    chat.style.zIndex = "2000";

    console.log(utils.objectToURI("", config, false))

    const referenceNode = utils.findReferenceNode();
    referenceNode.prepend(chat);
}

export async function openWarningChat(warningMessage: string): Promise<void> {
    openChat({
        displayName: await utils.getHash(Config.config.userID),
        composerInitialValue: `I got a warning and want to know what I need to do to improve. ` +
                              `Warning reason: ${warningMessage.match(/Warning reason: '(.+)'/)[1]}`,
        customDescription: chrome.i18n.getMessage("warningChatInfo")
    });
}