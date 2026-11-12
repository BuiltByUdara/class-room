import type { ClientSession } from 'mongoose';
import type { z } from 'zod';
import { userUpdateSchema, type Member } from '@tuition/contracts';
import { User, Class, Enrollment, ParentStudentRelationship, StudentProfile, Session } from '../../db/models.js';
import { HttpError } from '../../lib/errors.js';
export const memberDto = (u: InstanceType<typeof User>): Member => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status as Member['status'] });
export async function requireMember(id: string, role: string, session?: ClientSession) {
  const user = await User.findOne({ _id: id, role, status: { $in: ['active','invited'] } }).session(session || null);
  if (!user) throw new HttpError(400, 'INVALID_MEMBER', `Select an enabled ${role} account`);
  return user;
}
export async function updateMember(id: string, input: z.infer<typeof userUpdateSchema>, session: ClientSession) {
  const user = await User.findById(id).select('+passwordHash').session(session);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Member not found');
  if (input.status === 'active' && !user.passwordHash) throw new HttpError(409, 'INVITATION_REQUIRED', 'This member must set a password before activation');
  if (input.status === 'invited' && user.passwordHash) throw new HttpError(409, 'INVALID_STATUS', 'An activated account cannot return to invited status');
  if (user.role === 'admin' && user.status === 'active' && (input.role !== 'admin' || input.status !== 'active')) {
    if (await User.countDocuments({ role: 'admin', status: 'active' }).session(session) <= 1) throw new HttpError(409, 'LAST_ADMIN', 'Keep at least one active administrator');
  }
  if (input.role !== user.role) {
    const referenced = await Class.exists({ teacher: id }).session(session) || await Enrollment.exists({ student: id }).session(session) || await ParentStudentRelationship.exists({ $or: [{ parent: id }, { student: id }] }).session(session) || await StudentProfile.exists({ user: id }).session(session);
    if (referenced) throw new HttpError(409, 'ROLE_IN_USE', 'This role is referenced by academic records. Create a separate account for another role.');
  }
  const changedAccess = input.role !== user.role || input.status !== user.status;
  Object.assign(user, input);
  if (changedAccess) { user.credentialVersion++; await Session.deleteMany({ user: id }).session(session); }
  await user.save({ session });
  return memberDto(user);
}
