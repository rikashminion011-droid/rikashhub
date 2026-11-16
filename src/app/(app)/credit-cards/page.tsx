import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import {
  addPortalAction,
  addRecipientAction,
  deleteStatementEntryAction,
  deleteUnbilledAction,
  importStatementAction,
  removePortalAction,
  renamePortalAction,
  saveUnbilledBulkAction,
  setCardInfoAction,
  updateStatementEntryAction,
  updateUnbilledAction,
} from "@/features/credit-portal/actions";
import { PortalHeader } from "@/features/credit-portal/components/portal-header";
import { StatementTab } from "@/features/credit-portal/components/statement-tab";
import { UnbilledTab } from "@/features/credit-portal/components/unbilled-tab";
import { hdfcCycle, isHdfcPortal } from "@/features/credit-portal/model";
import { listPortals, listStatement, listUnbilled } from "@/features/credit-portal/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { istDateOf, monthBounds } from "@/features/quick-pay/datetime";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Credit Portal" };

const TABS = [
  { key: "unbilled", label: "Unbilled" },
  { key: "statement", label: "Statement" },
  { key: "autopay", label: "Auto Pay" },
  { key: "emi", label: "EMI" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export default async function CreditPortalPage({ searchParams }: PageProps<"/credit-cards">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = istDateOf(new Date());

  // The period: custom From/To, else a month (the current one to begin with).
  const rawFrom = one(params.from);
  const rawTo = one(params.to);
  const rawMonth = one(params.month);
  let range: { from: string | null; to: string | null };
  // Nothing chosen: a month, except for HDFC, which opens on its own 16th to 15th cycle (decided once the portal is known).
  const explicit = isDate(rawFrom) || isDate(rawTo) || isMonth(rawMonth);
  if (isDate(rawFrom) || isDate(rawTo)) range = { from: isDate(rawFrom) ? rawFrom : null, to: isDate(rawTo) ? rawTo : null };
  else {
    const b = monthBounds(isMonth(rawMonth) ? rawMonth : today.slice(0, 7));
    range = { from: b?.from ?? null, to: b?.to ?? null };
  }
  const tabParam = one(params.tab);
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "unbilled";

  let data;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const [portals, options] = await Promise.all([listPortals(db, user.id), getQuickPayOptions(db, user.id)]);
    const active = portals.find((p) => p.id === one(params.portal)) ?? portals[0] ?? null;
    if (!explicit && active && isHdfcPortal(active.name)) range = hdfcCycle(today);
    const [unbilled, statement] = active
      ? await Promise.all([tab === "unbilled" ? listUnbilled(db, user.id, active.id, range) : Promise.resolve([]), tab === "statement" ? listStatement(db, user.id, active.id, range) : Promise.resolve(null)])
      : [[], null];
    data = { portals, options, active, unbilled, statement };
  } catch (error) {
    console.error("[credit-portal] could not load", error);
    return (
      <>
        <PageHeader title="Credit Portal" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { portals, options, active, unbilled, statement } = data;
  const defaultRange = active && isHdfcPortal(active.name) ? hdfcCycle(today) : undefined;
  const q = new URLSearchParams();
  if (active) q.set("portal", active.id);
  if (isDate(rawFrom)) q.set("from", rawFrom);
  if (isDate(rawTo)) q.set("to", rawTo);
  if (!q.has("from") && !q.has("to") && isMonth(rawMonth)) q.set("month", rawMonth);
  const tabHref = (key: TabKey) => `/credit-cards?${new URLSearchParams({ ...Object.fromEntries(q), tab: key }).toString()}`;
  const exportHref = (key: "unbilled" | "statement") => {
    const e = new URLSearchParams({ portal: active?.id ?? "", tab: key });
    if (range.from) e.set("from", range.from);
    if (range.to) e.set("to", range.to);
    return `/credit-cards/export?${e.toString()}`;
  };
  const people = options.persons.map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <PageHeader title="Credit Portal" description="Unbilled transactions and bank statements for each credit portal." />
      <div className="space-y-5">
        <PortalHeader portals={portals} active={active} actions={{ addPortal: addPortalAction, renamePortal: renamePortalAction, removePortal: removePortalAction, setCardInfo: setCardInfoAction }} />

        {active ? (
          <>
            <nav aria-label="Credit portal sections" className="flex gap-1 overflow-x-auto border-b">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={tabHref(t.key)}
                  aria-current={t.key === tab ? "page" : undefined}
                  className={cn("-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium", t.key === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                  {t.label}
                </Link>
              ))}
            </nav>

            {tab === "unbilled" ? (
              <UnbilledTab
                key={active.id}
                portalId={active.id}
                rows={unbilled}
                people={people}
                actions={{ saveUnbilledBulk: saveUnbilledBulkAction, updateUnbilled: updateUnbilledAction, deleteUnbilled: deleteUnbilledAction }}
                addPerson={addRecipientAction}
                today={today}
                defaultRange={defaultRange}
                exportHref={exportHref("unbilled")}
              />
            ) : null}
            {tab === "statement" && statement ? (
              <StatementTab
                key={active.id}
                portalId={active.id}
                portalName={active.name}
                rows={statement.rows}
                totals={statement.totals}
                people={people}
                categories={options.categories}
                creditCategories={options.creditCategories}
                actions={{ importStatement: importStatementAction, updateStatementEntry: updateStatementEntryAction, deleteStatementEntry: deleteStatementEntryAction, setCardInfo: setCardInfoAction }}
                addPerson={addRecipientAction}
                today={today}
                defaultRange={defaultRange}
                exportHref={exportHref("statement")}
              />
            ) : null}
            {tab === "autopay" || tab === "emi" ? (
              <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                {tab === "autopay" ? "Auto Pay" : "EMI"} will be added once its details are decided.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
