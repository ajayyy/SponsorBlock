import { VisualSegmentInfo } from "../types";
import { Svg, SVG } from "@svgdotjs/svg.js";

export function toSVG(visuals: VisualSegmentInfo[]): Svg {
    const svg = SVG().size(100, 100);

    for (const visual of visuals) {
        const path = svg.polygon();
        path.fill(visual.color);
        // path.stroke({
        //     width: 1,
        //     color: visual.color
        // });
        path.plot(visual.bounds);
    }

    console.log(svg.svg());

    return svg;
}

export function toVisualSegmentInfo(svgInput: string | Svg): VisualSegmentInfo {
    let svg = svgInput as Svg;
    if (typeof svgInput === "string") {
        svg = SVG().svg(svgInput);
    }

    throw new Error("Method not implemented.");
}