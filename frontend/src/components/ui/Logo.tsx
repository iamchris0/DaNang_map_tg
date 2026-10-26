/** Brand mark: a house in the brand colour, with an optional wordmark. */
export function Logo({ withWordmark = true, label }: { withWordmark?: boolean; label: string }) {
  return (
    <span className="text-accent flex items-center gap-1.5">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" fill="currentColor">
        <path d="M16 3.5 3 14.2l2 2.4 2-1.6V27a2 2 0 0 0 2 2h5.5v-7.5h3V29H23a2 2 0 0 0 2-2V15l2 1.6 2-2.4z" />
      </svg>
      {withWordmark ? (
        <span className="text-xl font-extrabold tracking-tight">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
