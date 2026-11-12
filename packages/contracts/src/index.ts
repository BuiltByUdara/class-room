import { z } from 'zod';
export const roles = ['admin', 'teacher', 'student', 'parent'] as const;
export type Role = typeof roles[number];
export const emailSchema = z.string().trim().email().max(254).transform(v => v.toLowerCase());
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(72, 'Use at most 72 characters').refine(v => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 UTF-8 bytes');
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 UTF-8 bytes') }).strict();
export const resetRequestSchema = z.object({ email: emailSchema }).strict();
export const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema }).strict();
export const inviteSchema = z.object({ name: z.string().trim().min(2).max(100), email: emailSchema, role: z.enum(roles) }).strict();
export interface PublicUser { id: string; name: string; email: string; role: Role }
export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface SessionData { user: PublicUser }
export const permissionMatrix = {
  admin: ['users:manage', 'academics:manage', 'reports:all'],
  teacher: ['academics:manage', 'reports:classes'],
  student: ['quizzes:attempt', 'progress:self'],
  parent: ['progress:children'],
} as const;
export const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record ID');
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(100).optional(), role: z.enum(roles).optional(), status: z.enum(['active','inactive','invited','archived']).optional() }).strict();
export const userUpdateSchema = z.object({ name: z.string().trim().min(2).max(100), role: z.enum(roles), status: z.enum(['active','inactive','invited']) }).strict();
export const profileSchema = z.object({ studentNumber: z.string().trim().min(1).max(40), grade: z.number().int().min(1).max(13), school: z.string().trim().max(150) }).strict();
export const relationshipSchema = z.object({ parentId: idSchema, studentId: idSchema }).strict();
export const classSchema = z.object({ name: z.string().trim().min(2).max(100), subject: z.string().trim().min(2).max(80), grade: z.number().int().min(1).max(13), teacherId: idSchema, status: z.enum(['active','archived']).default('active') }).strict();
export const batchSchema = z.object({ name: z.string().trim().min(2).max(100), schedule: z.string().trim().min(2).max(200), timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, 'Invalid timezone'), status: z.enum(['active','archived']).default('active') }).strict();
export const enrollmentSchema = z.object({ studentId: idSchema, batchId: idSchema.nullable() }).strict();
export interface Page<T> { items: T[]; meta: { page: number; limit: number; total: number } }
export interface Member extends PublicUser { status: 'active'|'inactive'|'invited' }
export interface StudentProfileData { studentNumber: string; grade?: number; school?: string }
export interface ClassData { id: string; name: string; subject: string; grade: number; teacherId: string; status: 'active'|'archived' }
export interface BatchData { id: string; classId: string; name: string; schedule: string; timezone: string; status: 'active'|'archived' }
export interface EnrollmentData { id: string; studentId: string; studentName: string; batchId: string|null; status: string }
export interface RelationshipData { id: string; parent: Member; student: Member }
export interface WorkspaceStats { classes: number; students: number; batches: number; users?: number; children?: number }
