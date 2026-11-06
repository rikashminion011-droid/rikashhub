"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <TriangleAlert className="size-8 text-warning" aria-hidden />
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We could not load this page. Your data is safe. Try again, and if it keeps happening, reload the app.
      </p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
