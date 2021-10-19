import * as React from "react";
import * as ReactDOM from "react-dom";

import Utils from "../utils";
const utils = new Utils();

import ControlPanelComponent from "../components/controlPanelComponent";
import { ContentContainer } from "../types";

class ControlPanel {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: () => unknown;

    callback: () => unknown;

    controlPanelElement: HTMLDivElement;

    controlPanelRef: React.MutableRefObject<ControlPanelComponent>;

    constructor(contentContainer: ContentContainer) {
        this.controlPanelRef = React.createRef();

        this.controlPanelElement = document.createElement("div");
        this.controlPanelElement.id = "controlPanelContainer";
        this.getReferenceNode().prepend(this.controlPanelElement);

        ReactDOM.render(
            <ControlPanelComponent contentContainer={contentContainer}
                ref={this.controlPanelRef} />,
            this.controlPanelElement
        );
    }

    update(): void {

    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.controlPanelElement);

        this.controlPanelElement.remove();
    }

    getReferenceNode(): HTMLElement {
        const parentNodes = document.querySelectorAll("#secondary");
        let parentNode = null;
        for (let i = 0; i < parentNodes.length; i++) {
            if (parentNodes[i].firstElementChild !== null) {
                parentNode = parentNodes[i];
            }
        }
        if (parentNode == null) {
            //old youtube theme
            parentNode = document.getElementById("watch7-sidebar-contents");
        }

        return parentNode;
    }
}

export default ControlPanel;