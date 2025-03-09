import * as React from "react";

import Config from "../../config"
import * as CompileConfig from "../../../config.json";
import { Category, CategorySkipOption } from "../../types";

import { getCategorySuffix } from "../../utils/categoryUtils";
import ToggleOptionComponent from "./ToggleOptionComponent";

export interface CategorySkipOptionsProps { 
    category: Category;
    selectedChannel: string;
    defaultColor?: string;
    defaultPreviewColor?: string;
    children?: React.ReactNode;
}

export interface CategorySkipOptionsState {
    color: string;
    previewColor: string;
}

export interface ToggleOption {
    configKey: string;
    label: string;
    dontDisable?: boolean;
}

class CategorySkipOptionsComponent extends React.Component<CategorySkipOptionsProps, CategorySkipOptionsState> {
    setBarColorTimeout: NodeJS.Timeout;

    constructor(props: CategorySkipOptionsProps) {
        super(props);

        // Setup state
        this.state = {
            color: props.defaultColor || Config.config.barTypes[this.props.category]?.color,
            previewColor: props.defaultPreviewColor || Config.config.barTypes["preview-" + this.props.category]?.color
        };
    }

    render(): React.ReactElement {
        // Render the right settings based on whether we're configuring global or channel-specific
        let defaultOption;
        let categorySelections;
        if (this.props.selectedChannel == null) {
            defaultOption = "disable";
            categorySelections = Config.config.categorySelections;
        } else {
            defaultOption = "inherit";
            categorySelections = Config.config.channelSpecificSettings[this.props.selectedChannel].categorySelections;
        }
        // Set the default option properly
        for (const categorySelection of categorySelections) {
            if (categorySelection.name === this.props.category) {
                switch (categorySelection.option) {
                    case CategorySkipOption.Disabled:
                        defaultOption = "disable";
                        break;
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
                    className={`categoryTableElement`} >
                    <td id={this.props.category + "OptionName"}
                        className="categoryTableLabel">
                            {chrome.i18n.getMessage("category_" + this.props.category)}
                    </td>

                    <td id={this.props.category + "SkipOption"}
                        className="skipOption">
                        <select
                            className="optionsSelector"
                            key={this.props.selectedChannel} // This is why: https://stackoverflow.com/a/39239074
                            defaultValue={defaultOption}
                            onChange={this.skipOptionSelected.bind(this)}>
                                {this.getCategorySkipOptions()}
                        </select>
                    </td>

                    {this.props.category !== "chapter" && this.props.selectedChannel == null &&
                        <td id={this.props.category + "ColorOption"}
                            className="colorOption">
                            <input
                                className="categoryColorTextBox option-text-box"
                                type="color"
                                onChange={(event) => this.setColorState(event, false)}
                                value={this.state.color} />
                        </td>
                    }

                    {!["chapter", "exclusive_access"].includes(this.props.category) &&
                        <td id={this.props.category + "PreviewColorOption"}
                            className="previewColorOption">
                            <input
                                className="categoryColorTextBox option-text-box"
                                type="color"
                                onChange={(event) => this.setColorState(event, true)}
                                value={this.state.previewColor} />
                        </td>
                    }
                </tr>

                <tr id={this.props.category + "DescriptionRow"}
                    className={`small-description categoryTableDescription`}>
                        <td
                            colSpan={2}>
                            {chrome.i18n.getMessage("category_" + this.props.category + "_description")}
                            {' '}
                            <a href={CompileConfig.wikiLinks[this.props.category]} target="_blank" rel="noreferrer">
                                {`${chrome.i18n.getMessage("LearnMore")}`}
                            </a>
                        </td>
                </tr>
                
                {this.getExtraOptionComponents(this.props.category)}

            </>
        );
    }

    skipOptionSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        const categorySelections = this.props.selectedChannel == null ?
            Config.config.categorySelections :
            Config.config.channelSpecificSettings[this.props.selectedChannel].categorySelections;

        // Remove the existing category selection
        for (let i = 0; i < categorySelections.length; i++) {
            if (categorySelections[i].name === this.props.category) {
                categorySelections.splice(i, 1);

                Config.forceSyncUpdate("channelSpecificSettings");

                break;
            }
        }

        // Select the new option
        let option: CategorySkipOption;

        switch (event.target.value) {
            case "inherit":
                return;
            case "disable":
                Config.config.categorySelections = Config.config.categorySelections.filter(
                    categorySelection => categorySelection.name !== this.props.category);
                if (this.props.selectedChannel != null) {
                    option = CategorySkipOption.Disabled;
                    break;
                }
                return;
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

        const existingSelection = categorySelections.find(selection => selection.name === this.props.category);
        if (existingSelection) {
            existingSelection.option = option;
        } else {
            categorySelections.push({
                name: this.props.category,
                option: option
            });
        }

        Config.forceSyncUpdate("categorySelections");
        Config.forceSyncUpdate("channelSpecificSettings");
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        let optionNames = ["inherit", "disable", "showOverlay", "manualSkip", "autoSkip"];
        if (this.props.category === "chapter") optionNames = ["disable", "showOverlay"]
        else if (this.props.category === "exclusive_access") optionNames = ["inherit", "disable", "showOverlay"];

        for (const optionName of optionNames) {
            if (this.props.selectedChannel == null && optionName == "inherit")
                continue;
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(optionName !== "inherit" && optionName !== "disable" ?
                        optionName + getCategorySuffix(this.props.category) :
                        optionName)}
                </option>
            );
        }

        return elements;
    }

    setColorState(event: React.FormEvent<HTMLInputElement>, preview: boolean): void {
        clearTimeout(this.setBarColorTimeout);

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
        this.setBarColorTimeout = setTimeout(() => {
            Config.config.barTypes = Config.config.barTypes;
        }, 50);
    }

    getExtraOptionComponents(category: string): JSX.Element[] {
        const result = [];
        for (const option of this.getExtraOptions(category)) {
            result.push(
                <tr key={option.configKey}>
                    <td id={`${category}_${option.configKey}`} className="categoryExtraOptions">
                        <ToggleOptionComponent 
                            configKey={option.configKey} 
                            label={option.label}
                            style={{width: "inherit"}}
                        />
                    </td>
                </tr>
            )
        }

        return result;
    }

    getExtraOptions(category: string): ToggleOption[] {
        switch (category) {
            case "chapter":
                return [{
                    configKey: "renderSegmentsAsChapters",
                    label: chrome.i18n.getMessage("renderAsChapters"),
                    dontDisable: true
                }, {
                    configKey: "showSegmentNameInChapterBar",
                    label: chrome.i18n.getMessage("showSegmentNameInChapterBar"),
                    dontDisable: true
                }, {
                    configKey: "showAutogeneratedChapters",
                    label: chrome.i18n.getMessage("showAutogeneratedChapters"),
                    dontDisable: true
                }];
            case "music_offtopic":
                return [{
                    configKey: "autoSkipOnMusicVideos",
                    label: chrome.i18n.getMessage("autoSkipOnMusicVideos"),
                }];
            default:
                return [];
        }
    }
}

export default CategorySkipOptionsComponent;
