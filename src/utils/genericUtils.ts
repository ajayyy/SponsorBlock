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
    const postFix = ((responseText && !(responseText.includes(`cf-wrapper`) || responseText.includes("<!DOCTYPE html>"))) ? "\n\n" + responseText : "");
    // display response body for 4xx
    if([400, 429, 409, 0].includes(statusCode)) {
        return chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode + postFix;
    } else if (statusCode >= 500 && statusCode <= 599) {
        // 503 == 502
        if (statusCode == 503) statusCode = 502;
        return chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode
        + "\n\n" + chrome.i18n.getMessage("statusReminder");
    } else {
        return chrome.i18n.getMessage("connectionError") + statusCode + postFix;
    }
}

/* Gets percieved luminance of a color */
function getLuminance(color: string): number {
    const {r, g, b} = hexToRgb(color);
    return Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
}

/* From https://stackoverflow.com/a/5624139 */
function hexToRgb(hex: string): {r: number, g: number, b: number} {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
      return r + r + g + g + b + b;
    });
  
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
}

/**
 * List of all indexes that have the specified value
 * https://stackoverflow.com/a/54954694/1985387
 */
function indexesOf<T>(array: T[], value: T): number[] {
    return array.map((v, i) => v === value ? i : -1).filter(i => i !== -1);
}

function objectToURI<T>(url: string, data: T, includeQuestionMark: boolean): string {
    let counter = 0;
    for (const key in data) {
        const seperator = (url.includes("?") || counter > 0) ? "&" : (includeQuestionMark ? "?" : "");
        const value = (typeof(data[key]) === "string") ? data[key] as unknown as string : JSON.stringify(data[key]);
        url += seperator + encodeURIComponent(key) + "=" + encodeURIComponent(value);

        counter++;
    }

    return url;
}

export const GenericUtils = {
    wait,
    getErrorMessage,
    getLuminance,
    indexesOf,
    objectToURI
}