import type { ClientSession, FilterQuery } from 'mongoose';
import type { PublicUser, ClassData, BatchData } from '@tuition/contracts';
import { Class, Batch, Enrollment, ParentStudentRelationship } from '../../db/models.js';
import { HttpError } from '../../lib/errors.js';
export const classDto = (c: InstanceType<typeof Class>): ClassData => ({ id: c.id, name: c.name, subject: c.subject, grade: c.grade, teacherId: String(c.teacher), status: c.status as ClassData['status'] });
export const batchDto = (b: InstanceType<typeof Batch>): BatchData => ({ id: b.id, classId: String(b.class), name: b.name, schedule: b.schedule, timezone: b.timezone, status: b.status as BatchData['status'] });
export async function visibleStudents(actor: PublicUser, session?: ClientSession): Promise<string[]> {
  if (actor.role === 'student') return [actor.id];
  if (actor.role === 'parent') return (await ParentStudentRelationship.find({ parent: actor.id }).session(session || null)).map(r => String(r.student));
  return [];
}
export async function classScope(actor: PublicUser, session?: ClientSession): Promise<FilterQuery<unknown>> {
  if (actor.role === 'admin') return {};
  if (actor.role === 'teacher') return { teacher: actor.id };
  const students = await visibleStudents(actor, session);
  const enrollments = await Enrollment.find({ student: { $in: students }, status: 'active' }).session(session || null);
  return { _id: { $in: enrollments.map(e => e.class) }, status: 'active' };
}
export async function requireClass(actor: PublicUser, id: string, write = false, session?: ClientSession) {
  if (write && !['admin','teacher'].includes(actor.role)) throw new HttpError(403, 'FORBIDDEN', 'Academic management requires a teacher or administrator');
  const scope = await classScope(actor, session);
  const found = await Class.findOne({ $and: [{ _id: id }, scope] }).session(session || null);
  if (!found) throw new HttpError(404, 'NOT_FOUND', 'Class not found');
  return found;
}
