import * as React from "react";

const visibilitySvg = ({
  fill = "#ffffff",
  opacity = "0",
  selectFill = "#ffffff"
  }): JSX.Element => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={fill}
      >
      <rect 
        x="0"
        y="0" 
        rx="5"
        opacity={opacity}
        fill={selectFill}
        height="24" 
        width="24" 
      />
      <path fill="none"
        d="M0 0h24v24H0V0z" />
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
    </svg>
  );

export default visibilitySvg;
