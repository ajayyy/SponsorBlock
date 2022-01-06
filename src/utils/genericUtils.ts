/** Function that can be used to wait for a condition before returning. */
async function wait<T>(condition: () => T | false, timeout = 5000, check = 100): Promise<T> {
    return await new Promise((resolve, reject) => {
        setTimeout(() => {
            clearInterval(interval);
            reject("TIMEOUT");
        }, timeout);

        const intervalCheck = () => {
            const result = condition();
            if (result) {
                resolve(result);
                clearInterval(interval);
            }
        };

        const interval = setInterval(intervalCheck, check);
        
        //run the check once first, this speeds it up a lot
        intervalCheck();
    });
}

/**
 * Gets the error message in a nice string
 * 
 * @param {int} statusCode 
 * @returns {string} errorMessage
 */
function getErrorMessage(statusCode: number, responseText: string): string {
    let errorMessage = "";
    const postFix = (responseText ? "\n\n" + responseText : "");
                        
    if([400, 429, 409, 502, 503, 0].includes(statusCode)) {
        //treat them the same
        if (statusCode == 503) statusCode = 502;

        errorMessage = chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode
                        + "\n\n" + chrome.i18n.getMessage("statusReminder");
    } else {
        errorMessage = chrome.i18n.getMessage("connectionError") + statusCode;
    }

    return errorMessage + postFix;
}

export const GenericUtils = {
    wait,
    getErrorMessage
}