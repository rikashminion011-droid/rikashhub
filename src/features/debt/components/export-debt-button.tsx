import { FileSpreadsheet, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Export as PDF or download as Excel: this recipient's transactions for the period and HDFC statement date on the page. */
export function ExportDebtButton({ partyId, query }: { partyId: string; query: string }) {
  const href = (format: "pdf" | "xlsx") => `/debt/${partyId}/export?format=${format}${query ? `&${query}` : ""}`;
  return (
    <div className="flex gap-2">
      <a href={href("pdf")} download className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileText /> Export as PDF
      </a>
      <a href={href("xlsx")} download className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileSpreadsheet /> Download Excel
      </a>
    </div>
  );
}
