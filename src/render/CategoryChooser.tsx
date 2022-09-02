import * as React from "react";
import * as ReactDOM from "react-dom";
import CategoryChooserComponent from "../components/options/CategoryChooserComponent";

class CategoryChooser {

    ref: React.RefObject<CategoryChooserComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        ReactDOM.render(
            <CategoryChooserComponent ref={this.ref} />,
            element
        );
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }
}

export default CategoryChooser;