import type { Metadata } from "next";
import { FoodGridPage } from "@/features/food/components/food-grid-page";

export const metadata: Metadata = { title: "Monthly Food Tracking" };

export default async function FoodPage({ searchParams }: PageProps<"/food">) {
  return <FoodGridPage title="Monthly Food Tracking" description="Every meal saved from Quick Entry, day by day, with its amount." params={await searchParams} />;
}
