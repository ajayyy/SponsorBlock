import * as React from "react";
import ResetIcon from "../../svg-icons/resetIcon";

export interface NumberInputOptionProps { 
    label: string;
    description?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    value: number;
    onChange(value: number): void;
    partiallyHidden?: boolean;
    showResetButton?: boolean;
    onReset?(): void;
}

export function NumberInputOptionComponent(props: NumberInputOptionProps): React.ReactElement {
    return (
        <div className={`sb-number-option ${props.disabled ? "disabled" : ""} ${props.partiallyHidden ? "partiallyHidden" : ""}`}>
            <div style={props.style}>
                <label className="number-container">
                    <span className="optionLabel">
                        {props.label}
                    </span>
                    <input id={props.label} 
                        className="sb-number-input"
                        type="number"
                        step="0.1"
                        min="0"
                        value={props.value}
                        disabled={props.disabled} 
                        onChange={(e) => props.onChange(Number(e.target.value))}/>
                </label>

                {
                    props.showResetButton &&
                        <span className="reset-button sb-switch-label" title={chrome.i18n.getMessage("fallbackToDefault")} onClick={() => {
                            props.onReset?.();
                        }}>
                            <ResetIcon/>
                        </span>
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