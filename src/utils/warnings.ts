import { objectToURI } from "../../maze-utils/src";
import { FetchResponse, logRequest } from "../../maze-utils/src/background-request-proxy";
import { formatJSErrorMessage, getLongErrorMessage } from "../../maze-utils/src/formating";
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
    let userInfo: FetchResponse;
    try {
        userInfo = await asyncRequestToServer("GET", "/api/userInfo", {
            publicUserID: await getHash(Config.config.userID),
            values: ["warningReason"]
        });
    } catch (e) {
        console.error("[SB] Caught error while trying to fetch user's active warnings", e)
        return;
    }

    if (userInfo.ok) {
        const warningReason = JSON.parse(userInfo.responseText)?.warningReason;
        let userName = "";
        try {
            const userNameData = await asyncRequestToServer("GET", "/api/getUsername?userID=" + Config.config.userID);
            userName = userNameData.ok ? JSON.parse(userNameData.responseText).userName : "";
        } catch (e) {
            console.warn("[SB] Caught non-fatal error while trying to resolve user's username", e);
        }
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
                        let result: FetchResponse;
                        try {
                            result = await asyncRequestToServer("POST", "/api/warnUser", {
                                userID: Config.config.userID,
                                enabled: false
                            });
                        } catch (e) {
                            console.error("[SB] Caught error while trying to acknowledge user's active warning", e);
                            alert(formatJSErrorMessage(e));
                        }

                        if (result.ok) {
                            notice?.close();
                        } else {
                            logRequest(result, "SB", "warning acknowledgement");
                            alert(getLongErrorMessage(result.status, result.responseText));
                        }
                    }
            }],
            timed: false
        };

        notice = new GenericNotice(contentContainer, "warningNotice", options);
    } else {
        logRequest(userInfo, "SB", "user's active warnings");
    }
}

export function openChat(config: ChatConfig): void {
    window.open("https://chat.sponsor.ajay.app/#" + objectToURI("", config, false));
}
