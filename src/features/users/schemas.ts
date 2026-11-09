import { z } from "zod";
import { newPassword } from "@/features/auth/schemas";

const personName = z.string().trim().min(1, "Enter a name.").max(60, "Use at most 60 characters.");

export const addPersonSchema = z.object({ name: personName });
export const renamePersonSchema = z.object({ id: z.uuid(), name: personName });
export const removePersonSchema = z.object({ id: z.uuid() });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(72, "Password is too long"),
    newPassword,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Choose a password different from your current one",
    path: ["newPassword"],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
