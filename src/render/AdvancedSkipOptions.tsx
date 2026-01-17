import * as React from "react";
import { createRoot } from 'react-dom/client';

import { AdvancedSkipOptionsComponent } from "../components/options/AdvancedSkipOptionsComponent";

class AdvancedSkipOptions {
    constructor(element: Element) {
        const root = createRoot(element);
        root.render(
            <AdvancedSkipOptionsComponent />
        );
    }
}

export default AdvancedSkipOptions;