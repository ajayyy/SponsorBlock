import * as React from "react";

export interface TooltipProps {
    text: string;
    show: boolean;
}

export interface TooltipState {

}

class TooltipComponent extends React.Component<TooltipProps, TooltipState> {

    constructor(props: TooltipProps) {
        super(props);
    }

    render(): React.ReactElement {
        const style: React.CSSProperties = {
            display: this.props.show ? "flex" : "none",
            position: "absolute",
        }

        return (
            <span style={style}
                className={"sponsorBlockTooltip"} >
                <span className="sponsorBlockTooltipText">
                    {this.props.text}
                </span>
            </span>
        );
    }
}

export default TooltipComponent;
