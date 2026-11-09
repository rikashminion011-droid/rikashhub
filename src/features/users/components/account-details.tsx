import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CurrentUser } from "@/lib/auth/session";
import { CopyButton } from "./copy-button";

const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function formatWhen(iso: string | null): string {
  if (!iso) return "Not available";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Not available" : when.format(date);
}

/** Who is signed in. The password is shown masked: it is stored encrypted and cannot be read back. */
export function AccountDetails({ user }: { user: CurrentUser }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your account</CardTitle>
        <CardDescription>The login you use for this app.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y text-sm">
          <Row label="Name" value={user.name ?? "Not set"} />
          <Row label="Login ID" value={user.email} copy="login ID" />
          <Row label="User ID" value={user.id} mono copy="user ID" />
          <Row label="Password" value="••••••••••" note="Stored encrypted, so it can't be shown. You can change it below." />
          <Row label="Member since" value={formatWhen(user.createdAt)} />
          <Row label="Last sign-in" value={formatWhen(user.lastSignInAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono = false,
  copy,
  note,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        <div className="flex items-center gap-1">
          <span className={mono ? "truncate font-mono text-xs" : "truncate"} title={value}>
            {value}
          </span>
          {copy ? <CopyButton value={value} label={copy} /> : null}
        </div>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </dd>
    </div>
  );
}
