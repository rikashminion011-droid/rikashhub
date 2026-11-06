import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/brand-header";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="New Password" subtitle="Choose a new password for your hub" />
      <ResetPasswordForm />
    </>
  );
}
