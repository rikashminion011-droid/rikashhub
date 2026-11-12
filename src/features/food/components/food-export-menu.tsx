"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { defaultFileName, sanitizeFileName } from "../export";
import { monthsBetween } from "../pricing";

type Format = "xlsx" | "pdf";

const LABEL: Record<Format, string> = { xlsx: "Excel", pdf: "PDF" };

/**
 * Export the months on screen as PDF or Excel. Picking a format opens a box with the file name filled in,
 * so you can change it before downloading. The server adds .pdf or .xlsx itself.
 */
export function FoodExportMenu({ from, to, disabled }: { from: string; to: string; disabled?: boolean }) {
  const [format, setFormat] = useState<Format | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" disabled={disabled} />}>
          <Download /> <span className="hidden sm:inline">Export</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setFormat("pdf")}>
            <FileText /> Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat("xlsx")}>
            <FileSpreadsheet /> Export as Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={format !== null} onOpenChange={(open) => !open && setFormat(null)}>
        <DialogContent className="sm:max-w-md">
          {/* Mounted only while open, so the name box always starts from the default. */}
          {format ? <NameStep format={format} from={from} to={to} onDone={() => setFormat(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NameStep({ format, from, to, onDone }: { format: Format; from: string; to: string; onDone: () => void }) {
  const months = monthsBetween(from, to);
  const [name, setName] = useState(defaultFileName(months));
  const clean = sanitizeFileName(name);
  const query = new URLSearchParams({ format, from, to, name: clean ?? defaultFileName(months) });

  return (
    <form
      onSubmit={(e) => {
        // The download link does the work; Enter in the box presses it.
        e.preventDefault();
        (e.currentTarget.querySelector("a[download]") as HTMLAnchorElement | null)?.click();
      }}
    >
      <DialogHeader>
        <DialogTitle>Export as {LABEL[format]}</DialogTitle>
        <DialogDescription>Name the file, then download it. The extension (.{format}) is added for you.</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5 py-4">
        <label htmlFor="food-export-name" className="text-sm font-medium">File name</label>
        <div className="flex items-center gap-2">
          <Input id="food-export-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-10 flex-1 text-base sm:text-sm" />
          <span className="text-sm text-muted-foreground">.{format}</span>
        </div>
        {clean === null ? <p className="text-xs text-muted-foreground">Nothing usable in that name, so the default name will be used.</p> : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <a href={`/food/export?${query.toString()}`} download onClick={() => setTimeout(onDone, 150)} className={buttonVariants()}>
          <Download /> Download
        </a>
      </DialogFooter>
    </form>
  );
}
