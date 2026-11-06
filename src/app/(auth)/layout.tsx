import { Landmark, LineChart, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shared/logo";

const HIGHLIGHTS = [
  { icon: Landmark, text: "Accounts, cards, debts and savings in one ledger" },
  { icon: LineChart, text: "Every figure calculated from your own records" },
  { icon: ShieldCheck, text: "Your data is private: only you can see it" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between bg-zinc-950 p-10 text-zinc-50 lg:flex">
        <Logo inverted />
        <div className="max-w-md space-y-8">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Know where every rupee goes.
          </h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-zinc-300">
                <Icon className="mt-0.5 size-4 shrink-0 text-zinc-50" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-zinc-500">Personal finance management, in ₹.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <Logo className="lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
