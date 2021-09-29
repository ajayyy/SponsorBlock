import * as React from "react";
import Config from "../config";
import { ContentContainer, VisualSegmentInfo } from "../types";
import Utils from "../utils";


const utils = new Utils();

export interface VisualSegmentEditProps {
    index: number,

    visual: VisualSegmentInfo,

    idSuffix: string,
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer,
}

export interface VisualSegmentEditState {

}

class VisualSegmentEditComponent extends React.Component<VisualSegmentEditProps, VisualSegmentEditState> {

    idSuffix: string;

    configUpdateListener: () => void;

    constructor(props: VisualSegmentEditProps) {
        super(props);

        this.idSuffix = this.props.idSuffix;

        this.state = {
        };
    }

    componentDidMount(): void {
        // Add as a config listener
        if (!this.configUpdateListener) {
            this.configUpdateListener = () => this.configUpdate();
            Config.configListeners.push(this.configUpdate.bind(this));
        }
    }

    componentWillUnmount(): void {
        if (this.configUpdateListener) {
            Config.configListeners.splice(Config.configListeners.indexOf(this.configUpdate.bind(this)), 1);
        }
    }

    render(): React.ReactElement {
        return <>
            <span id={`time${this.props.idSuffix}`}>
                {utils.getFormattedTime(this.props.visual.time, true)}
            </span>

            <span>
                -
            </span>

            {this.getBoundsElement()}

            <span>
                -
            </span>

            <input
                type="checkBox"
                onChange={(event) => this.colorUpdated(event)}
                value={this.props.visual.color} 
            />

            <span>
                Smooth
            </span>

            <span>
                -
            </span>

            <input
                className="categoryColorTextBox"
                type="color"
                onChange={(event) => this.colorUpdated(event)}
                value={this.props.visual.color} 
            />


        </>
    }

    getBoundsElement(): React.ReactElement[] {
        const elements: React.ReactElement[] = [];

        for (const bound of this.props.visual.bounds) {
            elements.push(
                <span>
                    {`${bound[0] * 100}% x ${bound[0] * 100}%, `}
                </span>
            );
        }

        return elements;
    }

    colorUpdated(event: React.ChangeEvent<HTMLInputElement>): void {
        this.props.visual.color = event.target.value;
    }

    configUpdate(): void {
        this.forceUpdate();
    }
}

export default VisualSegmentEditComponent;
