"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Field } from "@/components/shared/form-field";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import type { UserActions } from "../actions";
import { changePasswordSchema, type ChangePasswordValues } from "../schemas";

export function ChangePasswordForm({ changePassword }: { changePassword: UserActions["changePassword"] }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setSaving(true);
    let result: Awaited<ReturnType<UserActions["changePassword"]>>;
    try {
      result = await changePassword(values);
    } catch {
      result = { ok: false, error: "Could not reach the server. Your password was not changed." };
    }
    setSaving(false);

    if (!result.ok) {
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        if (field === "currentPassword" || field === "newPassword" || field === "confirmPassword") setError(field, { message });
      }
      setServerError(result.error);
      return;
    }
    toast.success("Password updated. Other devices have been signed out.");
    reset();
  });

  return (
    // method="post": if this is submitted before the page finishes loading, never put passwords in the address bar.
    <form onSubmit={onSubmit} noValidate method="post" className="space-y-4">
      <Field id="currentPassword" label="Current password" error={errors.currentPassword?.message}>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          aria-describedby={errors.currentPassword ? "currentPassword-message" : undefined}
          {...register("currentPassword")}
        />
      </Field>

      <Field
        id="newPassword"
        label="New password"
        error={errors.newPassword?.message}
        hint="At least 10 characters, with a letter and a number."
      >
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          aria-describedby="newPassword-message"
          {...register("newPassword")}
        />
      </Field>

      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? "confirmPassword-message" : undefined}
          {...register("confirmPassword")}
        />
      </Field>

      {serverError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
