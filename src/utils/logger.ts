window["SBLogs"] = {
    debug: [],
    warn: []
};

export function logDebug(message: string) {
    window["SBLogs"].debug.push(`[${new Date().toISOString()}] ${message}`);
}

export function logWarn(message: string) {
    window["SBLogs"].warn.push(`[${new Date().toISOString()}] ${message}`);
}