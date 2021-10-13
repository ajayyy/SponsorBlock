
export function getStartTimeFromUrl(url: string): number {
    const urlParams = new URLSearchParams(url);
    const time = urlParams?.get('t') || urlParams?.get('time_continue');

    return urlTimeToSeconds(time);
}

export function urlTimeToSeconds(time: string): number {
    if (!time) {
        return 0;
    }

    const re = /(?:(\d{1,3})h)?(?:(\d{1,2})m)?(\d+)s?/;
    const match = re.exec(time);

    if (match) {
        const hours = parseInt(match[1] ?? '0', 10);
        const minutes = parseInt(match[2] ?? '0', 10);
        const seconds = parseInt(match[3] ?? '0', 10);

        return hours * 3600 + minutes * 60 + seconds;
    } else if (/\d+/.test(time)) {
        return parseInt(time, 10);
    }
}