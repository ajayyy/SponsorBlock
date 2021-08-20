import * as React from "react";

import Config from "../config"
import { Category, CategorySkipOption } from "../types";

import { getCategoryActionType } from "../utils/categoryUtils";

export interface CategorySkipOptionsProps { 
    category: Category;
    defaultColor?: string;
    defaultPreviewColor?: string;
}

export interface CategorySkipOptionsState {
    color: string;
    previewColor: string;
}

class CategorySkipOptionsComponent extends React.Component<CategorySkipOptionsProps, CategorySkipOptionsState> {

    constructor(props: CategorySkipOptionsProps) {
        super(props);

        // Setup state
        this.state = {
            color: props.defaultColor || Config.config.barTypes[this.props.category]?.color,
            previewColor: props.defaultPreviewColor || Config.config.barTypes["preview-" + this.props.category]?.color,
        }
    }

    render(): React.ReactElement {
        let defaultOption = "disable";
        // Set the default opton properly
        for (const categorySelection of Config.config.categorySelections) {
            if (categorySelection.name === this.props.category) {
                switch (categorySelection.option) {
                    case CategorySkipOption.ShowOverlay:
                        defaultOption = "showOverlay";
                        break;
                    case CategorySkipOption.ManualSkip:
                        defaultOption = "manualSkip";
                        break;
                    case CategorySkipOption.AutoSkip:
                        defaultOption = "autoSkip";
                        break;
                }

                break;
            }
        }

        return (
            <>
                <tr id={this.props.category + "OptionsRow"}
                    className="categoryTableElement">
                    <td id={this.props.category + "OptionName"}
                        className="categoryTableLabel">
                            {chrome.i18n.getMessage("category_" + this.props.category)}
                    </td>

                    <td id={this.props.category + "SkipOption"}
                        className="skipOption">
                        <select
                            className="optionsSelector"
                            defaultValue={defaultOption}
                            onChange={this.skipOptionSelected.bind(this)}>
                                {this.getCategorySkipOptions()}
                        </select>
                    </td>
                    
                    <td id={this.props.category + "ColorOption"}
                        className="colorOption">
                        <input
                            className="categoryColorTextBox option-text-box"
                            type="color"
                            onChange={(event) => this.setColorState(event, false)}
                            value={this.state.color} />
                    </td>

                    <td id={this.props.category + "PreviewColorOption"}
                        className="previewColorOption">
                        <input
                            className="categoryColorTextBox option-text-box"
                            type="color"
                            onChange={(event) => this.setColorState(event, true)}
                            value={this.state.previewColor} />
                    </td>

                </tr>

                <tr id={this.props.category + "DescriptionRow"}
                    className="small-description categoryTableDescription">
                        <td
                            colSpan={2}>
                            {chrome.i18n.getMessage("category_" + this.props.category + "_description")}
                        </td>
                </tr>

            </>
        );
    }

    skipOptionSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        let option: CategorySkipOption;

        this.removeCurrentCategorySelection();

        switch (event.target.value) {
            case "disable": 
                return;
            case "showOverlay":
                option = CategorySkipOption.ShowOverlay;

                break;
            case "manualSkip":
                option = CategorySkipOption.ManualSkip;

                break;
            case "autoSkip":
                option = CategorySkipOption.AutoSkip;

                break;
        }

        Config.config.categorySelections.push({
            name: this.props.category,
            option: option
        });

        // Forces the Proxy to send this to the chrome storage API
        Config.config.categorySelections = Config.config.categorySelections;
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
        const elements: JSX.Element[] = [];

        const optionNames = ["disable", "showOverlay", "manualSkip", "autoSkip"];

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(optionName !== "disable" ? optionName + getCategoryActionType(this.props.category) 
                                                                     : optionName)}
                </option>
            );
        }

        return elements;
    }

    setColorState(event: React.FormEvent<HTMLInputElement>, preview: boolean): void {
        if (preview) {
            this.setState({
                previewColor: event.currentTarget.value
            });

            Config.config.barTypes["preview-" + this.props.category].color = event.currentTarget.value;

        } else {
            this.setState({
                color: event.currentTarget.value
            });

            Config.config.barTypes[this.props.category].color = event.currentTarget.value;
        }

        // Make listener get called
        Config.config.barTypes = Config.config.barTypes;
    }
}

export default CategorySkipOptionsComponent;