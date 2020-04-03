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
        let defaultOption = "disable";
        // Set the default opton properly
        for (const categorySelection of Config.config.categorySelections) {
            if (categorySelection.name === this.props.category) {
                defaultOption = categorySelection.autoSkip ? "autoSkip" : "manualSkip";
            }
        }

        return (
            <tr id={this.props.category + "OptionsRow"}
                className="categoryTableElement">
                <td id={this.props.category + "OptionName"}
                    className="categoryTableLabel">
                        {chrome.i18n.getMessage("category_" + this.props.category)}
                </td>

                <td id={this.props.category + "SkipOption"}>
                    <select
                        className="categoryOptionsSelector"
                        defaultValue={defaultOption}
                        onChange={this.skipOptionSelected.bind(this)}>
                            {this.getCategorySkipOptions()}
                    </select>
                </td>

                {/* TODO: Add colour chooser */}
            </tr>
        );
    }

    skipOptionSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        switch (event.target.value) {
            case "disable": 
                this.removeCurrentCategorySelection();

                break;
            default:
                this.removeCurrentCategorySelection();

                Config.config.categorySelections.push({
                    name: this.props.category,
                    autoSkip: event.target.value === "autoSkip"
                });

                // Forces the Proxy to send this to the chrome storage API
                Config.config.categorySelections = Config.config.categorySelections;
        }
    }

    /** Removes this category from the config list of category selections */
    removeCurrentCategorySelection(): void {
        // Remove it if it exists
        for (let i = 0; i < Config.config.categorySelections.length; i++) {
            if (Config.config.categorySelections[i].name === this.props.category) {
                Config.config.categorySelections.splice(i, 1);

                // Forces the Proxy to send this to the chrome storage API
                Config.config.categorySelections = Config.config.categorySelections;

                break;
            }
        }
    }

    getCategorySkipOptions(): JSX.Element[] {
        let elements: JSX.Element[] = [];

        let optionNames = ["disable", "manualSkip", "autoSkip"];

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(optionName)}
                </option>
            );
        }

        return elements;
    }
}

export default CategorySkipOptionsComponent;