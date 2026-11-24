"use client";

import { CreditCard, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/finance";
import type { PortalActions } from "../actions";
import { utilization } from "../model";
import type { PortalRow } from "../server/service";

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * The top of the Credit Portal: choose a portal (or add a new one), see and edit its card information (total, used and balance
 * credit), and a bar showing how much of the limit is used.
 */
export function PortalHeader({ portals, active, actions }: { portals: PortalRow[]; active: PortalRow | null; actions: Pick<PortalActions, "addPortal" | "renamePortal" | "removePortal" | "setCardInfo"> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  function choose(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("portal", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const bar = active ? utilization(active.totalPaise, active.usedPaise) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label htmlFor="portal" className="sr-only">
            Portal
          </label>
          <select
            id="portal"
            value={active?.id ?? ""}
            onChange={(e) => (e.target.value === "__new" ? setAdding(true) : choose(e.target.value))}
            className="h-10 min-w-48 rounded-lg border border-input bg-background px-3 text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          >
            {portals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__new">+ Add New Portal</option>
          </select>
          {active ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Manage this portal" />}>
                <MoreVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRemoving(true)} className="text-destructive focus:text-destructive">
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {active ? (
          <Button type="button" variant="outline" onClick={() => setCardOpen(true)}>
            <CreditCard /> Card Information
          </Button>
        ) : null}
      </div>

      {active && bar ? <UtilizationBar portal={active} balancePaise={bar.balancePaise} onSetUp={() => setCardOpen(true)} /> : null}

      <AddPortalDialog
        open={adding}
        onOpenChange={setAdding}
        onAdd={async (name) => {
          const r = await actions.addPortal({ name });
          if (!r.ok) return r.error;
          toast.success(`${name} added.`);
          choose(r.id);
          setCardOpen(true); // a new portal asks for its card information straight away
          return null;
        }}
      />
      {active ? (
        <>
          <CardInfoDialog key={`${active.id}-${active.totalPaise}-${active.usedPaise}`} open={cardOpen} onOpenChange={setCardOpen} portal={active} setCardInfo={actions.setCardInfo} onSaved={() => router.refresh()} />
          <RenameDialog open={renaming} onOpenChange={setRenaming} current={active.name} onRename={async (name) => {
            const r = await actions.renamePortal({ id: active.id, name });
            if (!r.ok) return r.error;
            router.refresh();
            return null;
          }} />
          <ConfirmDialog
            open={removing}
            onOpenChange={setRemoving}
            title={`Delete ${active.name}?`}
            description="It disappears from the list. Its transactions are kept, and come back if you add the same portal again."
            confirmLabel="Delete portal"
            onConfirm={async () => {
              const r = await actions.removePortal({ id: active.id });
              if (!r.ok) return r.error;
              const other = portals.find((p) => p.id !== active.id);
              const next = new URLSearchParams(params.toString());
              if (other) next.set("portal", other.id);
              else next.delete("portal");
              router.replace(`${pathname}?${next.toString()}`);
              router.refresh();
              return null;
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function NameDialog({ open, onOpenChange, title, description, initial, label, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; initial: string; label: string; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!name.trim()) return setError("Enter a name.");
    setSaving(true);
    const problem = await onSave(name.trim());
    setSaving(false);
    if (problem) return setError(problem);
    setName(initial);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label htmlFor="portal-name" className="text-sm font-semibold">
              {label}
            </label>
            <Input id="portal-name" autoFocus maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} />
            {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const AddPortalDialog = ({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (name: string) => Promise<string | null> }) => (
  <NameDialog open={open} onOpenChange={onOpenChange} title="Add New Portal" description="A credit card or pay-later account, for example HDFC or Slice. You enter its card information next." initial="" label="Portal name" onSave={onAdd} />
);
const RenameDialog = ({ open, onOpenChange, current, onRename }: { open: boolean; onOpenChange: (o: boolean) => void; current: string; onRename: (name: string) => Promise<string | null> }) =>
  open ? <NameDialog open onOpenChange={onOpenChange} title="Rename portal" description="Its transactions keep following it." initial={current} label="Portal name" onSave={onRename} /> : null;

/** Card information: total credit, used credit and the balance (total minus used, worked out here). */
function CardInfoDialog({ open, onOpenChange, portal, setCardInfo, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; portal: PortalRow; setCardInfo: PortalActions["setCardInfo"]; onSaved: () => void }) {
  const [total, setTotal] = useState(portal.cardInfoSaved ? rupees(portal.totalPaise) : "");
  const [used, setUsed] = useState(portal.cardInfoSaved ? rupees(portal.usedPaise) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (t: string) => {
    const n = Number(t.replace(/,/g, "").trim() || "0");
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const totalPaise = num(total);
  const usedPaise = num(used);
  const balance = totalPaise !== null && usedPaise !== null ? totalPaise - usedPaise : null;

  async function save() {
    setSaving(true);
    setError(null);
    const r = await setCardInfo({ id: portal.id, total, used });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success(`${portal.name} card information saved.`);
    onOpenChange(false);
    onSaved();
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
        <Input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => { set(e.target.value); setError(null); }} className="h-10 pl-7 text-right text-base tabular-nums sm:text-sm" />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{portal.name}: Card Information</DialogTitle>
            <DialogDescription>Enter the total credit and what is used. The balance is worked out for you.</DialogDescription>
          </DialogHeader>
          {field("ci-total", "Total Credit", total, setTotal)}
          {field("ci-used", "Used Credit", used, setUsed)}
          <div className="space-y-1">
            <p className="text-sm font-semibold">Balance Credit</p>
            <p className="flex h-10 items-center justify-end rounded-lg bg-muted/50 px-3 font-semibold tabular-nums" aria-live="polite">
              {balance === null ? "—" : formatINR(balance)}
            </p>
            {balance !== null && balance < 0 ? <p className="text-xs text-destructive">Used credit is more than the total credit.</p> : null}
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The credit bar, in violet: the total limit, what is used, what is left and the percentage used, each value beside its label.
 * The bar is rounded and plain; a segment that is too small to hold text is labelled underneath, so nothing is ever unreadable.
 * Nothing used shows an empty bar, a full limit a full bar, and spending above the limit a full bar marked "over the limit".
 */
function UtilizationBar({ portal, balancePaise, onSetUp }: { portal: PortalRow; balancePaise: number; onSetUp: () => void }) {
  if (!portal.cardInfoSaved) {
    return (
      <button type="button" onClick={onSetUp} className="w-full rounded-2xl border border-dashed border-[#C4B5FD] py-4 text-sm text-[#5B21B6] hover:bg-[#EDE9FE]/50">
        Enter the card information to see the credit bar
      </button>
    );
  }
  const total = portal.totalPaise;
  const used = portal.usedPaise;
  const over = total > 0 && used > total;
  const rawPercent = total > 0 ? (used / total) * 100 : 0;
  const usedPercent = Math.min(100, Math.max(0, rawPercent));
  const shownPercent = (Math.round(rawPercent * 10) / 10).toFixed(1);
  const stat = (label: string, value: string, strong = false) => (
    <p className="flex items-baseline gap-1.5 text-sm">
      <span className="text-[#5B21B6]/80">{label}</span>
      <span className={strong ? "text-base font-semibold text-[#5B21B6] tabular-nums" : "font-semibold tabular-nums"}>{value}</span>
    </p>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-[#C4B5FD]/70 bg-white p-4" aria-label="Credit utilization">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
        {stat("Total Credit Limit", formatINR(total))}
        {stat("Used", formatINR(used), true)}
        {stat("Balance", over ? `−${formatINR(used - total)}` : formatINR(balancePaise))}
        {stat("Utilization", `${shownPercent}%`)}
      </div>
      <div className="flex h-9 w-full overflow-hidden rounded-full bg-[#EDE9FE]" role="img" aria-label={`Used ${formatINR(used)} of ${formatINR(total)}, ${shownPercent} percent${over ? ", over the limit" : ""}`}>
        <div className="flex min-w-0 items-center rounded-full bg-[#7C3AED] px-4 text-sm font-semibold whitespace-nowrap text-white tabular-nums" style={{ width: `${usedPercent}%`, minWidth: used > 0 ? "0.75rem" : 0 }}>
          {usedPercent >= 30 ? `${formatINR(used)} Used` : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end px-4 text-sm font-semibold whitespace-nowrap text-[#5B21B6] tabular-nums">{100 - usedPercent >= 18 ? `${(100 - usedPercent).toFixed(1)}%` : null}</div>
      </div>
      {usedPercent < 30 || 100 - usedPercent < 18 || over ? (
        <p className="flex flex-wrap gap-x-4 text-xs text-[#5B21B6] tabular-nums">
          <span>Used {formatINR(used)}</span>
          <span>Balance {over ? "0 (over the limit)" : formatINR(balancePaise)}</span>
        </p>
      ) : null}
    </div>
  );
}
