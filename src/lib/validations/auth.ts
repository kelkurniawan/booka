import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email wajib diisi")
  .max(254, "Email terlalu panjang")
  .toLowerCase()
  .pipe(z.email("Format email tidak valid"));

/**
 * Supabase menyimpan password memakai bcrypt, yang memotong input di 72 byte.
 * Batas atas dipasang eksplisit supaya karakter setelahnya tidak diam-diam
 * diabaikan — merchant bisa mengira password-nya lebih kuat dari kenyataan.
 */
const password = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter");

export const emailSchema = z.object({ email });

export const signUpSchema = z.object({ email, password });

/**
 * Saat masuk, panjang password tidak divalidasi ulang. Aturan minimum bisa
 * berubah seiring waktu, dan menolak password lama di sisi klien hanya akan
 * membuat merchant mengira akunnya hilang.
 */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password wajib diisi"),
});

export const newPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, "Ulangi password baru"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Password tidak sama",
    path: ["confirmPassword"],
  });

export type EmailInput = z.infer<typeof emailSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
