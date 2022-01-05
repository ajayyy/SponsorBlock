import * as React from "react";
import Config from "../config";
import { SponsorTime } from "../types";

export interface CategoryPillProps {

}

export interface CategoryPillState {
    segment?: SponsorTime;
    show: boolean;
}

class CategoryPillComponent extends React.Component<CategoryPillProps, CategoryPillState> {

    constructor(props: CategoryPillProps) {
        super(props);

        this.state = {
            segment: null,
            show: false
        };
    }

    render(): React.ReactElement {
        const style: React.CSSProperties = {
            backgroundColor: Config.config.barTypes["preview-" + this.state.segment?.category]?.color,
            display: this.state.show ? "flex" : "none"
        }

        return (
            <span style={style}
                className="sponsorBlockCategoryPill" >
                <span className="sponsorBlockCategoryPillTitleSection">
                    <img className="sponsorSkipLogo sponsorSkipObject"
                        src={chrome.extension.getURL("icons/IconSponsorBlocker256px.png")}>
                    </img>
                    <span className="sponsorBlockCategoryPillTitle">
                        {chrome.i18n.getMessage("category_" + this.state.segment?.category)}
                    </span>
                </span>
            </span>
        );
    }
}

export default CategoryPillComponent;
