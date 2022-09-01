import * as React from "react";

import Config from "../../config";

export interface ToggleOptionProps { 
    configKey: string;
    label: string;
    disabled?: boolean;
    style?: React.CSSProperties;
}

export interface ToggleOptionState {
    enabled: boolean;
}

class ToggleOptionComponent extends React.Component<ToggleOptionProps, ToggleOptionState> {

    constructor(props: ToggleOptionProps) {
        super(props);

        // Setup state
        this.state = {
            enabled: Config.config[props.configKey]
        }
    }

    render(): React.ReactElement {
        return (
            <div>
                <div className="switch-container" style={this.props.style}>
                    <label className="switch">
                        <input id={this.props.configKey} 
                            type="checkbox" 
                            checked={this.state.enabled} 
                            disabled={this.props.disabled} 
                            onChange={(e) => this.clicked(e)}/>
                        <span className="slider round"></span>
                    </label>
                    <label className="switch-label" htmlFor={this.props.configKey}>
                        {this.props.label}
                    </label>
                </div>
            </div>
        );
    }

    clicked(event: React.ChangeEvent<HTMLInputElement>): void {
        Config.config[this.props.configKey] = event.target.checked;

        this.setState({
            enabled: event.target.checked
        });
    }

}

export default ToggleOptionComponent;