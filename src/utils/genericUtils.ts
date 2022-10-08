/** Function that can be used to wait for a condition before returning. */
async function wait<T>(condition: () => T, timeout = 5000, check = 100, predicate?: (obj: T) => boolean): Promise<T> {
    return await new Promise((resolve, reject) => {
        setTimeout(() => {
            clearInterval(interval);
            reject("TIMEOUT");
        }, timeout);

        const intervalCheck = () => {
            const result = condition();
            if (predicate ? predicate(result) : result) {
                resolve(result);
                clearInterval(interval);
            }
        };

        const interval = setInterval(intervalCheck, check);
        
        //run the check once first, this speeds it up a lot
        intervalCheck();
    });
}

function getFormattedTimeToSeconds(formatted: string): number | null {
    const fragments = /^(?:(?:(\d+):)?(\d+):)?(\d*(?:[.,]\d+)?)$/.exec(formatted);

    if (fragments === null) {
        return null;
    }

    const hours = fragments[1] ? parseInt(fragments[1]) : 0;
    const minutes = fragments[2] ? parseInt(fragments[2] || '0') : 0;
    const seconds = fragments[3] ? parseFloat(fragments[3].replace(',', '.')) : 0;

    return hours * 3600 + minutes * 60 + seconds;
}

function getFormattedTime(seconds: number, precise?: boolean): string {
    seconds = Math.max(seconds, 0);
    
    const hours = Math.floor(seconds / 60 / 60);
    const minutes = Math.floor(seconds / 60) % 60;
    let minutesDisplay = String(minutes);
    let secondsNum = seconds % 60;
    if (!precise) {
        secondsNum = Math.floor(secondsNum);
    }

    let secondsDisplay = String(precise ? secondsNum.toFixed(3) : secondsNum);
    
    if (secondsNum < 10) {
        //add a zero
        secondsDisplay = "0" + secondsDisplay;
    }
    if (hours && minutes < 10) {
        //add a zero
        minutesDisplay = "0" + minutesDisplay;
    }
    if (isNaN(hours) || isNaN(minutes)) {
        return null;
    }

    const formatted = (hours ? hours + ":" : "") + minutesDisplay + ":" + secondsDisplay;

    return formatted;
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
function hexToRgb(hex: string): {r: number; g: number; b: number} {
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

function generateUserID(length = 36): string {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    if (window.crypto && window.crypto.getRandomValues) {
            const values = new Uint32Array(length);
            window.crypto.getRandomValues(values);
            for (let i = 0; i < length; i++) {
                    result += charset[values[i] % charset.length];
            }
            return result;
    } else {
            for (let i = 0; i < length; i++) {
                result += charset[Math.floor(Math.random() * charset.length)];
            }
            return result;
    }
}

export const GenericUtils = {
    wait,
    getFormattedTime,
    getFormattedTimeToSeconds,
    getErrorMessage,
    getLuminance,
    generateUserID,
    indexesOf,
    objectToURI
}