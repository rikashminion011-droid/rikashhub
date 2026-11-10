import { DatabaseZap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown instead of a page's content when the database cannot be reached, so nothing looks saved when it is not. */
export function DatabaseUnavailable() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <DatabaseZap className="size-4" aria-hidden />
          </span>
          <CardTitle>Can&apos;t reach the database</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Nothing you enter here would be saved right now, so this page is hidden.</p>
        <p>
          Check that <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> is correct and that the database certificate is set up, then reload.
        </p>
      </CardContent>
    </Card>
  );
}
