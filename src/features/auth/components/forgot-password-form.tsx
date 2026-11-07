"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/shared/form-field";
import { requestPasswordReset } from "../actions";
import { forgotPasswordSchema, type ForgotPasswordValues } from "../schemas";
import { AuthInput, AuthSubmit, authErrorClass } from "./auth-inputs";

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) setSent(result.message ?? "Check your email.");
      else setServerError(result.error);
    });
  });

  if (sent) {
    return (
      <div role="status" className="mt-7 space-y-4 rounded-3xl bg-neutral-50 p-6 text-center xl:mt-8">
        <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
        <p className="text-sm leading-relaxed text-neutral-700">{sent}</p>
        <Link href="/login" className="text-sm font-semibold text-neutral-950 underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="mt-7 space-y-5 xl:mt-8">
      <Field id="email" label="Email" error={errors.email?.message} hideLabel>
        <AuthInput
          id="email"
          type="email"
          icon={Mail}
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-message" : undefined}
          {...register("email")}
        />
      </Field>

      {serverError ? (
        <p role="alert" className={authErrorClass}>
          {serverError}
        </p>
      ) : null}

      <AuthSubmit disabled={pending}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        {pending ? "Sending…" : "Send Reset Link"}
      </AuthSubmit>

      <p className="text-center text-sm text-[#848484]">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-neutral-950 underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
