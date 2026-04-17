import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" {...props}>
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
      />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
