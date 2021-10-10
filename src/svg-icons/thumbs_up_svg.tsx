import * as React from "react";

const thumbsUpSvg = ({
  fill = "#ffffff"
  }): JSX.Element => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill={fill}
      viewBox="0 0 24 24"
      >
      <path
        fill="none"
        d="M0 0h24v24H0V0z"></path>
      <path
          d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
      ></path>
    </svg>
  );

export default thumbsUpSvg;
