"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/shared/form-field";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signup } from "../actions";
import { signupSchema, type SignupValues } from "../schemas";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signup(values);
      if (!result) return; // redirected: signed in immediately
      if (result.ok) setConfirmation(result.message ?? "Check your email to continue.");
      else setServerError(result.error);
    });
  });

  if (confirmation) {
    return (
      <div role="status" className="space-y-4 rounded-xl border bg-muted/40 p-5">
        <CheckCircle2 className="size-6 text-success" />
        <p className="text-sm leading-relaxed">{confirmation}</p>
        <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field id="fullName" label="Full name" error={errors.fullName?.message}>
        <Input
          id="fullName"
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "fullName-message" : undefined}
          {...register("fullName")}
        />
      </Field>

      <Field id="email" label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-message" : undefined}
          {...register("email")}
        />
      </Field>

      <Field
        id="password"
        label="Password"
        error={errors.password?.message}
        hint="At least 10 characters, with a letter and a number."
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby="password-message"
          {...register("password")}
        />
      </Field>

      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
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

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
