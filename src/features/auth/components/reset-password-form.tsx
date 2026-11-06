"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/shared/form-field";
import { updatePassword } from "../actions";
import { resetPasswordSchema, type ResetPasswordValues } from "../schemas";
import { AuthPasswordInput, AuthSubmit, authErrorClass } from "./auth-inputs";

export function ResetPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      // On success the action redirects to the dashboard.
      if (result && !result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5 xl:mt-8">
      <Field
        id="password"
        label="New password"
        error={errors.password?.message}
        hint="At least 10 characters, with a letter and a number."
        hideLabel
      >
        <AuthPasswordInput
          id="password"
          autoComplete="new-password"
          placeholder="New password"
          aria-invalid={!!errors.password}
          aria-describedby="password-message"
          {...register("password")}
        />
      </Field>

      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message} hideLabel>
        <AuthPasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          placeholder="Confirm new password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? "confirmPassword-message" : undefined}
          {...register("confirmPassword")}
        />
      </Field>

      {serverError ? (
        <p role="alert" className={authErrorClass}>
          {serverError}{" "}
          {serverError.includes("expired") ? (
            <Link href="/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
          ) : null}
        </p>
      ) : null}

      <AuthSubmit disabled={pending}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        {pending ? "Saving…" : "Set New Password"}
      </AuthSubmit>
    </form>
  );
}
