import * as React from "react";

export interface AddIconProps {
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

const ResetIcon = ({
  className = "",
  style = {},
  onClick
}: AddIconProps): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    style={style}
    onClick={onClick} >
    <path
      d="M 23.993883,23.993883 H 0.006117 V 0.006117 h 23.987766 z"
      fill="none"
      id="path2"
      style={{strokeWidth: 0.99949}} />
    <path
      d="m 3.508834,3.5213414 c -2.1778668,2.1778667 -3.52964574,5.1668007 -3.52964574,8.4861686 0,6.638738 5.37707764,12.000795 12.01581474,12.000795 6.638737,0 12.015814,-5.362057 12.015814,-12.000795 0,-5.6023732 -3.830041,-10.273521 -9.011861,-11.61028034 V 3.5213414 c 3.499607,1.2316209 6.007907,4.5660093 6.007907,8.4861686 0,4.971544 -4.040317,9.011861 -9.01186,9.011861 -4.9715438,0 -9.0118611,-4.040317 -9.0118611,-9.011861 0,-2.4932821 1.0363647,-4.7162068 2.6735186,-6.3383421 L 10.493026,10.505534 V -0.00830443 H -0.02081174 Z"
      id="path4"
      style={{strokeWidth: 1.50198}} />
  </svg>
);

export default ResetIcon;