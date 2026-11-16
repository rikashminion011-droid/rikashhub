import type { Metadata } from "next";
import { FoodGridPage } from "@/features/food/components/food-grid-page";

export const metadata: Metadata = { title: "Food Rent" };

export default async function FoodRentPage({ searchParams }: PageProps<"/food-rent">) {
  return <FoodGridPage title="Food Rent" description="The same food records as Monthly Food Tracking, kept in step automatically." params={await searchParams} />;
}
