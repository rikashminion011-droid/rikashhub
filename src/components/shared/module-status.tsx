import { Check } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findNavItem } from "@/config/navigation";

/**
 * Shown for a module whose screens are not built yet. It describes what the module will do
 * and carries no buttons or numbers, so nothing here pretends to work.
 */
export function ModuleStatus({ href }: { href: string }) {
  const item = findNavItem(href);
  if (!item) return null;
  const Icon = item.icon;

  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="space-y-1">
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>
                <Badge variant="secondary">Not built yet</Badge>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">This module will include:</p>
          <ul className="space-y-2.5">
            {item.planned.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
