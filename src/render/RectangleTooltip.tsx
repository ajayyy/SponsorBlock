import * as React from "react";
import { createRoot, Root } from 'react-dom/client';

export interface RectangleTooltipProps {
    text: string; 
    link?: string;
    referenceNode: HTMLElement;
    prependElement?: HTMLElement; // Element to append before
    bottomOffset?: string;
    leftOffset?: string;
    timeout?: number;
    htmlId?: string;
    maxHeight?: string;
    maxWidth?: string;
    backgroundColor?: string;
    fontSize?: string;
    buttonFunction?: () => void;
}

export class RectangleTooltip {
    text: string;   
    container: HTMLDivElement;
    root: Root;
    timer: NodeJS.Timeout;
    
    constructor(props: RectangleTooltipProps) {
        props.bottomOffset ??= "0px";
        props.leftOffset ??= "0px";
        props.maxHeight ??= "100px";
        props.maxWidth ??= "300px";
        props.backgroundColor ??= "rgba(28, 28, 28, 0.7)";
        this.text = props.text;
        props.fontSize ??= "10px";

        this.container = document.createElement('div');
        props.htmlId ??= "sponsorRectangleTooltip" + props.text;
        this.container.id = props.htmlId;
        this.container.style.display = "relative";

        if (props.prependElement) {
            props.referenceNode.insertBefore(this.container, props.prependElement);
        } else {
            props.referenceNode.appendChild(this.container);
        }

        if (props.timeout) {
            this.timer = setTimeout(() => this.close(), props.timeout * 1000);
        }

        this.root = createRoot(this.container);
        this.root.render(
            <div style={{
                bottom: props.bottomOffset, 
                left: props.leftOffset,
                maxHeight: props.maxHeight,
                maxWidth: props.maxWidth,
                backgroundColor: props.backgroundColor,
                fontSize: props.fontSize}} 
                    className="sponsorBlockRectangleTooltip" >
                    <div>
                        <img className="sponsorSkipLogo sponsorSkipObject"
                            src={chrome.runtime.getURL("icons/IconSponsorBlocker256px.png")}>
                        </img>
                        <span className="sponsorSkipObject">
                            {this.text + (props.link ? ". " : "")}
                            {props.link ? 
                                <a style={{textDecoration: "underline"}} 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        href={props.link}>
                                    {chrome.i18n.getMessage("LearnMore")}
                                    </a> 
                            : null}
                        </span>
                    </div>
                    <button className="sponsorSkipObject sponsorSkipNoticeButton"
                        style ={{float: "right" }}
                        onClick={() => {
                            if (props.buttonFunction) props.buttonFunction();
                            this.close();
                        }}>

                        {chrome.i18n.getMessage("GotIt")}
                    </button>
            </div>
        )
    }

    close(): void {
        this.root.unmount();
        this.container.remove();

        if (this.timer) clearTimeout(this.timer);
    }
}