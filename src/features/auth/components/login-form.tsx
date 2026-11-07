"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/shared/form-field";
import { login } from "../actions";
import { loginSchema, type LoginValues } from "../schemas";
import { AuthCheckbox, AuthInput, AuthPasswordInput, AuthSubmit, authErrorClass } from "./auth-inputs";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: false },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await login(values, next);
      // On success the action redirects, so a returned value is always a failure.
      if (result && !result.ok) setServerError(result.error);
    });
  });

  return (
    // method="post": if the form is submitted before the page finishes loading, the browser must
    // never fall back to a GET that puts the email and password in the address bar.
    <form onSubmit={onSubmit} noValidate method="post" className="mt-7 space-y-5 xl:mt-8">
      {notice ? (
        <p role="status" className="rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-700">
          {notice}
        </p>
      ) : null}

      <Field id="email" label="Email or Username" error={errors.email?.message} hideLabel>
        <AuthInput
          id="email"
          type="email"
          icon={Mail}
          autoComplete="email"
          inputMode="email"
          placeholder="Email or Username"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-message" : undefined}
          {...register("email")}
        />
      </Field>

      <Field id="password" label="Password" error={errors.password?.message} hideLabel>
        <AuthPasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-message" : undefined}
          {...register("password")}
        />
      </Field>

      <div className="flex items-center justify-between gap-4">
        <AuthCheckbox label="Remember me" {...register("remember")} />
        <Link
          href="/forgot-password"
          className="text-sm font-semibold whitespace-nowrap text-neutral-950 underline-offset-4 hover:underline sm:text-[0.95rem] xl:text-[clamp(0.9rem,1.2vw,1.3rem)]"
        >
          Forgot password?
        </Link>
      </div>

      {serverError ? (
        <p role="alert" className={authErrorClass}>
          {serverError}
        </p>
      ) : null}

      <AuthSubmit disabled={pending}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        {pending ? "Logging in…" : "Log In"}
      </AuthSubmit>

      <p className="text-center text-sm text-[#848484]">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-neutral-950 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
