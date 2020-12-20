import * as React from "react";

export interface NoticeTextSelectionProps {
    text: string,
    idSuffix: string,
    onClick?: (event: React.MouseEvent) => unknown
}

export interface NoticeTextSelectionState {

}

class NoticeTextSelectionComponent extends React.Component<NoticeTextSelectionProps, NoticeTextSelectionState> {

    constructor(props: NoticeTextSelectionProps) {
        super(props);
    }

    render(): React.ReactElement {
        const style: React.CSSProperties = {};
        if (this.props.onClick) {
            style.cursor = "pointer";
            style.textDecoration = "underline"
        }

        return (
            <p id={"sponsorTimesInfoMessage" + this.props.idSuffix}
                onClick={this.props.onClick}
                style={style}
                className="sponsorTimesInfoMessage">
                    {this.props.text}
            </p>
        );
    }
}

export default NoticeTextSelectionComponent;