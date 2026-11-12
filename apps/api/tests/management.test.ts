import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { User, Session, Class, Batch, Enrollment, ParentStudentRelationship, StudentProfile, AdministrationLock } from '../src/db/models.js';
import { hashToken } from '../src/modules/auth/service.js';

const config = readConfig({ NODE_ENV:'test', MONGODB_URI:'mongodb://localhost/test', SMTP_HOST:'localhost', MAIL_FROM:'test@example.com' });
const app = createApp(config, async () => {});
let db: MongoMemoryReplSet;
let actors: Record<string, { id: string; cookie: string }>;
let classId: string; let otherClassId: string; let batchId: string;
const call = (actor: string, method: 'get'|'post'|'patch'|'put'|'delete', path: string) => request(app)[method](`/api${path}`).set('Cookie',actors[actor].cookie).set('Origin',config.APP_ORIGIN).set('X-Requested-With','tuition-web');
beforeAll(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count:1, storageEngine:'wiredTiger' } });
  await mongoose.connect(db.getUri());
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
},120000);
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(c => c.deleteMany({})));
  await AdministrationLock.create({ _id:'administration',version:0 }); actors = {};
  for (const [name,role] of Object.entries({ admin:'admin',teacher:'teacher',otherTeacher:'teacher',student:'student',otherStudent:'student',parent:'parent',otherParent:'parent' })) {
    const user = await User.create({ name,email:`${name.toLowerCase()}@example.com`,role,status:'active',passwordHash:'test-hash-not-used-for-login' });
    const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash:hashToken(token),user:user._id,credentialVersion:0,expiresAt:new Date(Date.now()+3600000) });
    actors[name] = { id:user.id,cookie:`tuition=${token}` };
  }
  const cls = await Class.create({ name:'Grade 6 Mathematics',subject:'Mathematics',grade:6,teacher:actors.teacher.id }); classId = cls.id;
  const other = await Class.create({ name:'Grade 7 Mathematics',subject:'Mathematics',grade:7,teacher:actors.otherTeacher.id }); otherClassId = other.id;
  const batch = await Batch.create({ name:'Saturday',class:classId,schedule:'Saturday 09:00–11:00' }); batchId = batch.id;
  await Enrollment.create([{student:actors.student.id,class:classId,batch:batchId},{student:actors.otherStudent.id,class:otherClassId}]);
  await ParentStudentRelationship.create({parent:actors.parent.id,student:actors.student.id,linkedBy:actors.admin.id});
});
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });
describe('Phase 2 management and isolation', () => {
  it('creates and updates classes and batches with validated ownership', async () => {
    const created = await call('teacher','post','/classes').send({name:'Algebra',subject:'Maths',grade:8,teacherId:actors.teacher.id,status:'active'});
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await call('otherTeacher','patch',`/classes/${id}`).send({name:'Stolen',subject:'Maths',grade:8,teacherId:actors.otherTeacher.id,status:'active'})).status).toBe(404);
    expect((await call('teacher','post',`/classes/${id}/batches`).send({name:'Sunday',schedule:'Sunday 10:00',timezone:'Asia/Colombo',status:'active'})).status).toBe(201);
    expect((await call('teacher','post','/classes').send({name:'Wrong owner',subject:'Maths',grade:8,teacherId:actors.otherTeacher.id})).status).toBe(403);
    expect((await call('admin','post','/classes').send({name:'Wrong role',subject:'Maths',grade:8,teacherId:actors.student.id})).status).toBe(400);
  });
  it('scopes class lists and direct IDs for every role', async () => {
    expect((await call('admin','get','/classes')).body.data.meta.total).toBe(2);
    expect((await call('teacher','get','/classes')).body.data.items.map((c: {id:string}) => c.id)).toEqual([classId]);
    expect((await call('student','get','/classes')).body.data.items.map((c: {id:string}) => c.id)).toEqual([classId]);
    expect((await call('parent','get','/classes')).body.data.items.map((c: {id:string}) => c.id)).toEqual([classId]);
    expect((await call('otherParent','get','/classes')).body.data.meta.total).toBe(0);
    for (const actor of ['teacher','student','parent']) expect((await call(actor,'get',`/classes/${otherClassId}`)).status).toBe(404);
  });
  it('does not leak classmates to parents or students', async () => {
    await Enrollment.create({ student:actors.otherStudent.id,class:classId,batch:batchId });
    for (const actor of ['parent','student']) {
      const response = await call(actor,'get',`/classes/${classId}/enrollments`);
      expect(response.status).toBe(200); expect(response.body.data.meta.total).toBe(1);
      expect(response.body.data.items[0].studentId).toBe(actors.student.id);
    }
    expect((await call('teacher','get',`/classes/${classId}/enrollments`)).body.data.meta.total).toBe(2);
    expect((await call('parent','get',`/students/${actors.otherStudent.id}/profile`)).status).toBe(404);
    expect((await call('parent','get',`/students/${actors.otherStudent.id}/classes`)).status).toBe(404);
  });
  it('links and unlinks children with immediate access changes', async () => {
    expect((await call('parent','get','/parents/me/children')).body.data).toHaveLength(1);
    const link = await call('admin','post','/relationships').send({parentId:actors.parent.id,studentId:actors.otherStudent.id}); expect(link.status).toBe(201);
    expect((await call('parent','get',`/classes/${otherClassId}`)).status).toBe(200);
    expect((await call('admin','post','/relationships').send({parentId:actors.parent.id,studentId:actors.otherStudent.id})).status).toBe(409);
    expect((await call('parent','post','/relationships').send({parentId:actors.parent.id,studentId:actors.otherStudent.id})).status).toBe(403);
    expect((await call('admin','delete',`/relationships/${link.body.data.id}`)).status).toBe(204);
    expect((await call('parent','get',`/classes/${otherClassId}`)).status).toBe(404);
    expect((await call('admin','post','/relationships').send({parentId:actors.teacher.id,studentId:actors.student.id})).status).toBe(400);
  });
  it('validates enrollment batches, preserves history, and restricts teacher enrollment', async () => {
    expect((await call('admin','post',`/classes/${otherClassId}/enrollments`).send({studentId:actors.student.id,batchId})).status).toBe(400);
    expect((await call('teacher','post',`/classes/${classId}/enrollments`).send({studentId:actors.otherStudent.id,batchId})).status).toBe(403);
    expect((await call('admin','post',`/classes/${classId}/enrollments`).send({studentId:actors.otherStudent.id,batchId})).status).toBe(200);
    expect((await call('teacher','post',`/classes/${classId}/enrollments`).send({studentId:actors.otherStudent.id,batchId:null})).status).toBe(200);
    expect((await call('teacher','delete',`/classes/${classId}/enrollments/${actors.otherStudent.id}`)).status).toBe(204);
    expect(await Enrollment.countDocuments({student:actors.otherStudent.id,class:classId,status:'removed'})).toBe(1);
    expect((await call('admin','post',`/classes/${classId}/enrollments`).send({studentId:actors.otherStudent.id,batchId})).status).toBe(200);
    expect(await Enrollment.countDocuments({student:actors.otherStudent.id,class:classId})).toBe(1);
  });
  it('protects batch archival and hides archived classes from learners', async () => {
    expect((await call('teacher','patch',`/batches/${batchId}`).send({name:'Saturday',schedule:'Saturday 09:00',timezone:'Asia/Colombo',status:'archived'})).status).toBe(409);
    expect((await call('teacher','patch',`/classes/${classId}`).send({name:'Grade 6 Mathematics',subject:'Mathematics',grade:6,teacherId:actors.teacher.id,status:'archived'})).status).toBe(200);
    expect((await call('student','get',`/classes/${classId}`)).status).toBe(404);
    expect((await call('admin','post',`/classes/${classId}/enrollments`).send({studentId:actors.otherStudent.id,batchId:null})).status).toBe(409);
  });
  it('updates profiles and enforces unique student numbers and read scopes', async () => {
    const profile = {studentNumber:'S001',grade:6,school:'Central School'};
    expect((await call('admin','put',`/students/${actors.student.id}/profile`).send(profile)).status).toBe(200);
    expect((await call('parent','get',`/students/${actors.student.id}/profile`)).body.data).toEqual(profile);
    expect((await call('otherTeacher','get',`/students/${actors.student.id}/profile`)).status).toBe(404);
    expect((await call('student','put',`/students/${actors.student.id}/profile`).send(profile)).status).toBe(403);
    expect((await call('admin','put',`/students/${actors.otherStudent.id}/profile`).send(profile)).status).toBe(409);
    expect(await StudentProfile.countDocuments()).toBe(1);
  });
  it('deactivates accounts, revokes sessions, and protects the last admin', async () => {
    expect((await call('admin','post',`/users/${actors.student.id}/deactivate`).send({})).status).toBe(200);
    expect((await call('student','get','/dashboard')).status).toBe(401);
    expect((await call('admin','post',`/users/${actors.admin.id}/deactivate`).send({})).status).toBe(409);
    expect((await call('admin','patch',`/users/${actors.teacher.id}`).send({name:'Teacher',role:'student',status:'active'})).status).toBe(409);
  });
  it('serializes concurrent admin demotion to preserve an active administrator', async () => {
    await User.updateOne({_id:actors.otherParent.id},{role:'admin'});
    const results = await Promise.all([call('admin','post',`/users/${actors.admin.id}/deactivate`).send({}),call('otherParent','post',`/users/${actors.otherParent.id}/deactivate`).send({})]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
    expect(await User.countDocuments({role:'admin',status:'active'})).toBe(1);
  });
  it('paginates safe user DTOs and escapes search patterns', async () => {
    const response = await call('admin','get','/users?limit=2&page=1'); expect(response.body.data.items).toHaveLength(2); expect(response.body.data.meta.total).toBe(7);
    for (const member of response.body.data.items) expect(Object.keys(member).sort()).toEqual(['email','id','name','role','status']);
    expect((await call('teacher','get','/users')).body.data.items.map((u:{id:string}) => u.id)).toEqual([actors.student.id]);
    expect((await call('admin','get','/users?search=%2E%2A')).body.data.meta.total).toBe(0);
    expect((await call('admin','get','/classes?limit=9999')).status).toBe(400);
    expect((await call('admin','get','/classes/not-an-id')).status).toBe(400);
    expect((await call('parent','post','/classes').send({})).status).toBe(403);
  });
  it('calculates real scoped dashboard totals', async () => {
    expect((await call('admin','get','/dashboard')).body.data).toEqual({classes:2,students:2,batches:1,users:7});
    expect((await call('parent','get','/dashboard')).body.data).toEqual({classes:1,students:1,batches:1,children:1});
    expect((await call('otherParent','get','/dashboard')).body.data).toEqual({classes:0,students:0,batches:0,children:0});
  });
});
