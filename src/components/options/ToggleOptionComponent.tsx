import * as React from "react";
import ResetIcon from "../../svg-icons/resetIcon";

export interface ToggleOptionProps { 
    label: string;
    description?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    checked: boolean | null;
    onChange(checked: boolean): void;
    partiallyHidden?: boolean;
    showResetButton?: boolean;
    onReset?(): void;
}

export function ToggleOptionComponent(props: ToggleOptionProps): React.ReactElement {
    return (
        <div className={`sb-toggle-option ${props.disabled ? "disabled" : ""} ${props.partiallyHidden ? "partiallyHidden" : ""}`}>
            <div className="switch-container" style={props.style}>
                <label className="switch">
                    <input id={props.label} 
                        type="checkbox" 
                        checked={props.checked} 
                        disabled={props.disabled} 
                        onChange={(e) => props.onChange(e.target.checked)}/>
                    <span className="slider round"></span>
                </label>
                <label className="switch-label" htmlFor={props.label}>
                    {props.label}
                </label>

                {
                    props.showResetButton &&
                        <div className="reset-button sb-switch-label" title={chrome.i18n.getMessage("fallbackToDefault")} onClick={() => {
                            props.onReset?.();
                        }}>
                            <ResetIcon/>
                        </div>
                }
            </div>

            {
                props.description &&
                    <div className="small-description">
                        {props.description}
                    </div>
            }
        </div>
    );
}