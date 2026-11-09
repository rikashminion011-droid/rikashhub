"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies `value` to the clipboard. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${label}`} onClick={copy}>
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
