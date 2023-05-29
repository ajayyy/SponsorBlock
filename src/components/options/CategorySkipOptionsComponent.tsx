import * as React from "react";

import Config from "../../config"
import * as CompileConfig from "../../../config.json";
import { Category, CategorySkipOption } from "../../types";

import { getCategorySuffix } from "../../utils/categoryUtils";
import ToggleOptionComponent from "./ToggleOptionComponent";

export interface CategorySkipOptionsProps { 
    category: Category;
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
                    className={`categoryTableElement`} >
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

                    {this.props.category !== "chapter" &&
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
        let option: CategorySkipOption;

        switch (event.target.value) {
            case "disable":
                Config.config.categorySelections = Config.config.categorySelections.filter(
                    categorySelection => categorySelection.name !== this.props.category);
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

        const existingSelection = Config.config.categorySelections.find(selection => selection.name === this.props.category);
        if (existingSelection) {
            existingSelection.option = option;
        } else {
            Config.config.categorySelections.push({
                name: this.props.category,
                option: option
            });
        }

        Config.forceSyncUpdate("categorySelections");
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        let optionNames = ["disable", "showOverlay", "manualSkip", "autoSkip"];
        if (this.props.category === "chapter") optionNames = ["disable", "showOverlay"]
        else if (this.props.category === "exclusive_access") optionNames = ["disable", "showOverlay"];

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(optionName !== "disable" ? optionName + getCategorySuffix(this.props.category) 
                                                                     : optionName)}
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