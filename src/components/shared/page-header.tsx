import type { ReactNode } from "react";

/**
 * A page starts directly with its data, filters and controls: no visible title or description. The title stays as a hidden
 * heading for screen readers, and the page's own actions (if it has any) sit in a quiet row at the right.
 */
export function PageHeader({
  title,
  actions,
}: {
  title: string;
  /** Kept so pages can still pass it; it is not shown. */
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {actions ? <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </>
  );
}
