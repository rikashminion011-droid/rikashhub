"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Mail, User } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/shared/form-field";
import { signup } from "../actions";
import { signupSchema, type SignupValues } from "../schemas";
import { AuthInput, AuthPasswordInput, AuthSubmit, authErrorClass } from "./auth-inputs";

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
      <div role="status" className="mt-7 space-y-4 rounded-3xl bg-neutral-50 p-6 text-center xl:mt-8">
        <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
        <p className="text-sm leading-relaxed text-neutral-700">{confirmation}</p>
        <Link href="/login" className="text-sm font-semibold text-neutral-950 underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate method="post" className="mt-7 space-y-5 xl:mt-8">
      <Field id="fullName" label="Full name" error={errors.fullName?.message} hideLabel>
        <AuthInput
          id="fullName"
          icon={User}
          autoComplete="name"
          placeholder="Full name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "fullName-message" : undefined}
          {...register("fullName")}
        />
      </Field>

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

      <Field
        id="password"
        label="Password"
        error={errors.password?.message}
        hint="At least 10 characters, with a letter and a number."
        hideLabel
      >
        <AuthPasswordInput
          id="password"
          autoComplete="new-password"
          placeholder="Password"
          aria-invalid={!!errors.password}
          aria-describedby="password-message"
          {...register("password")}
        />
      </Field>

      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message} hideLabel>
        <AuthPasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          placeholder="Confirm password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? "confirmPassword-message" : undefined}
          {...register("confirmPassword")}
        />
      </Field>

      {serverError ? (
        <p role="alert" className={authErrorClass}>
          {serverError}
        </p>
      ) : null}

      <AuthSubmit disabled={pending}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        {pending ? "Creating account…" : "Create Account"}
      </AuthSubmit>

      <p className="text-center text-sm text-[#848484]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-neutral-950 underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
