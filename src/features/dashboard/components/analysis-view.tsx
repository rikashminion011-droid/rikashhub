import Link from "next/link";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { VIEWS, type Analysis, type ViewKey } from "../analysis";

/** The Dashboard analysis: a selector for the page to analyse, then its bars. The period filter above applies to every view. */
export function AnalysisView({ view, analysis, hrefFor }: { view: ViewKey; analysis: Analysis; hrefFor: (view: ViewKey) => string }) {
  return (
    <section className="space-y-4" aria-labelledby="analysis">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="analysis" className="text-sm font-semibold">
          Analysis
        </h2>
        <nav aria-label="Choose the analysis" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted p-0.5">
          {VIEWS.map((v) => (
            <Link key={v.key} href={hrefFor(v.key)} scroll={false} aria-current={v.key === view ? "page" : undefined} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium", v.key === view ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {v.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-sm text-muted-foreground">{analysis.caption}</p>
      {analysis.groups.map((g) => (
        <div key={g.heading} className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground">{g.heading}</h3>
          {g.bars.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing recorded in this period.</p> : g.ordered ? <Columns bars={g.bars} /> : <Rows bars={g.bars} />}
        </div>
      ))}
    </section>
  );
}

/** Horizontal bars, one row each, the biggest first. */
function Rows({ bars }: { bars: Analysis["groups"][number]["bars"] }) {
  const max = Math.max(...bars.map((b) => b.valuePaise), 1);
  return (
    <ul className="space-y-2.5">
      {bars.map((b) => {
        const label = b.href ? (
          <Link href={b.href} className="underline-offset-4 hover:underline">
            {b.label}
          </Link>
        ) : (
          b.label
        );
        return (
          <li key={b.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{label}</span>
              <span className="shrink-0 tabular-nums">
                {formatINR(b.valuePaise)}
                {b.note ? <span className="ml-2 text-xs text-muted-foreground">{b.note}</span> : null}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-primary/15" role="img" aria-label={`${b.label} ${formatINR(b.valuePaise)}`}>
              <div className="relative h-full rounded-full bg-primary/40" style={{ width: `${Math.max(2, (Math.max(b.valuePaise, 0) / max) * 100)}%` }}>
                {b.insidePaise ? <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, (b.insidePaise / Math.max(b.valuePaise, 1)) * 100))}%` }} /> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical columns in date order (a day-by-day view). Scrolls sideways when there are many days. */
function Columns({ bars }: { bars: Analysis["groups"][number]["bars"] }) {
  const max = Math.max(...bars.map((b) => b.valuePaise), 1);
  return (
    <div className="overflow-x-auto pb-1">
      <ul className="flex h-40 items-end gap-1.5" style={{ minWidth: `${bars.length * 1.75}rem` }}>
        {bars.map((b) => (
          <li key={b.label} className="flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1" title={`${b.label}: ${formatINR(b.valuePaise)}`}>
            <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(3, (b.valuePaise / max) * 100)}%` }} />
            <span className="text-[10px] text-muted-foreground tabular-nums">{b.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
