import * as React from "react";
import * as ReactDOM from "react-dom";
import CategoryChooserComponent from "../components/options/CategoryChooserComponent";

class CategoryChooser {

    constructor(element: Element) {
        ReactDOM.render(
            <CategoryChooserComponent/>,
            element
        );
    }
}

export default CategoryChooser;