import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { User,Session,Class,Batch,Enrollment,Quiz,Question,QuizAttempt,AdministrationLock } from '../src/db/models.js';
import { hashToken } from '../src/modules/auth/service.js';
import { expireAttempts } from '../src/modules/quizzes/service.js';
import type { QuizInput,AttemptData } from '@tuition/contracts';
const config=readConfig({NODE_ENV:'test',MONGODB_URI:'mongodb://localhost/test',SMTP_HOST:'localhost',MAIL_FROM:'test@example.com'});
const app=createApp(config,async()=>{});let db:MongoMemoryReplSet;let actors:Record<string,{id:string;cookie:string}>;let classId:string;let batchId:string;let quizId:string;let input:QuizInput;
const call=(actor:string,method:'get'|'post'|'patch',path:string)=>request(app)[method](`/api${path}`).set('Cookie',actors[actor].cookie).set('Origin',config.APP_ORIGIN).set('X-Requested-With','tuition-web');
beforeAll(async()=>{db=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(db.getUri());await Promise.all(Object.values(mongoose.models).map(m=>m.init()));},120000);
beforeEach(async()=>{
  await Promise.all(Object.values(mongoose.connection.collections).map(c=>c.deleteMany({})));await AdministrationLock.create({_id:'administration',version:0});actors={};
  for(const [name,role] of Object.entries({teacher:'teacher',otherTeacher:'teacher',student:'student',outsider:'student',parent:'parent',admin:'admin'})) {const u=await User.create({name,email:`${name.toLowerCase()}@example.test`,role,status:'active',passwordHash:'not-used'});const token=randomBytes(32).toString('hex');await Session.create({user:u._id,tokenHash:hashToken(token),credentialVersion:0,expiresAt:new Date(Date.now()+3600000)});actors[name]={id:u.id,cookie:`tuition=${token}`};}
  const cls=await Class.create({name:'Mathematics',subject:'Maths',grade:6,teacher:actors.teacher.id});classId=cls.id;
  const batch=await Batch.create({name:'Saturday',class:classId,schedule:'Saturday'});batchId=batch.id;
  await Enrollment.create({student:actors.student.id,class:classId,batch:batchId});
  input={title:'Fractions quiz',description:'A quiz',subject:'Maths',classId,batchId,durationSeconds:600,passingMarks:2,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),maxAttempts:1,randomizeQuestions:true,randomizeOptions:true,questions:[{type:'single',prompt:'1 + 1?',topic:'Addition',marks:2,options:[{id:'a',text:'2'},{id:'b',text:'3'}],correctOptionIds:['a']},{type:'multiple',prompt:'Even numbers?',topic:'Numbers',marks:3,options:[{id:'a',text:'2'},{id:'b',text:'4'},{id:'c',text:'3'}],correctOptionIds:['a','b']},{type:'boolean',prompt:'1 is odd',topic:'Numbers',marks:1,options:[{id:'true',text:'True'},{id:'false',text:'False'}],correctOptionIds:['true']}]};
  const created=await call('teacher','post','/quizzes').send(input);expect(created.status).toBe(201);quizId=created.body.data.id;
  expect((await call('teacher','post',`/quizzes/${quizId}/publish`).send({})).status).toBe(200);
});
afterAll(async()=>{await mongoose.disconnect();await db?.stop();});
async function start():Promise<AttemptData>{const res=await call('student','post',`/quizzes/${quizId}/attempts`).send({});expect(res.status).toBe(200);return res.body.data;}
const correct=(a:AttemptData)=>a.questions.map(q=>({questionId:q.id,optionIds:q.type==='boolean'?['true']:q.type==='multiple'?['a','b']:['a']}));
describe('Quiz engine invariants',()=>{
  it('exposes safe eligibility metadata and stable randomized attempt snapshots',async()=>{
    const list=await call('student','get','/quizzes/available');expect(list.body.data.items).toHaveLength(1);expect(JSON.stringify(list.body)).not.toContain('correctOptionIds');
    const a=await start();const resumed=await start();expect(resumed.id).toBe(a.id);expect(resumed.questions).toEqual(a.questions);expect(JSON.stringify(a)).not.toContain('correctOptionIds');expect(a).not.toHaveProperty('snapshot');
    expect((await call('parent','post',`/quizzes/${quizId}/attempts`).send({})).status).toBe(403);
  });
  it('enforces enrollment, batch membership and teacher ownership',async()=>{
    expect((await call('outsider','post',`/quizzes/${quizId}/attempts`).send({})).status).toBe(403);
    expect((await call('otherTeacher','get',`/quizzes/${quizId}`)).status).toBe(404);
    expect((await call('student','get',`/quizzes/${quizId}/attempts`)).status).toBe(403);
    await Enrollment.updateOne({student:actors.student.id},{batch:null});expect((await call('student','post',`/quizzes/${quizId}/attempts`).send({})).status).toBe(403);
    expect((await call('student','get','/quizzes/available')).body.data.items).toHaveLength(0);
  });
  it('rejects starts before opening or after closing and caps the deadline',async()=>{
    await Quiz.updateOne({_id:quizId},{startsAt:new Date(Date.now()+60000),status:'scheduled'});expect((await call('student','post',`/quizzes/${quizId}/attempts`).send({})).status).toBe(409);
    const end=new Date(Date.now()+30000);await Quiz.updateOne({_id:quizId},{startsAt:new Date(Date.now()-60000),endsAt:end});const a=await start();expect(a.deadline).toBe(end.toISOString());
  });
  it('saves valid answers, rejects injected IDs and optimistic-version conflicts',async()=>{
    const a=await start();const answers=correct(a);const saved=await call('student','patch',`/attempts/${a.id}/answers`).send({version:a.version,answers});expect(saved.status).toBe(200);expect(saved.body.data.version).toBe(1);
    expect((await call('student','patch',`/attempts/${a.id}/answers`).send({version:0,answers})).status).toBe(409);
    expect((await call('student','patch',`/attempts/${a.id}/answers`).send({version:1,answers:[{questionId:a.questions[0].id,optionIds:['injected']}]})).status).toBe(400);
    expect((await call('outsider','get',`/attempts/${a.id}`)).status).toBe(404);
    expect((await call('student','get',`/attempts/${a.id}`)).body.data.answers).toEqual(answers);
  });
  it('grades server-side, hides results and reveals review only when authorized',async()=>{
    const a=await start();const submitted=await call('student','post',`/attempts/${a.id}/submit`).send({version:0,answers:correct(a)});expect(submitted.status).toBe(200);expect(submitted.body.data.status).toBe('submitted');expect(submitted.body.data).not.toHaveProperty('result');expect(submitted.body.data).not.toHaveProperty('review');
    expect((await call('teacher','get',`/quizzes/${quizId}/attempts`)).body.data.items[0].result).toEqual({score:6,totalMarks:6,percentage:100,passed:true});
    await call('teacher','patch',`/quizzes/${quizId}/publication`).send({resultsPublished:true,allowReview:false});const result=(await call('student','get',`/attempts/${a.id}`)).body.data;expect(result.result.score).toBe(6);expect(result).not.toHaveProperty('review');
    await call('teacher','patch',`/quizzes/${quizId}/publication`).send({resultsPublished:true,allowReview:true});expect((await call('student','get',`/attempts/${a.id}`)).body.data.review).toHaveLength(3);
    await call('teacher','patch',`/quizzes/${quizId}/publication`).send({resultsPublished:false,allowReview:true});expect((await call('student','get',`/attempts/${a.id}`)).body.data).not.toHaveProperty('result');
  });
  it('makes concurrent starts and duplicate submissions idempotent',async()=>{
    const starts=await Promise.all([call('student','post',`/quizzes/${quizId}/attempts`).send({}),call('student','post',`/quizzes/${quizId}/attempts`).send({})]);expect(starts.map(r=>r.status)).toEqual([200,200]);expect(starts[0].body.data.id).toBe(starts[1].body.data.id);
    const a=starts[0].body.data as AttemptData;const submissions=await Promise.all([call('student','post',`/attempts/${a.id}/submit`).send({version:0,answers:correct(a)}),call('student','post',`/attempts/${a.id}/submit`).send({version:0,answers:correct(a)})]);expect(submissions.map(r=>r.status)).toEqual([200,200]);expect(await QuizAttempt.countDocuments({quiz:quizId})).toBe(1);
    expect((await call('student','patch',`/attempts/${a.id}/answers`).send({version:2,answers:[]})).status).toBe(409);
    expect((await call('student','post',`/quizzes/${quizId}/attempts`).send({})).status).toBe(409);
  });
  it('discards answers arriving after the authoritative deadline',async()=>{
    const a=await start();await call('student','patch',`/attempts/${a.id}/answers`).send({version:0,answers:[]});await QuizAttempt.updateOne({_id:a.id},{deadline:new Date(Date.now()-1000)});
    const submitted=await call('student','post',`/attempts/${a.id}/submit`).send({version:1,answers:correct(a)});expect(submitted.status).toBe(200);expect((await QuizAttempt.findById(a.id))!.score).toBe(0);
  });
  it('finalizes expired attempts without browser activity and never regrades them',async()=>{
    const a=await start();await call('student','patch',`/attempts/${a.id}/answers`).send({version:0,answers:correct(a)});await QuizAttempt.updateOne({_id:a.id},{deadline:new Date(Date.now()-1000)});await expireAttempts();const done=await QuizAttempt.findById(a.id);expect(done!.status).toBe('submitted');expect(done!.score).toBe(6);await expireAttempts();expect((await QuizAttempt.findById(a.id))!.submittedAt).toEqual(done!.submittedAt);
  });
  it('freezes used quizzes and duplicates them into independent drafts',async()=>{
    await start();expect((await call('teacher','patch',`/quizzes/${quizId}`).send({...input,title:'Changed'})).status).toBe(409);
    const copy=await call('teacher','post',`/quizzes/${quizId}/duplicate`).send({});expect(copy.status).toBe(201);expect(copy.body.data.status).toBe('draft');expect(copy.body.data.id).not.toBe(quizId);
    expect(await Question.countDocuments({quiz:copy.body.data.id})).toBe(3);
  });
  it('closes active attempts using saved answers and prevents new starts',async()=>{
    const a=await start();await call('student','patch',`/attempts/${a.id}/answers`).send({version:0,answers:correct(a)});expect((await call('teacher','post',`/quizzes/${quizId}/close`).send({})).status).toBe(200);expect((await QuizAttempt.findById(a.id))!.score).toBe(6);expect((await call('student','post',`/quizzes/${quizId}/attempts`).send({})).status).toBe(404);
  });
  it('keeps separate historical results across permitted retakes',async()=>{
    await Quiz.updateOne({_id:quizId},{maxAttempts:2});const first=await start();await call('student','post',`/attempts/${first.id}/submit`).send({version:0,answers:correct(first)});const second=await start();expect(second.attemptNumber).toBe(2);expect(second.id).not.toBe(first.id);await call('student','post',`/attempts/${second.id}/submit`).send({version:0,answers:[]});
    expect((await QuizAttempt.findById(first.id))!.score).toBe(6);expect((await QuizAttempt.findById(second.id))!.score).toBe(0);expect((await call('student','get','/attempts')).body.data.meta.total).toBe(2);
  });
  it('validates questions, scoring bounds, request fields and class/batch assignment',async()=>{
    expect((await call('teacher','post','/quizzes').send({...input,passingMarks:100})).status).toBe(400);
    expect((await call('teacher','post','/quizzes').send({...input,score:100})).status).toBe(400);
    expect((await call('teacher','post','/quizzes').send({...input,endsAt:input.startsAt})).status).toBe(400);
    const a=await start();expect((await call('student','post',`/attempts/${a.id}/submit`).send({version:0,answers:correct(a),score:100})).status).toBe(400);
  });
});
