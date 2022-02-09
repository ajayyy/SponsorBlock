import Config from "../config";
import { Keybind } from "../types";

export function showDonationLink(): boolean {
    return navigator.vendor !== "Apple Computer, Inc." && Config.config.showDonationLink;
}

export function isSafari(): boolean {
    return navigator.vendor === "Apple Computer, Inc.";
}

export function keybindEquals(first: Keybind, second: Keybind): boolean {
    if (first == null || second == null ||
            Boolean(first.alt) != Boolean(second.alt) || Boolean(first.ctrl) != Boolean(second.ctrl) || Boolean(first.shift) != Boolean(second.shift) ||
            first.key == null && first.code == null || second.key == null && second.code == null)
        return false;
    if (first.code != null && second.code != null)
        return first.code === second.code;
    if (first.key != null && second.key != null)
        return first.key.toUpperCase() === second.key.toUpperCase();
    return false;
}

export function formatKey(key: string): string {
    if (key == null)
        return "";
    else if (key == " ")
        return "Space";
    else if (key.length == 1)
        return key.toUpperCase();
    else
        return key;
}

export function keybindToString(keybind: Keybind): string {
    if (keybind == null || keybind.key == null)
        return "";

    let ret = "";
    if (keybind.ctrl)
        ret += "Ctrl+";
    if (keybind.alt)
        ret += "Alt+";
    if (keybind.shift)
        ret += "Shift+";

    return ret += formatKey(keybind.key);
}