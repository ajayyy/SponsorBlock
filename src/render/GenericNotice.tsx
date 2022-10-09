import * as React from "react";
import { createRoot, Root } from 'react-dom/client';
import NoticeComponent from "../components/NoticeComponent";

import Utils from "../utils";
const utils = new Utils();

import { ButtonListener, ContentContainer } from "../types";
import NoticeTextSelectionComponent from "../components/NoticeTextSectionComponent";

export interface TextBox {
    icon: string;
    text: string;
}

export interface NoticeOptions {
    title: string;
    referenceNode?: HTMLElement;
    textBoxes?: TextBox[];
    buttons?: ButtonListener[];
    fadeIn?: boolean;
    timed?: boolean;
    style?: React.CSSProperties;
    extraClass?: string;
    maxCountdownTime?: () => number;
    dontPauseCountdown?: boolean;
    hideLogo?: boolean;
    hideRightInfo?: boolean;
}

export default class GenericNotice {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    noticeElement: HTMLDivElement;
    noticeRef: React.MutableRefObject<NoticeComponent>;
    idSuffix: string;
    root: Root;

    constructor(contentContainer: ContentContainer, idSuffix: string, options: NoticeOptions) {
        this.noticeRef = React.createRef();
        this.idSuffix = idSuffix;

        this.contentContainer = contentContainer;

        const referenceNode = options.referenceNode ?? utils.findReferenceNode();
    
        this.noticeElement = document.createElement("div");
        this.noticeElement.id = "sponsorSkipNoticeContainer" + idSuffix;

        referenceNode.prepend(this.noticeElement);

        this.root = createRoot(this.noticeElement);

        this.update(options);
    }

    update(options: NoticeOptions): void {
        this.root.render(
            <NoticeComponent
                noticeTitle={options.title}
                idSuffix={this.idSuffix}
                fadeIn={options.fadeIn ?? true}
                timed={options.timed ?? true}
                ref={this.noticeRef}
                style={options.style}
                extraClass={options.extraClass}
                maxCountdownTime={options.maxCountdownTime}
                dontPauseCountdown={options.dontPauseCountdown}
                hideLogo={options.hideLogo}
                hideRightInfo={options.hideRightInfo}
                closeListener={() => this.close()} >
                    {options.textBoxes?.length > 0 ?
                        <tr id={"sponsorSkipNoticeMiddleRow" + this.idSuffix}
                            className="sponsorTimeMessagesRow"
                            style={{maxHeight: this.contentContainer ? (this.contentContainer().v.offsetHeight - 200) + "px" : null}}>
                            <td style={{width: "100%"}}>
                                {this.getMessageBoxes(this.idSuffix, options.textBoxes)}
                            </td>
                        </tr>
                    : null}

                    {!options.hideLogo ?
                        <>
                            <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                                className="sponsorBlockSpacer">
                            </tr>

                            <tr className="sponsorSkipNoticeRightSection"
                                style={{position: "relative"}}>
                                <td>
                                    {this.getButtons(options.buttons)}
                                </td>
                            </tr>
                        </>
                    : null}

            </NoticeComponent>
        );
    }

    getMessageBoxes(idSuffix: string, textBoxes: TextBox[]): JSX.Element[] { 
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
        this.root.unmount();

        this.noticeElement.remove();
    }
}