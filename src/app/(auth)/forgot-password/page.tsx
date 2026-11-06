import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/brand-header";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Forgot Password?" subtitle="We will email you a link to reset it" />
      <ForgotPasswordForm />
    </>
  );
}
