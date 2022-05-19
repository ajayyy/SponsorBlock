window["SBLogs"] = {
    debug: [],
    warn: []
};

export function logDebug(message: string) {
    window["SBLogs"].debug.push(message);
}

export function logWarn(message: string) {
    window["SBLogs"].warn.push(message);
}