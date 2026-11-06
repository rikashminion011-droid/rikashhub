import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be broken, or the page may have moved.
      </p>
      <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }))}>
        Go to dashboard
      </Link>
    </main>
  );
}
