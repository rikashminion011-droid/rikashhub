import type { Metadata } from "next";
import { ModuleStatus } from "@/components/shared/module-status";

export const metadata: Metadata = { title: "Slice" };

export default function Page() {
  return <ModuleStatus href="/slice" />;
}
