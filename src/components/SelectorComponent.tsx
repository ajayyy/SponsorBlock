import * as React from "react";

export interface SelectorOption {
    label: string;
}

export interface SelectorProps { 
    id: string;
    options: SelectorOption[];
    onChange: (value: string) => void;
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
                className="sbSelector">
                <div className="sbSelectorBackground">
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
                    onClick={() => this.props.onChange(option.label)}
                    key={option.label}>
                    {option.label}
                </div>
            );
        }

        return result;
    }
}

export default SelectorComponent;