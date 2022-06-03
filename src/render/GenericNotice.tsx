import * as React from "react";
import * as ReactDOM from "react-dom";
import NoticeComponent from "../components/NoticeComponent";

import Utils from "../utils";
const utils = new Utils();

import { ContentContainer } from "../types";
import NoticeTextSelectionComponent from "../components/NoticeTextSectionComponent";

export interface ButtonListener {
    name: string,
    listener: (e?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
}

export interface TextBox {
    icon: string,
    text: string
}

export interface NoticeOptions {
    title: string,
    textBoxes?: TextBox[],
    buttons?: ButtonListener[],
    fadeIn?: boolean,
    timed?: boolean
    style?: React.CSSProperties;
    extraClass?: string;
}

export default class GenericNotice {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    noticeElement: HTMLDivElement;
    noticeRef: React.MutableRefObject<NoticeComponent>;
    idSuffix: string;

    constructor(contentContainer: ContentContainer, idSuffix: string, options: NoticeOptions) {
        this.noticeRef = React.createRef();
        this.idSuffix = idSuffix;

        this.contentContainer = contentContainer;

        const referenceNode = utils.findReferenceNode();
    
        this.noticeElement = document.createElement("div");
        this.noticeElement.id = "sponsorSkipNoticeContainer" + idSuffix;

        referenceNode.prepend(this.noticeElement);

        this.update(options);        
    }

    update(options: NoticeOptions): void {
        ReactDOM.render(
            <NoticeComponent
                noticeTitle={options.title}
                idSuffix={this.idSuffix}
                fadeIn={options.fadeIn ?? true}
                timed={options.timed ?? true}
                ref={this.noticeRef}
                style={options.style}
                extraClass={options.extraClass}
                closeListener={() => this.close()} >
                    
                    {this.getMessageBox(this.idSuffix, options.textBoxes)}

                    <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                        className="sponsorBlockSpacer">
                    </tr>

                    <tr className="sponsorSkipNoticeRightSection"
                        style={{position: "relative"}}>
                        <td>
                            {this.getButtons(options.buttons)}
                        </td>
                    </tr>
            </NoticeComponent>,
            this.noticeElement
        );
    }

    getMessageBox(idSuffix: string, textBoxes: TextBox[]): JSX.Element[] { 
        if (textBoxes) {
            const result = [];
            for (let i = 0; i < textBoxes.length; i++) {
                result.push(
                    <NoticeTextSelectionComponent idSuffix={idSuffix}
                        key={i}
                        icon={textBoxes[i].icon}
                        text={textBoxes[i].text} />
                )
            }

            return result;
        } else {
            return null;
        }
    }

    getButtons(buttons?: ButtonListener[]): JSX.Element[] {
        if (buttons) {
            const result: JSX.Element[] = [];

            for (const button of buttons) {
                result.push(
                    <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            key={button.name}
                            onClick={(e) => button.listener(e)}>

                            {button.name}
                    </button>
                )
            }

            return result;
        } else {
            return null;
        }
    }

    close(): void {
        ReactDOM.unmountComponentAtNode(this.noticeElement);

        this.noticeElement.remove();
    }
}