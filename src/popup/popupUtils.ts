import { Message, MessageResponse } from "../messageTypes";

export function copyToClipboardPopup(text: string, sendMessage: (request: Message) => Promise<MessageResponse>): void {
    if (window === window.top) {
        window.navigator.clipboard.writeText(text);
    } else {
        sendMessage({
            message: "copyToClipboard",
            text
        });
    }
}