import * as React from "react";
import Config from "../config";
import * as CompileConfig from "../../config.json";

const categoryDotsSvg = ({
    opacity = "0",
    selectFill = "#ffffff"
    }): JSX.Element => {
        const radius = 8;
        const dotSize = 2;
        return (
            <svg
            className="categoryDotsTurn"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24">
                {...getcircles(radius, dotSize)}
            </svg>
        );
};

function getcircles(radius: number, dotSize: number): JSX.Element[] {
    const colors = new Array(8);
    colors[0] = Config.config.barTypes.sponsor.color
    colors[1] = Config.config.barTypes.intro.color
    colors[2] = Config.config.barTypes.preview.color
    colors[3] = Config.config.barTypes.outro.color
    colors[4] = Config.config.barTypes.interaction.color
    colors[5] = Config.config.barTypes.poi_highlight.color
    colors[6] = Config.config.barTypes.music_offtopic.color
    colors[7] = Config.config.barTypes.selfpromo.color
    //colors[8] = "#ffffff";
    //colors[9] = "#000000";

    const elements = new Array(8);
    const fraction = 360 / colors.length;

    for (let i = 0; i < colors.length; i++) {
        elements[i] = (
            <circle
            key={i}
            transform={`rotate(${i * fraction}, 12, 12)`}
            fill={colors[i]}
            cx={(12 + radius)}
            cy={radius}
            r={dotSize}/>
        );
    }

    return elements;
}

export default categoryDotsSvg;
