import {
  CalendarClock,
  CreditCard,
  Flag,
  HandCoins,
  Landmark,
  Layers,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** What the module will do. Shown on the module page until it is built. */
  planned: string[];
}

/** The nine modules, in sidebar order. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Your whole financial picture at a glance.",
    planned: [
      "Income, expenses, savings, debt, card dues, EMIs and available balance",
      "Spending trends, category breakdown and repayment progress",
      "Date filters from today to all time, all calculated from your records",
    ],
  },
  {
    title: "Credit Cards",
    href: "/credit-cards",
    icon: CreditCard,
    description: "Balances, limits, statements and due dates for every card.",
    planned: [
      "Multiple cards with masked numbers (CVV and PIN are never stored)",
      "Credit utilisation, statements, minimum and total due",
      "Payment history, reminders and card-wise spending",
    ],
  },
  {
    title: "Monthly Due",
    href: "/monthly-due",
    icon: CalendarClock,
    description: "Every bill and EMI due this month, in one place.",
    planned: [
      "Rent, utilities, subscriptions, insurance, EMIs and card bills",
      "Recurring dues generated automatically, with partial payments",
      "Calendar and list views with reminders",
    ],
  },
  {
    title: "Slice",
    href: "/slice",
    icon: Layers,
    description: "Track your Slice account and repayments.",
    planned: [
      "Transactions, outstanding amount and repayment status",
      "Upcoming dues and balance reconciliation",
      "Built so other credit-line accounts can be added later",
    ],
  },
  {
    title: "Debt Management",
    href: "/debt",
    icon: HandCoins,
    description: "Money you owe and money owed to you.",
    planned: [
      "Loans, borrowed and lent money, with interest",
      "Partial payments, remaining principal and repayment progress",
      "Separate Money I Owe and Money Owed to Me sections",
    ],
  },
  {
    title: "Card Management",
    href: "/accounts",
    icon: Landmark,
    description: "Bank accounts, cash, wallets and debit cards.",
    planned: [
      "Balances for bank accounts, cash, wallets and other accounts",
      "Linked debit cards and per-account transaction history",
      "Connected to Quick Entry so balances update automatically",
    ],
  },
  {
    title: "Milestones",
    href: "/milestones",
    icon: Flag,
    description: "Savings goals with progress you can see.",
    planned: [
      "Goals such as a vehicle, house, emergency fund or trip",
      "Percentage complete, amount remaining and monthly target",
      "Completed goals archive",
    ],
  },
  {
    title: "Savings",
    href: "/savings",
    icon: PiggyBank,
    description: "Savings accounts, deposits and growth.",
    planned: [
      "Multiple savings accounts and an emergency fund",
      "Deposits, withdrawals and interest",
      "Savings growth, linked to your milestones",
    ],
  },
];

/** The Quick Pay group, shown under the nine modules. */
export const QUICK_PAY_ITEMS: readonly NavItem[] = [
  {
    title: "Quick Entry",
    href: "/quick-pay",
    icon: Zap,
    description: "Record a credit or debit in seconds.",
    planned: [],
  },
  {
    title: "GPay Transactions",
    href: "/quick-pay/transactions",
    icon: ReceiptText,
    description: "Every Quick Pay entry, with filters, balances and export.",
    planned: [],
  },
];

/** Shown below the modules, under "Account". */
export const ACCOUNT_ITEM: NavItem = {
  title: "User",
  href: "/user",
  icon: UserRound,
  description: "Your account, your password and the people you add expenses for.",
  planned: [],
};

const ALL_ITEMS: readonly NavItem[] = [...NAV_ITEMS, ...QUICK_PAY_ITEMS, ACCOUNT_ITEM];

/** The item for a path. When several match (/quick-pay and /quick-pay/transactions) the most specific one wins. */
export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_ITEMS.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
