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

      {active && bar ? (
        <div className="space-y-2" aria-label="Credit utilization">
          <p className="text-sm">
            <span className="text-muted-foreground">Total Credit: </span>
            <span className="font-semibold tabular-nums">{active.cardInfoSaved ? formatINR(active.totalPaise) : "not set"}</span>
          </p>
          {active.cardInfoSaved ? (
            <div className="flex h-9 w-full overflow-hidden rounded-lg border bg-emerald-50 text-sm font-semibold" role="img" aria-label={`Used ${formatINR(active.usedPaise)} of ${formatINR(active.totalPaise)}; balance ${formatINR(bar.balancePaise)}`}>
              <div className="flex min-w-0 items-center justify-start bg-amber-500 px-3 whitespace-nowrap text-white tabular-nums" style={{ width: `${bar.usedPercent}%` }}>
                {bar.usedPercent >= 12 ? formatINR(active.usedPaise) : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end px-3 whitespace-nowrap text-emerald-800 tabular-nums">{100 - bar.usedPercent >= 12 ? formatINR(bar.balancePaise) : null}</div>
            </div>
          ) : (
            <button type="button" onClick={() => setCardOpen(true)} className="w-full rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted/40">
              Enter the card information to see the credit bar
            </button>
          )}
          {active.cardInfoSaved && (bar.usedPercent < 12 || 100 - bar.usedPercent < 12) ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              Used {formatINR(active.usedPaise)} · Balance {formatINR(bar.balancePaise)}
            </p>
          ) : null}
        </div>
      ) : null}

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
