import * as React from "react";

const copyPlusDownvoteSvg = ({
  fill = "#ffffff",
  opacity = "0",
  selectFill = "#ffffff"
  }): JSX.Element => (
    <svg 
        xmlns="http://www.w3.org/2000/svg"
        width="72"
        height="24"
        viewBox="0 0 72 24">
        <rect 
            x="0"
            y="0"
            width="72" 
            height="24" 
            rx="5"
            opacity={opacity}
            fill={selectFill}
        />
        <g transform="translate(0,0)">
            <path
                fill="none"
                d="M0 0h24v24H0V0z"/>
            <path 
                fill={fill}
                d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </g>
        <g transform="translate(24,0)">
            <path
                fill="none"
                d="M0 0h24v24H0V0z"/>
            <path 
                fill={fill}
                d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </g>
        <g transform="translate(48,0)">
            <path
                fill="none"
                d="M0 0h24v24H0z"></path>
            <path 
                fill={fill}
                d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"></path>
        </g>
    </svg>
);

export default copyPlusDownvoteSvg;