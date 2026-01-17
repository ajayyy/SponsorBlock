import * as React from "react";
import { createRoot } from 'react-dom/client';

import { CategoryChooserComponent } from "../components/options/CategoryChooserComponent";

class CategoryChooser {

    constructor(element: Element) {
        const root = createRoot(element);
        root.render(
            <CategoryChooserComponent />
        );
    }
}

export default CategoryChooser;