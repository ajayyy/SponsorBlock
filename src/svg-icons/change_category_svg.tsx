import * as React from "react";

const categoryChangeSvg = ({
  fill = "#ffffff",
  opacity = "0",
  selectFill = "#ffffff"
  }): JSX.Element => (
    <svg 
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="24"
        viewBox="0 0 48 24" 
        fill={fill}>
        <g>
            <rect 
                x="0"
                y="0"
                width="48" 
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
                    d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
	        </g>
	        <g transform="translate(24,0)">
		        <path 
                    fill="none"
                    d="M0 0h24v24H0V0z"/>
		        <path 
                    d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84z M17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5z m0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
	        </g>
        </g>
    </svg>
);

export default categoryChangeSvg;