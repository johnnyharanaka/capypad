import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function AlignLeftIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      {...props}
    >
      <rect x="1" y="2" width="12" height="1.5" rx=".5" />
      <rect x="1" y="5.5" width="8" height="1.5" rx=".5" />
      <rect x="1" y="9" width="12" height="1.5" rx=".5" />
    </svg>
  );
}

export function AlignCenterIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      {...props}
    >
      <rect x="1" y="2" width="12" height="1.5" rx=".5" />
      <rect x="3" y="5.5" width="8" height="1.5" rx=".5" />
      <rect x="1" y="9" width="12" height="1.5" rx=".5" />
    </svg>
  );
}

export function AlignRightIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      {...props}
    >
      <rect x="1" y="2" width="12" height="1.5" rx=".5" />
      <rect x="5" y="5.5" width="8" height="1.5" rx=".5" />
      <rect x="1" y="9" width="12" height="1.5" rx=".5" />
    </svg>
  );
}

export function AlignJustifyIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      {...props}
    >
      <rect x="1" y="2" width="12" height="1.5" rx=".5" />
      <rect x="1" y="5.5" width="12" height="1.5" rx=".5" />
      <rect x="1" y="9" width="12" height="1.5" rx=".5" />
    </svg>
  );
}
