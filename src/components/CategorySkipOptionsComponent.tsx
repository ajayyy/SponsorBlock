import * as React from "react";

import Config from "../config"
import { CategorySkipOption } from "../types";
import Utils from "../utils";

const utils = new Utils();

export interface CategorySkipOptionsProps { 
    category: string;
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
            color: props.defaultColor || Config.config.barTypes[this.props.category].color,
            previewColor: props.defaultPreviewColor || Config.config.barTypes["preview-" + this.props.category].color,
        }
    }

    render() {
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
                        onChange={this.skipOptionSelected.bind(this)}>
                            {this.getCategorySkipOptions()}
                    </select>
                </td>
                
                <td id={this.props.category + "ColorOption"}>
                    <input
                        className="categoryColorTextBox option-text-box"
                        type="text"
                        onChange={(event) => this.setColorState(event, false)}
                        value={this.state.color} />
                </td>

                <td id={this.props.category + "PreviewColorOption"}>
                    <input
                        className="categoryColorTextBox option-text-box"
                        type="text"
                        onChange={(event) => this.setColorState(event, true)}
                        value={this.state.previewColor} />
                </td>

                <td id={this.props.category + "SaveButton"}>
                    <div 
                        className="option-button trigger-button"
                        onClick={() => this.save()}>
                        {chrome.i18n.getMessage("save")}
                    </div>
                </td>

                
            </tr>
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
        let elements: JSX.Element[] = [];

        let optionNames = ["disable", "showOverlay", "manualSkip", "autoSkip"];

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(optionName)}
                </option>
            );
        }

        return elements;
    }

    setColorState(event: React.ChangeEvent<HTMLInputElement>, preview: boolean) {
        if (preview) {
            this.setState({
                previewColor: event.target.value
            });
        } else {
            this.setState({
                color: event.target.value
            });
        }
    }

    // Save text box data
    save() {
        // Validate colors
        let checkVar = [this.state.color, this.state.previewColor]
        for (const color of checkVar) {
            if (color[0] !== "#" || (color.length !== 7 && color.length !== 4) || !utils.isHex(color.slice(1))) {
                alert(chrome.i18n.getMessage("colorFormatIncorrect") + " " + color.slice(1) + " " + utils.isHex(color.slice(1)) + " " + utils.isHex("abcd123"));
                return;
            }
        }

        // Save colors
        Config.config.barTypes[this.props.category].color = this.state.color;
        Config.config.barTypes["preview-" + this.props.category].color = this.state.previewColor;
        // Make listener get called
        Config.config.barTypes = Config.config.barTypes;
    }
}

export default CategorySkipOptionsComponent;