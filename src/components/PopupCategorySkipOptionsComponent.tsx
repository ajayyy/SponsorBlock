import * as React from "react";

import Config from "../config"
import { Category, CategorySkipOption } from "../types";

import { getCategorySuffix } from "../utils/categoryUtils";

export interface PopupCategorySkipOptionsProps { 
    category: Category;
    channelID: string;
    deleteButton: HTMLElement;
}

class PopupCategorySkipOptionsComponent extends React.Component<PopupCategorySkipOptionsProps> {
    constructor(props: PopupCategorySkipOptionsProps) {
        super(props);
    }

    render(): React.ReactElement {
        let defaultOption = "global";
        // Set the default option properly
        if (Config.config.channelSpecificSettings?.[this.props.channelID]){
            for (const categorySelection of Config.config.channelSpecificSettings[this.props.channelID].categorySelections) {
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
                        case CategorySkipOption.Disabled:
                            defaultOption = "disable";
                    }
    
                    break;
                }
            }
        }

        return (
            <>
                <span id={this.props.category + "OptionsRow"}
                    className={"popupCategory"} >
                    <span id={this.props.category + "OptionName"}
                        className="categoryTableLabel">
                            {chrome.i18n.getMessage("category_" + this.props.category)}
                    </span>
                    <select
                        defaultValue={defaultOption}
                        onChange={this.skipOptionSelected.bind(this)}>
                            {this.getCategorySkipOptions()}
                    </select>

                </span>
            </>
        );
    }

    skipOptionSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        if (!Config.config.channelSpecificSettings[this.props.channelID]) {
            Config.config.channelSpecificSettings[this.props.channelID] = {
                toggle : true,
                categorySelections: []
            };
            this.props.deleteButton.classList.remove("hidden");
        }
        const channelSettings = Config.config.channelSpecificSettings[this.props.channelID];
        let option: CategorySkipOption;

        switch (event.target.value) {
            case "global":
                channelSettings.categorySelections = channelSettings.categorySelections.filter(
                    categorySelection => categorySelection.name !== this.props.category);
                Config.forceSyncUpdate("channelSpecificSettings");
                return;
            case "disable":
                option = CategorySkipOption.Disabled;

                break;
            case "showOverlay":
                option = CategorySkipOption.ShowOverlay;

                break;
            case "manualSkip":
                option = CategorySkipOption.ManualSkip;

                break;
            case "autoSkip":
                option = CategorySkipOption.AutoSkip;

                if (this.props.category === "filler" && !Config.config.isVip) {
                    if (!confirm(chrome.i18n.getMessage("FillerWarning"))) {
                        event.target.value = "disable";
                    }
                }

                break;
        }

        const existingSelection = channelSettings.categorySelections.find(selection => selection.name === this.props.category);
        if (existingSelection) {
            existingSelection.option = option;
        } else {
            channelSettings.categorySelections.push({
                name: this.props.category,
                option: option
            });
        }

        Config.forceSyncUpdate("channelSpecificSettings");
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        let optionNames = ["global", "disable", "showOverlay", "manualSkip", "autoSkip"];
        if (this.props.category === "chapter") optionNames = ["global", "disable", "showOverlay"]
        else if (this.props.category === "exclusive_access") optionNames = ["global", "disable", "showOverlay"];

        function optionToString(option: CategorySkipOption, category: Category) : string {
            let optionName = "disable";
            switch (option) {
                case CategorySkipOption.ShowOverlay:
                    optionName = "showOverlay";
                    break;
                case CategorySkipOption.ManualSkip:
                    optionName = "manualSkip";
                    break;
                case CategorySkipOption.AutoSkip:
                    optionName = "autoSkip";
                    break;
                default:
                    return `(${chrome.i18n.getMessage(optionName)})`;
            }
            return `(${chrome.i18n.getMessage( optionName + getCategorySuffix(category))})`;
        }

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {`${chrome.i18n.getMessage( (optionName !== "disable" && optionName !== "global") ? optionName + getCategorySuffix(this.props.category) 
                                                                     : optionName)} ${optionName === "global" ? (optionToString(Config.config.categorySelections.find(selection => selection.name === this.props.category)?.option, this.props.category)) : ""}`}
                </option>
            );
        }

        return elements;
    }
}

export default PopupCategorySkipOptionsComponent;