export function isMobileControlsOpen(): boolean {
    const overlay = document.getElementById("player-control-overlay");

    if (overlay) {
        return !!overlay?.classList?.contains("fadein");
    }

    return false;
}