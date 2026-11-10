"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Downloads everything matching the current filters as Excel or PDF (not just the page on screen). */
export function ExportMenu({ query }: { query: string }) {
  const href = (format: "xlsx" | "pdf") => `/quick-pay/transactions/export?format=${format}${query ? `&${query}` : ""}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download /> Export
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
