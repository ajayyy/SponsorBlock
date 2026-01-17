import * as React from "react";

export interface CheckIconProps {
  id?: string;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

const CheckIcon = ({
  id = "",
  className = "",
  style = {},
  onClick
}: CheckIconProps): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    style={style}
    id={id}
    onClick={onClick} >
    <path d="M20.3 2L9 13.6l-5.3-5L0 12.3 9 21 24 5.7z"/>
  </svg>
);

export default CheckIcon;