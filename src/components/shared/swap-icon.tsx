import type { SVGProps } from "react";

/**
 * The "switch" icon: two curved arrows chasing each other (the top one points right, the bottom one left).
 * Used wherever a press cycles to the next choice, and for Self Transfer.
 */
export function SwapArrowsIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...props}
    >
      {/* top arrow, curving up and over to the right */}
      <path d="M4.5 10.5C5.3 6.6 9.6 4.4 17.5 5" />
      <path d="M14.4 2.4 18 5l-3.2 3" />
      {/* bottom arrow, curving down and under to the left */}
      <path d="M19.5 13.5c-.8 3.9-5.1 6.1-13 5.5" />
      <path d="M9.6 21.6 6 19l3.2-3" />
    </svg>
  );
}
