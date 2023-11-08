import { objectToURI } from "../../maze-utils/src";
import { getHash } from "../../maze-utils/src/hash";
import Config from "../config";
import GenericNotice, { NoticeOptions } from "../render/GenericNotice";
import { ContentContainer } from "../types";
import { asyncRequestToServer } from "./requests";

export interface ChatConfig {
    displayName: string;
    composerInitialValue?: string;
    customDescription?: string;
}

export async function openWarningDialog(contentContainer: ContentContainer): Promise<void> {
    const userInfo = await asyncRequestToServer("GET", "/api/userInfo", {
        publicUserID: await getHash(Config.config.userID),
        values: ["warningReason"]
    });

    if (userInfo.ok) {
        const warningReason = JSON.parse(userInfo.responseText)?.warningReason;
        const userNameData = await asyncRequestToServer("GET", "/api/getUsername?userID=" + Config.config.userID);
        const userName = userNameData.ok ? JSON.parse(userNameData.responseText).userName : "";
        const publicUserID = await getHash(Config.config.userID);

        let notice: GenericNotice = null;
        const options: NoticeOptions = {
            title: chrome.i18n.getMessage("deArrowMessageRecieved"),
            textBoxes: [{
                text: chrome.i18n.getMessage("warningChatInfo"),
                icon: null
            }, ...warningReason.split("\n").map((reason) => ({
                text: reason,
                icon: null
            }))],
            buttons: [{
                    name: chrome.i18n.getMessage("questionButton"),
                    listener: () => openChat({
                        displayName: `${userName ? userName : ``}${userName !== publicUserID ? ` | ${publicUserID}` : ``}`
                    })
                },
                {
                    name: chrome.i18n.getMessage("warningConfirmButton"),
                    listener: async () => {
                        const result = await asyncRequestToServer("POST", "/api/warnUser", {
                            userID: Config.config.userID,
                            enabled: false
                        });

                        if (result.ok) {
                            notice?.close();
                        } else {
                            alert(`${chrome.i18n.getMessage("warningError")} ${result.status}`);
                        }
                    }
            }],
            timed: false
        };

        notice = new GenericNotice(contentContainer, "warningNotice", options);
    }
}

export function openChat(config: ChatConfig): void {
    window.open("https://chat.sponsor.ajay.app/#" + objectToURI("", config, false));
}
