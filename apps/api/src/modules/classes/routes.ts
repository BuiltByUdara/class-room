import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { idSchema, pageSchema, classSchema, batchSchema, enrollmentSchema, relationshipSchema, userUpdateSchema, profileSchema } from '@tuition/contracts';
import { Class, Batch, User, Enrollment, ParentStudentRelationship, StudentProfile } from '../../db/models.js';
import { authorize } from '../../middleware/auth.js';
import { HttpError } from '../../lib/errors.js';
import { administrativeWrite } from '../../lib/transaction.js';
import { memberDto, requireMember, updateMember } from '../users/service.js';
import { classDto, batchDto, classScope, requireClass, visibleStudents } from './service.js';
const literalSearch = (value: string) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const pageResponse = <T>(items: T[], total: number, query: { page: number; limit: number }) => ({ data: { items, meta: { page: query.page, limit: query.limit, total } } });
export const managementRouter = Router();
const router = managementRouter;
router.get('/users', authorize('admin','teacher'), async (req, res) => {
  const query = pageSchema.parse(req.query); const filter: FilterQuery<unknown> = {};
  if (req.user!.role === 'teacher') {
    const classes = await Class.find({ teacher: req.user!.id }).distinct('_id');
    const ids = await Enrollment.find({ class: { $in: classes }, status: 'active' }).distinct('student');
    filter._id = { $in: ids }; filter.role = 'student';
  } else if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.search) filter.$or = [{ name: literalSearch(query.search) }, { email: literalSearch(query.search) }];
  const items = await User.find(filter).sort({ name: 1, _id: 1 }).skip((query.page-1)*query.limit).limit(query.limit);
  res.json(pageResponse(items.map(memberDto), await User.countDocuments(filter), query));
});
router.get('/users/:id', authorize('admin'), async (req, res) => {
  const user = await User.findById(idSchema.parse(req.params.id)); if (!user) throw new HttpError(404,'NOT_FOUND','Member not found');
  res.json({ data: memberDto(user) });
});
router.patch('/users/:id', authorize('admin'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const input = userUpdateSchema.parse(req.body);
  res.json({ data: await administrativeWrite(req.user!, 'user.updated', s => updateMember(id, input, s)) });
});
router.post('/users/:id/deactivate', authorize('admin'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json({ data: await administrativeWrite(req.user!, 'user.deactivated', async s => {
    const user = await User.findById(id).session(s); if (!user) throw new HttpError(404,'NOT_FOUND','Member not found');
    return updateMember(id, { name: user.name, role: user.role, status: 'inactive' }, s);
  }) });
});
router.get('/students/:id/profile', async (req, res) => {
  const id = idSchema.parse(req.params.id); const actor = req.user!;
  if (actor.role !== 'admin') {
    let allowed = (await visibleStudents(actor)).includes(id);
    if (actor.role === 'teacher') { const classes = await Class.find({ teacher: actor.id }).distinct('_id'); allowed = Boolean(await Enrollment.exists({ student: id, class: { $in: classes }, status: 'active' })); }
    if (!allowed) throw new HttpError(404,'NOT_FOUND','Student not found');
  }
  const profile = await StudentProfile.findOne({ user: id });
  res.json({ data: profile ? { studentNumber: profile.studentNumber, grade: profile.grade, school: profile.school } : null });
});
router.put('/students/:id/profile', authorize('admin'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const input = profileSchema.parse(req.body);
  await administrativeWrite(req.user!, 'student.profile_updated', async s => { await requireMember(id,'student',s); await StudentProfile.findOneAndUpdate({ user: id }, input, { session: s, upsert: true, runValidators: true }); });
  res.json({ data: input });
});
router.get('/relationships', authorize('admin'), async (req, res) => {
  const query = pageSchema.parse(req.query);
  const links = await ParentStudentRelationship.find().sort({ _id: 1 }).skip((query.page-1)*query.limit).limit(query.limit);
  const users = await User.find({ _id: { $in: links.flatMap(r => [r.parent,r.student]) } });
  const byId = new Map(users.map(u => [u.id, memberDto(u)]));
  res.json(pageResponse(links.map(r => ({ id: r.id, parent: byId.get(String(r.parent)), student: byId.get(String(r.student)) })), await ParentStudentRelationship.countDocuments(), query));
});
router.post('/relationships', authorize('admin'), async (req, res) => {
  const input = relationshipSchema.parse(req.body);
  const id = await administrativeWrite(req.user!,'relationship.created',async s => {
    await requireMember(input.parentId,'parent',s); await requireMember(input.studentId,'student',s);
    const [link] = await ParentStudentRelationship.create([{ parent: input.parentId, student: input.studentId, linkedBy: req.user!.id }], { session: s }); return link.id;
  }); res.status(201).json({ data: { id } });
});
router.delete('/relationships/:id', authorize('admin'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  await administrativeWrite(req.user!,'relationship.removed',async s => { const result = await ParentStudentRelationship.deleteOne({ _id: id }).session(s); if (!result.deletedCount) throw new HttpError(404,'NOT_FOUND','Relationship not found'); }); res.status(204).end();
});
router.get('/parents/me/children', authorize('parent'), async (req, res) => {
  const children = await User.find({ _id: { $in: await visibleStudents(req.user!) }, role: 'student' }).sort({ name: 1 });
  res.json({ data: children.map(memberDto) });
});
router.get('/students/:id/classes', async (req, res) => {
  const id = idSchema.parse(req.params.id); const actor = req.user!;
  if (!['admin','teacher'].includes(actor.role) && !(await visibleStudents(actor)).includes(id)) throw new HttpError(404,'NOT_FOUND','Student not found');
  const classIds = await Enrollment.find({ student: id, status: 'active' }).distinct('class');
  const classes = await Class.find({ $and: [{ _id: { $in: classIds }, status: 'active' }, await classScope(actor)] }).sort({ name: 1 });
  res.json({ data: classes.map(classDto) });
});
router.get('/classes', async (req, res) => {
  const query = pageSchema.parse(req.query); const filters: FilterQuery<unknown>[] = [await classScope(req.user!)];
  if (query.status) filters.push({ status: query.status });
  if (query.search) filters.push({ name: literalSearch(query.search) });
  const filter = { $and: filters };
  const items = await Class.find(filter).sort({ name: 1, _id: 1 }).skip((query.page-1)*query.limit).limit(query.limit);
  res.json(pageResponse(items.map(classDto), await Class.countDocuments(filter), query));
});
router.post('/classes', authorize('admin','teacher'), async (req, res) => {
  const input = classSchema.parse(req.body);
  const data = await administrativeWrite(req.user!,'class.created',async s => {
    if (req.user!.role === 'teacher' && input.teacherId !== req.user!.id) throw new HttpError(403,'FORBIDDEN','You can only create your own classes');
    await requireMember(input.teacherId,'teacher',s);
    const { teacherId, ...fields } = input; const [record] = await Class.create([{ ...fields, teacher: teacherId }], { session: s }); return classDto(record);
  }); res.status(201).json({ data });
});
router.get('/classes/:id', async (req, res) => { res.json({ data: classDto(await requireClass(req.user!,idSchema.parse(req.params.id))) }); });
router.patch('/classes/:id', authorize('admin','teacher'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const input = classSchema.parse(req.body);
  const data = await administrativeWrite(req.user!,'class.updated',async s => {
    const record = await requireClass(req.user!,id,true,s);
    if (req.user!.role === 'teacher' && input.teacherId !== req.user!.id) throw new HttpError(403,'FORBIDDEN','Only an administrator can reassign teachers');
    await requireMember(input.teacherId,'teacher',s); const { teacherId, ...fields } = input;
    Object.assign(record, fields, { teacher: teacherId }); await record.save({ session: s }); return classDto(record);
  }); res.json({ data });
});
router.get('/classes/:id/batches', async (req, res) => {
  const id = idSchema.parse(req.params.id); await requireClass(req.user!,id);
  const filter: FilterQuery<unknown> = { class: id };
  if (['parent','student'].includes(req.user!.role)) { const ids = await Enrollment.find({ class: id, student: { $in: await visibleStudents(req.user!) }, status: 'active' }).distinct('batch'); filter._id = { $in: ids }; filter.status = 'active'; }
  res.json({ data: (await Batch.find(filter).sort({ name: 1 })).map(batchDto) });
});
router.post('/classes/:id/batches', authorize('admin','teacher'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const input = batchSchema.parse(req.body);
  const data = await administrativeWrite(req.user!,'batch.created',async s => { const cls = await requireClass(req.user!,id,true,s); if (cls.status !== 'active') throw new HttpError(409,'ARCHIVED','Restore the class before creating a batch'); const [batch] = await Batch.create([{ ...input, class: id }], { session: s }); return batchDto(batch); });
  res.status(201).json({ data });
});
router.patch('/batches/:id', authorize('admin','teacher'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const input = batchSchema.parse(req.body);
  const data = await administrativeWrite(req.user!,'batch.updated',async s => {
    const batch = await Batch.findById(id).session(s); if (!batch) throw new HttpError(404,'NOT_FOUND','Batch not found'); await requireClass(req.user!,String(batch.class),true,s);
    if (input.status === 'archived' && await Enrollment.exists({ batch: id, status: 'active' }).session(s)) throw new HttpError(409,'BATCH_IN_USE','Move or remove enrolled students before archiving this batch');
    Object.assign(batch,input); await batch.save({ session: s }); return batchDto(batch);
  }); res.json({ data });
});
router.get('/classes/:id/enrollments', async (req, res) => {
  const id = idSchema.parse(req.params.id); await requireClass(req.user!,id); const query = pageSchema.parse(req.query);
  const filter: FilterQuery<unknown> = { class: id, status: 'active' };
  if (['parent','student'].includes(req.user!.role)) filter.student = { $in: await visibleStudents(req.user!) };
  const enrollments = await Enrollment.find(filter).sort({ _id: 1 }).skip((query.page-1)*query.limit).limit(query.limit);
  const users = await User.find({ _id: { $in: enrollments.map(e => e.student) } }); const names = new Map(users.map(u => [u.id,u.name]));
  res.json(pageResponse(enrollments.map(e => ({ id: e.id, studentId: String(e.student), studentName: names.get(String(e.student)) || 'Unavailable member', batchId: e.batch ? String(e.batch) : null, status: e.status })), await Enrollment.countDocuments(filter), query));
});
router.post('/classes/:id/enrollments', authorize('admin','teacher'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const input = enrollmentSchema.parse(req.body);
  const data = await administrativeWrite(req.user!,'enrollment.saved',async s => {
    const cls = await requireClass(req.user!,id,true,s); if (cls.status !== 'active') throw new HttpError(409,'ARCHIVED','Restore the class before enrolling students');
    await requireMember(input.studentId,'student',s);
    if (req.user!.role === 'teacher' && !await Enrollment.exists({ class: id, student: input.studentId, status: 'active' }).session(s)) throw new HttpError(403,'FORBIDDEN','An administrator must enroll new students');
    if (input.batchId && !await Batch.exists({ _id: input.batchId, class: id, status: 'active' }).session(s)) throw new HttpError(400,'INVALID_BATCH','Select an active batch belonging to this class');
    const record = await Enrollment.findOneAndUpdate({ student: input.studentId, class: id }, { $set: { batch: input.batchId, status: 'active' } }, { upsert: true, new: true, runValidators: true, session: s }); return { id: record.id };
  }); res.json({ data });
});
router.delete('/classes/:id/enrollments/:studentId', authorize('admin','teacher'), async (req, res) => {
  const id = idSchema.parse(req.params.id); const studentId = idSchema.parse(req.params.studentId);
  await administrativeWrite(req.user!,'enrollment.removed',async s => { await requireClass(req.user!,id,true,s); const found = await Enrollment.findOneAndUpdate({ class: id, student: studentId, status: 'active' }, { status: 'removed' }, { session: s }); if (!found) throw new HttpError(404,'NOT_FOUND','Enrollment not found'); }); res.status(204).end();
});
router.get('/dashboard', async (req, res) => {
  const actor = req.user!; const scope = await classScope(actor); const ids = await Class.find(scope).distinct('_id');
  const roster: FilterQuery<unknown> = { class: { $in: ids }, status: 'active' };
  if (['parent','student'].includes(actor.role)) roster.student = { $in: await visibleStudents(actor) };
  const studentIds = await Enrollment.find(roster).distinct('student');
  const batchIds = await Enrollment.find(roster).distinct('batch');
  res.json({ data: { classes: ids.length, students: studentIds.length, batches: await Batch.countDocuments({ class: { $in: ids }, status: 'active', ...(['parent','student'].includes(actor.role) ? { _id: { $in: batchIds } } : {}) }), ...(actor.role === 'admin' ? { users: await User.countDocuments() } : {}), ...(actor.role === 'parent' ? { children: (await visibleStudents(actor)).length } : {}) } });
});

