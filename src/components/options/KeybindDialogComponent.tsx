import * as React from "react";
import { ChangeEvent } from "react";
import Config from "../../config";
import { Keybind, formatKey, keybindEquals } from "../../maze-utils/config";

export interface KeybindDialogProps { 
    option: string;
    closeListener: (updateWith) => void;
}

export interface KeybindDialogState {
    key: Keybind;
    error: ErrorMessage;
}

interface ErrorMessage {
    message: string;
    blocking: boolean;
}

class KeybindDialogComponent extends React.Component<KeybindDialogProps, KeybindDialogState> {

    constructor(props: KeybindDialogProps) {
        super(props);
        this.state = {
            key: {
                key: null,
                code: null,
                ctrl: false,
                alt: false,
                shift: false
            },
            error: {
                message: null,
                blocking: false
            }
        };
    }

    render(): React.ReactElement {
        return(
            <>
                <div className="blocker"></div>
                <div className="dialog">
                    <div id="change-keybind-description">{chrome.i18n.getMessage("keybindDescription")}</div>
                    <div id="change-keybind-settings">
                        <div id="change-keybind-modifiers" className="inline">
                            <div>
                                <input id="change-keybind-ctrl" type="checkbox" onChange={this.keybindModifierChecked} />
                                <label htmlFor="change-keybind-ctrl">Ctrl</label>
                            </div>
                            <div>
                                <input id="change-keybind-alt" type="checkbox" onChange={this.keybindModifierChecked} />
                                <label htmlFor="change-keybind-alt">Alt</label>
                            </div>
                            <div>
                                <input id="change-keybind-shift" type="checkbox" onChange={this.keybindModifierChecked} />
                                <label htmlFor="change-keybind-shift">Shift</label>
                            </div>
                        </div>
                        <div className="key inline">{formatKey(this.state.key.key)}</div>
                    </div>
                    <div id="change-keybind-error">{this.state.error?.message}</div>
                    <div id="change-keybind-buttons">
                        <div className={"option-button save-button inline" + ((this.state.error?.blocking || this.state.key.key == null) ? " disabled" : "")} onClick={() => this.save()}>
                            {chrome.i18n.getMessage("save")}
                        </div>
                        <div className="option-button cancel-button inline" onClick={() => this.props.closeListener(null)}>
                            {chrome.i18n.getMessage("cancel")}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    componentDidMount(): void {
        parent.document.addEventListener("keydown", this.keybindKeyPressed);
        document.addEventListener("keydown", this.keybindKeyPressed);
    }

    componentWillUnmount(): void {
        parent.document.removeEventListener("keydown", this.keybindKeyPressed);
        document.removeEventListener("keydown", this.keybindKeyPressed);
    }

    keybindKeyPressed = (e: KeyboardEvent): void => {
        if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.getModifierState("AltGraph")) {
            if (e.code == "Escape") {
                this.props.closeListener(null);
                return;
            }
    
            this.setState({
                key: {
                    key: e.key,
                    code: e.code,
                    ctrl: this.state.key.ctrl,
                    alt: this.state.key.alt,
                    shift: this.state.key.shift}
            }, () => this.setState({ error: this.isKeybindAvailable() }));
        }
    }
    
    keybindModifierChecked = (e: ChangeEvent<HTMLInputElement>): void => {
        const id = e.target.id;
        const val = e.target.checked;
    
        this.setState({
            key: {
                key: this.state.key.key,
                code: this.state.key.code,
                ctrl: id == "change-keybind-ctrl" ? val: this.state.key.ctrl,
                alt: id == "change-keybind-alt" ? val: this.state.key.alt,
                shift: id == "change-keybind-shift" ? val: this.state.key.shift}
        }, () => this.setState({ error: this.isKeybindAvailable() }));
    }

    isKeybindAvailable(): ErrorMessage {
        if (this.state.key.key == null)
            return null;

        let youtubeShortcuts: Keybind[];
        if (/[a-zA-Z0-9,.+\-\][:]/.test(this.state.key.key)) {
            youtubeShortcuts = [{key: "k"}, {key: "j"}, {key: "l"}, {key: "p", shift: true}, {key: "n", shift: true}, {key: ","}, {key: "."}, {key: ",", shift: true}, {key: ".", shift: true},
                {key: "ArrowRight"}, {key: "ArrowLeft"}, {key: "ArrowUp"}, {key: "ArrowDown"}, {key: "c"}, {key: "o"},
                {key: "w"}, {key: "+"}, {key: "-"}, {key: "f"}, {key: "t"}, {key: "i"}, {key: "m"}, {key: "a"}, {key: "s"}, {key: "d"}, {key: "Home"}, {key: "End"},
                {key: "0"}, {key: "1"}, {key: "2"}, {key: "3"}, {key: "4"}, {key: "5"}, {key: "6"}, {key: "7"}, {key: "8"}, {key: "9"}, {key: "]"}, {key: "["}];
        } else {
            youtubeShortcuts = [{key: null, code: "KeyK"}, {key: null, code: "KeyJ"}, {key: null, code: "KeyL"}, {key: null, code: "KeyP", shift: true}, {key: null, code: "KeyN", shift: true},
                {key: null, code: "Comma"}, {key: null, code: "Period"}, {key: null, code: "Comma", shift: true}, {key: null, code: "Period", shift: true}, {key: null, code: "Space"},
                {key: null, code: "KeyC"}, {key: null, code: "KeyO"}, {key: null, code: "KeyW"}, {key: null, code: "Equal"}, {key: null, code: "Minus"}, {key: null, code: "KeyF"}, {key: null, code: "KeyT"},
                {key: null, code: "KeyI"}, {key: null, code: "KeyM"}, {key: null, code: "KeyA"}, {key: null, code: "KeyS"}, {key: null, code: "KeyD"}, {key: null, code: "BracketLeft"}, {key: null, code: "BracketRight"}];
        }
        
        for (const shortcut of youtubeShortcuts) {
            const withShift = Object.assign({}, shortcut);
            if (!/[0-9]/.test(this.state.key.key)) //shift+numbers don't seem to do anything on youtube, all other keys do
                withShift.shift = true;
            if (this.equals(shortcut) || this.equals(withShift))
                return {message: chrome.i18n.getMessage("youtubeKeybindWarning"), blocking: false};
        }

        if (this.props.option != "skipKeybind" && this.equals(Config.config['skipKeybind']) ||
                this.props.option != "submitKeybind" && this.equals(Config.config['submitKeybind']) ||
                this.props.option != "startSponsorKeybind" && this.equals(Config.config['startSponsorKeybind']))
            return {message: chrome.i18n.getMessage("keyAlreadyUsed"), blocking: true};

        return null;
    }

    equals(other: Keybind): boolean {
        return keybindEquals(this.state.key, other);
    }

    save(): void {
        if (this.state.key.key != null && !this.state.error?.blocking) {
            Config.config[this.props.option] = this.state.key;
            this.props.closeListener(this.state.key);
        }
    }
}

export default KeybindDialogComponent;