"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Downloads everything matching the current filters as Excel or PDF (not just the page on screen). */
export function ExportMenu({ query, iconOnly = false }: { query: string; /** Just the icon, for the toolbar. */ iconOnly?: boolean }) {
  const href = (format: "xlsx" | "pdf") => `/quick-pay/transactions/export?format=${format}${query ? `&${query}` : ""}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={iconOnly ? <button type="button" title="Export" aria-label="Export" className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" /> : <Button variant="outline" />}>
        <Download className={iconOnly ? "size-5" : undefined} /> {iconOnly ? null : "Export"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem render={<a href={href("xlsx")} download />}>
          <FileSpreadsheet /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={href("pdf")} download />}>
          <FileText /> PDF report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
