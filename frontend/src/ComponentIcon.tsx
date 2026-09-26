import type { Kind } from "./model";
export function ComponentIcon({ kind }: { kind: Kind }) {
  return (
    <svg
      width="28"
      height="25"
      viewBox="0 0 32 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {kind === "rect" ? (
        <rect x="6" y="5" width="20" height="18" fill="var(--ctp-surface1)" />
      ) : kind === "circle" ? (
        <circle cx="16" cy="14" r="10" fill="var(--ctp-surface1)" />
      ) : kind === "surface" ? (
        <>
          <path d="M 3 12 H 29 M 4 12 l -3 5 M 10 12 l -4 5 M 16 12 l -4 5 M 22 12 l -4 5 M 28 12 l -4 5" />
        </>
      ) : kind === "rod" ? (
        <path d="M 4 19 L 28 9" strokeWidth="5" />
      ) : kind === "bearing" ? (
        <>
          <circle cx="16" cy="14" r="7" fill="var(--ctp-base)" />
          <circle cx="16" cy="14" r="1.5" fill="var(--ctp-text)" />
        </>
      ) : kind === "pulley" ? (
        <>
          <circle cx="16" cy="14" r="11" fill="var(--ctp-surface1)" />
          <circle cx="16" cy="14" r="8" />
          <path d="M 16 3 V 25 M 5 14 H 27" />
          <circle cx="16" cy="14" r="2" fill="var(--ctp-base)" />
        </>
      ) : kind === "spring" ? (
        <path d="M 2 14 H 6 l 2 -6 l 4 12 l 4 -12 l 4 12 l 4 -12 l 2 6 H 30" />
      ) : kind === "rope" ? (
        <path d="M 4 22 L 28 6" />
      ) : (
        <>
          <path d="M 4 23 L 27 5 M 17 6 L 27 5 L 25 15" />
          {kind === "acceleration" && <path d="M 6 27 L 26 11" />}
          {kind === "force" && <circle cx="5" cy="22" r="2" fill="var(--ctp-text)" />}
        </>
      )}
    </svg>
  );
}
