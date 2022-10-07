import * as React from "react";
import { createRoot } from 'react-dom/client';

import CategoryChooserComponent from "../components/options/CategoryChooserComponent";

class CategoryChooser {

    ref: React.RefObject<CategoryChooserComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        const root = createRoot(element);
        root.render(
            <CategoryChooserComponent ref={this.ref} />
        );
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }
}

export default CategoryChooser;