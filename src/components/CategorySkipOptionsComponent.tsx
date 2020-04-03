import * as React from "react";
import Config from "../config"

export interface CategorySkipOptionsProps { 
    category: string;
    defaultColor: string;
}

export interface CategorySkipOptionsState {
    color: string;
}

class CategorySkipOptionsComponent extends React.Component<CategorySkipOptionsProps, CategorySkipOptionsState> {

    constructor(props: CategorySkipOptionsProps) {
        super(props);

        // Setup state
        this.state = {
            color: props.defaultColor
        }
    }

    render() {
        return (
            <tr id={this.props.category + "OptionsRow"}
                className="categoryTableElement">
                <td id={this.props.category + "OptionName"}
                    className="categoryTableLabel">
                        {chrome.i18n.getMessage("category_" + this.props.category)}
                </td>

                <td id={this.props.category + "SkipOption"}>
                    <select
                        className="categoryOptionsSelector">
                            {this.getOptions(["disable", "manualSkip", "autoSkip"])}
                    </select>
                </td>

                {/* TODO: Add colour chooser */}
            </tr>
        );
    }

    /**
     * @param optionNames List of option names as codes that will be sent to i18n
     */
    getOptions(optionNames: string[]): JSX.Element[] {
        let elements: JSX.Element[] = [];

        for (const optionName of optionNames) {
            elements.push(
                <option value={optionName}>
                    {chrome.i18n.getMessage(optionName)}
                </option>
            );
        }

        return elements;
    }
}

export default CategorySkipOptionsComponent;