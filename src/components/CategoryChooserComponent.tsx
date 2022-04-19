import * as React from "react";

import * as CompileConfig from "../../config.json";
import { Category, CategorySkipOption } from "../types";
import CategorySkipOptionsComponent from "./CategorySkipOptionsComponent";
import Config from "../config";

export interface CategoryChooserProps { 

}

export interface CategoryChooserState {
    selectedChannel: string
}

class CategoryChooserComponent extends React.Component<CategoryChooserProps, CategoryChooserState> {

    constructor(props: CategoryChooserProps) {
        super(props);

        // Set the selected channel from the part of the document hash after the slash
        const hashSlashIndex = document.location.hash.indexOf("/");
        let selectedChannel = hashSlashIndex > -1 ? document.location.hash.slice(hashSlashIndex + 1) : null;

        const channelSpecificSettings = Config.config.channelSpecificSettings;
        if (channelSpecificSettings[selectedChannel] == undefined)
            selectedChannel = null;

        // Setup state
        this.state = {
            selectedChannel: selectedChannel
        }
    }

    render(): React.ReactElement {
        return (
            <>
                {this.getChannelSettings()}
                <table id="categoryChooserTable"
                       className="categoryChooserTable">
                    <tbody>
                    {/* Headers */}
                    <tr id={"CategoryOptionsRow"}
                        className="categoryTableElement categoryTableHeader">
                        <th id={"CategoryOptionName"}>
                            {chrome.i18n.getMessage("category")}
                        </th>

                        <th id={"CategorySkipOption"}
                            className="skipOption">
                            {chrome.i18n.getMessage("skipOption")}
                        </th>

                        { // Colour options are only available when configuring global skip settings
                            this.state.selectedChannel == null &&
                            <>
                                <th id={"CategoryColorOption"}
                                    className="colorOption">
                                    {chrome.i18n.getMessage("seekBarColor")}
                                </th>

                                <th id={"CategoryPreviewColorOption"}
                                    className="previewColorOption">
                                    {chrome.i18n.getMessage("previewColor")}
                                </th>
                            </>
                        }
                    </tr>

                    {this.getCategorySkipOptions()}
                    </tbody>
                </table>
            </>
        );
    }

    // Renders the channel chooser and associated buttons
    getChannelSettings(): JSX.Element {
        const channelSpecificSettings = Config.config.channelSpecificSettings;
        const channelOptions = [];
        for (const channelID in channelSpecificSettings) {
            channelOptions.push({
                name: channelSpecificSettings[channelID].name,
                element: <option value={channelID}>{
                    channelSpecificSettings[channelID].name ? channelSpecificSettings[channelID].name : channelID
                }</option>
            });
        }
        channelOptions.sort((a, b) => {
            return ('' + a.name).localeCompare(b.name);
        });

        return (
            <>
                <select id="channelChooser"
                        className="optionsSelector inline"
                        style={{verticalAlign: "middle"}}
                        defaultValue={this.state.selectedChannel == null ? "global" : this.state.selectedChannel}
                        onChange={this.channelSelected.bind(this)}>
                    <option value="global">- Global Settings -</option>
                    {channelOptions.map((channelOption) => { return channelOption.element; })}
                </select>
                {
                    this.state.selectedChannel != null &&
                    <>
                        <div id="removeChannelSelections"
                            className="option-button inline"
                            style={{marginLeft: "5px", padding: "5px", verticalAlign: "middle"}}
                            onClick={this.removeSelectedChannel.bind(this)}>
                            {chrome.i18n.getMessage("removeChannelSettingsButton")}
                        </div>
                        {
                            !Config.config.forceChannelCheck &&
                            <span className="inline"
                                  style={{marginLeft: "5px"}}>
                                {chrome.i18n.getMessage("forceChannelCheckRequired")}</span>
                        }
                    </>
                }
            </>
        );
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        for (const category of CompileConfig.categoryList) {
            elements.push(
                <CategorySkipOptionsComponent category={category as Category}
                    selectedChannel={this.state.selectedChannel}
                    key={category}>
                </CategorySkipOptionsComponent>
            );
        }

        return elements;
    }

    // Called when a channel is selected in the channel chooser
    channelSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        if (event.target.value == "global") {
            document.location.hash = "behavior";
            this.setState({selectedChannel: null});
        } else {
            document.location.hash = "behavior/" + event.target.value;
            this.setState({selectedChannel: event.target.value});
        }
    }

    // Removes *all* the selected channel's settings from `channelSpecificSettings`
    removeSelectedChannel(): void {
        delete Config.config.channelSpecificSettings[this.state.selectedChannel];
        this.setState({selectedChannel: null});

        Config.config.channelSpecificSettings = Config.config.channelSpecificSettings;
    }
}

export default CategoryChooserComponent;
