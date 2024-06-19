if (typeof (window) !== "undefined") {
    window["SBLogs"] = {
        debug: [],
        warn: []
    };
}

export function logDebug(message: string) {
    if (typeof (window) !== "undefined") {
        window["SBLogs"].debug.push(`[${new Date().toISOString()}] ${message}`);
    } else {
        console.log(`[${new Date().toISOString()}] ${message}`)
    }
}

export function logWarn(message: string) {
    if (typeof (window) !== "undefined") {
        window["SBLogs"].warn.push(`[${new Date().toISOString()}] ${message}`);
    } else {
        console.warn(`[${new Date().toISOString()}] ${message}`)
    }
}