import * as React from "react";

export interface SelectorOption {
    label: string;
}

export interface SelectorProps { 
    id: string;
    options: SelectorOption[];
    onChange: (value: string) => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export interface SelectorState {

}

class SelectorComponent extends React.Component<SelectorProps, SelectorState> {

    constructor(props: SelectorProps) {
        super(props);

        // Setup state
        this.state = {
            
        }
    }

    render(): React.ReactElement {
        return (
            <div id={this.props.id}
                style={{display: this.props.options.length > 0 ? "inherit" : "none"}}
                className="sbSelector">
                <div onMouseEnter={this.props.onMouseEnter}
                    onMouseLeave={this.props.onMouseLeave}
                    className="sbSelectorBackground">
                    {this.getOptions()}
                </div>
            </div>
        );
    }

    getOptions(): React.ReactElement[] {
        const result: React.ReactElement[] = [];
        for (const option of this.props.options) {
            result.push(
                <div className="sbSelectorOption"
                    onClick={(e) => {
                        e.stopPropagation();
                        this.props.onChange(option.label);
                    }}
                    key={option.label}>
                    {option.label}
                </div>
            );
        }

        return result;
    }
}

export default SelectorComponent;