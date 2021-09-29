// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
import { createSVGWindow } from "svgdom";
import { registerWindow } from "@svgdotjs/svg.js";

import { toSVG } from "../src/utils/visualUtils";

beforeAll(() => {
    const window = createSVGWindow();
    registerWindow(window, window.document)
})

test("Visual Segment SVG converter", async () => {
    toSVG([{
        time: 0,
        bounds: [[0, 0], [25, 0], [25, 40], [0, 30]],
        smooth: false,
        curve: "linear",
        color: "#000000",
    }]);
});