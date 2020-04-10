import * as React from "react";

export interface NoticeTextSelectionProps {
    text: string,
    idSuffix: string
}

export interface NoticeTextSelectionState {

}

class NoticeTextSelectionComponent extends React.Component<NoticeTextSelectionProps, NoticeTextSelectionState> {

    constructor(props: NoticeTextSelectionProps) {
        super(props);
    }

    render() {
        return (
            <p id={"sponsorTimesInfoMessage" + this.props.idSuffix}
                className="sponsorTimesInfoMessage">
                    {this.props.text}
            </p>
        );
    }
}

export default NoticeTextSelectionComponent;