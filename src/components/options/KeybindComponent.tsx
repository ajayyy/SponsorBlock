import * as React from "react";
import { createRoot, Root } from 'react-dom/client';
import Config from "../../config";
import KeybindDialogComponent from "./KeybindDialogComponent";
import { formatKey, Keybind, keybindEquals, keybindToString } from "@ajayyy/maze-utils/lib/config";

export interface KeybindProps { 
    option: string;
}

export interface KeybindState { 
    keybind: Keybind;
}

let dialog;
let root: Root;

class KeybindComponent extends React.Component<KeybindProps, KeybindState> {
    constructor(props: KeybindProps) {
        super(props);
        this.state = {keybind: Config.config[this.props.option]};
    }

    render(): React.ReactElement {
        return(
            <>
                <div className="keybind-buttons inline" title={chrome.i18n.getMessage("change")} onClick={() => this.openEditDialog()}>
                    {this.state.keybind?.ctrl && <div className="key keyControl">Ctrl</div>}
                    {this.state.keybind?.ctrl && <span className="keyControl">+</span>}
                    {this.state.keybind?.alt && <div className="key keyAlt">Alt</div>}
                    {this.state.keybind?.alt && <span className="keyAlt">+</span>}
                    {this.state.keybind?.shift && <div className="key keyShift">Shift</div>}
                    {this.state.keybind?.shift && <span className="keyShift">+</span>}
                    {this.state.keybind?.key != null && <div className="key keyBase">{formatKey(this.state.keybind.key)}</div>}
                    {this.state.keybind == null && <span className="unbound">{chrome.i18n.getMessage("notSet")}</span>}
                </div>

            {this.state.keybind != null &&
                <div className="option-button trigger-button inline" onClick={() => this.unbind()}>
                    {chrome.i18n.getMessage("unbind")}
                </div>
            }
            </>
        );
    }

    equals(other: Keybind): boolean {
        return keybindEquals(this.state.keybind, other);
    }

    toString(): string {
        return keybindToString(this.state.keybind);
    }

    openEditDialog(): void {
        dialog = parent.document.createElement("div");
        dialog.id = "keybind-dialog";
        parent.document.body.prepend(dialog);
        root = createRoot(dialog);
        root.render(<KeybindDialogComponent option={this.props.option} closeListener={(updateWith) => this.closeEditDialog(updateWith)} />);
    }

    closeEditDialog(updateWith: Keybind): void {
        root.unmount();
        dialog.remove();
        if (updateWith != null)
            this.setState({keybind: updateWith});
    }

    unbind(): void {
        this.setState({keybind: null});
        Config.config[this.props.option] = null;
    }
}

export default KeybindComponent;