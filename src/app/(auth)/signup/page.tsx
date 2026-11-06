import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/brand-header";
import { SignupForm } from "@/features/auth/components/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <AuthHeading title="Create Account" subtitle="Start your personal hub" />
      <SignupForm />
    </>
  );
}
