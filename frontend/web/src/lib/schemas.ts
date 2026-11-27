import { z } from 'zod'

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name so officials know who is reporting.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(6, 'At least 6 characters.'),
})

export const signinSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export const reportTitleSchema = z.string().trim().min(3, 'Title must be at least 3 characters.')
export const reportDescriptionSchema = z
  .string()
  .trim()
  .min(10, 'Description must be at least 10 characters.')
  .max(5000, 'Keep the description under 5,000 characters.')
export const reportDetailsSchema = z.object({
  title: reportTitleSchema,
  description: reportDescriptionSchema,
})

export const PHONE_NUMBER_HINT =
  'Please enter your full phone number with country code, e.g. 220XXXXXXX'
export const phoneNumberSchema = z.string().regex(/^\d{9,15}$/, PHONE_NUMBER_HINT)

export const trackNumberSchema = z.string().trim().min(1, 'Enter your tracking number.')

export function firstIssue(schema: z.ZodType, value: unknown): string | null {
  const result = schema.safeParse(value)
  return result.success ? null : (result.error.issues[0]?.message ?? null)
}
