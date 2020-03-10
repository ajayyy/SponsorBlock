import * as React from "react";

export interface NoticeTextSelectionProps {
    text: string,
    idSuffix: string
}

export interface NoticeTextSelectionState {

}

class NoticeTextSelectionComponent extends React.Component<NoticeTextSelectionProps, NoticeTextSelectionState> {
    countdownInterval: NodeJS.Timeout;
    idSuffix: any;

    amountOfPreviousNotices: number;

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