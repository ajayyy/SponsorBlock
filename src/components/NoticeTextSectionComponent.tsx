import * as React from "react";

export interface NoticeTextSelectionProps {
    icon?: string,
    text: string,
    idSuffix: string,
    onClick?: (event: MouseEvent) => unknown
}

export interface NoticeTextSelectionState {

}

class NoticeTextSelectionComponent extends React.Component<NoticeTextSelectionProps, NoticeTextSelectionState> {

    constructor(props: NoticeTextSelectionProps) {
        super(props);
    }

    render(): React.JSX.Element {
        const style: React.CSSProperties = {};
        if (this.props.onClick) {
            style.cursor = "pointer";
            style.textDecoration = "underline"
        }

        return (
            <tr id={"sponsorTimesInfoMessage" + this.props.idSuffix}
                onClick={this.props.onClick}
                style={style}
                className="sponsorTimesInfoMessage">
                    
                <td>
                    {this.props.icon ? 
                        <img src={chrome.runtime.getURL(this.props.icon)} className="sponsorTimesInfoIcon" /> 
                    : null}

                    <span>
                        {this.getTextElements(this.props.text)}
                    </span>
                </td>
            </tr>
        );
    }

    private getTextElements(text: string): Array<string | React.JSX.Element> {
        const elements: Array<string | React.JSX.Element> = [];
        const textParts = text.split(/(?=\s+)/);
        for (const textPart of textParts) {
            if (textPart.match(/^\s*http/)) {
                elements.push(
                    <a href={textPart} target="_blank" rel="noreferrer">
                        {textPart}
                    </a>
                );
            } else {
                elements.push(textPart);
            }

        }

        return elements;
    }
}

export default NoticeTextSelectionComponent;