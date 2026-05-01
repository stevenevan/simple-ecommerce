import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email({ error: 'Invalid email' }).trim().min(1, { error: 'Email is required' }).max(254, { error: 'Email too long' }),
  password: z.string().min(8, { error: 'At least 8 characters' }).max(200, { error: 'Password too long' }),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  email: z.email({ error: 'Invalid email' }).trim().min(1, { error: 'Email is required' }).max(254, { error: 'Email too long' }),
  name: z.string().trim().min(1, { error: 'Name is required' }).max(80, { error: 'Max 80 characters' }),
  password: z.string()
    .min(8, { error: 'At least 8 characters' })
    .regex(/[A-Za-z]/, { error: 'At least one letter' })
    .regex(/[0-9]/, { error: 'At least one digit' })
    .max(200, { error: 'Password too long' }),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const sessionUserSchema = z.object({
  id: z.int().positive(),
  email: z.email().max(254),
  name: z.string().min(1).max(80),
})
export type SessionUserParsed = z.infer<typeof sessionUserSchema>
