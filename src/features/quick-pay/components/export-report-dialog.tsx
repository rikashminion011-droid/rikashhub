"use client";

import { ExternalLink, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Characters a file name may not hold become "-"; ".pdf" or ".xlsx" typed at the end is dropped (it is added again). */
const cleanName = (name: string) =>
  name
    .trim()
    .replace(/\.(pdf|xlsx?|csv)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();

/**
 * Export Report: asks for a file name, lists the filters that are applied, and downloads exactly those transactions (every
 * page of them, not only the page on screen) as a PDF or an Excel file. The filters are printed in the file's heading.
 */
export function ExportReportDialog({ query, filters, count, defaultName }: { query: string; filters: string[]; count: number; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const file = cleanName(name);
  const href = (format: "xlsx" | "pdf") => `/quick-pay/transactions/export?format=${format}&name=${encodeURIComponent(file)}${query ? `&${query}` : ""}`;
  const link = "flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(defaultName);
      }}
    >
      <DialogTrigger render={<button type="button" title="Export Report" aria-label="Export Report" className="flex size-10 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <ExternalLink className="size-5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction History Report</DialogTitle>
          <DialogDescription>
            {count} transaction{count === 1 ? "" : "s"} with the filters now applied.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">File name</Label>
            <Input id="report-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-10 text-base sm:text-sm" />
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">The report holds the transactions with these filters:</p>
            {filters.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {filters.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">No filters: every transaction.</p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
          <a href={file ? href("pdf") : undefined} download aria-disabled={!file} onClick={() => file && setOpen(false)} className={cn(link, "border border-input bg-background hover:bg-muted", !file && "pointer-events-none opacity-50")}>
            <FileText className="size-4 text-red-600" aria-hidden /> Download as PDF
          </a>
          <a href={file ? href("xlsx") : undefined} download aria-disabled={!file} onClick={() => file && setOpen(false)} className={cn(link, "bg-primary text-primary-foreground hover:bg-primary/90", !file && "pointer-events-none opacity-50")}>
            <FileSpreadsheet className="size-4" aria-hidden /> Download as Excel
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
