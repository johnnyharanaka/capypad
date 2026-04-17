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

export function CloudCheckIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M4.5 9.75a6 6 0 0111.573-2.226 3.75 3.75 0 014.133 4.303A4.5 4.5 0 0118 20.25H6.75a5.25 5.25 0 01-2.23-10.004 6.004 6.004 0 01-.02-.496zm6.97 3.97a.75.75 0 011.06 0l.97.97 2.47-2.47a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
