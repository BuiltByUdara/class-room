import { Router } from 'express';
import { z } from 'zod';
import { idSchema, pageSchema, quizInputSchema, answersSchema, publicationSchema } from '@tuition/contracts';
import { Quiz, QuizAttempt, Class, Enrollment, Batch } from '../../db/models.js';
import { authorize } from '../../middleware/auth.js';
import { administrativeWrite } from '../../lib/transaction.js';
import { HttpError } from '../../lib/errors.js';
import { classScope, requireClass } from '../classes/service.js';
import { saveQuiz, managedQuiz, quizDto, eligibleQuiz, startAttempt, updateAttempt, attemptDto, finalize } from './service.js';
export const quizRouter=Router(); const router=quizRouter;
const empty=z.object({}).strict();
router.get('/quizzes',authorize('admin','teacher'),async(req,res)=>{
  const query=pageSchema.parse(req.query); const classes=await Class.find(await classScope(req.user!)).distinct('_id');
  const filter={class:{$in:classes},...(query.search ? {title:new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')} : {})};
  const items=await Quiz.find(filter).sort({createdAt:-1,_id:1}).skip((query.page-1)*query.limit).limit(query.limit);
  const data=[]; for(const q of items) data.push(await quizDto(q,true));
  res.json({data:{items:data,meta:{page:query.page,limit:query.limit,total:await Quiz.countDocuments(filter)}}});
});
router.get('/quizzes/available',authorize('student'),async(req,res)=>{
  const query=pageSchema.parse(req.query); const activeClasses=await Class.find({status:'active'}).distinct('_id');
  const enrollments=await Enrollment.find({student:req.user!.id,status:'active',class:{$in:activeClasses}});
  const activeBatches=await Batch.find({_id:{$in:enrollments.map(e=>e.batch)},status:'active'}).distinct('_id');
  const batches=new Set(activeBatches.map(String));
  const filter={status:{$in:['published','scheduled']},endsAt:{$gt:new Date()},$or:enrollments.length ? enrollments.map(e=>({class:e.class,$or:[{batch:null},...(e.batch && batches.has(String(e.batch)) ? [{batch:e.batch}] : [])]})) : [{_id:null}]};
  const quizzes=await Quiz.find(filter).sort({startsAt:1,_id:1}).skip((query.page-1)*query.limit).limit(query.limit); const data=[];
  for(const q of quizzes) data.push(await quizDto(q,false,req.user!.id));
  res.json({data:{items:data,meta:{page:query.page,limit:query.limit,total:await Quiz.countDocuments(filter)}}});
});
router.post('/quizzes',authorize('admin','teacher'),async(req,res)=>{res.status(201).json({data:await saveQuiz(req.user!,quizInputSchema.parse(req.body))});});
router.get('/quizzes/:id',authorize('admin','teacher','student'),async(req,res)=>{
  const id=idSchema.parse(req.params.id); const manager=req.user!.role!=='student';
  const quiz=manager ? await managedQuiz(req.user!,id) : await eligibleQuiz(req.user!.id,id);
  res.json({data:await quizDto(quiz,manager,manager ? undefined:req.user!.id)});
});
router.patch('/quizzes/:id',authorize('admin','teacher'),async(req,res)=>{res.json({data:await saveQuiz(req.user!,quizInputSchema.parse(req.body),idSchema.parse(req.params.id))});});
router.post('/quizzes/:id/duplicate',authorize('admin','teacher'),async(req,res)=>{
  empty.parse(req.body); const original=await quizDto(await managedQuiz(req.user!,idSchema.parse(req.params.id)),true);
  const {title,description,subject,classId,batchId,durationSeconds,passingMarks,startsAt,endsAt,maxAttempts,randomizeQuestions,randomizeOptions,questions}=original;
  res.status(201).json({data:await saveQuiz(req.user!,quizInputSchema.parse({title:`${title.slice(0,140)} (copy)`,description,subject,classId,batchId,durationSeconds,passingMarks,startsAt,endsAt,maxAttempts,randomizeQuestions,randomizeOptions,questions}))});
});
for(const action of ['publish','close','archive'] as const) router.post(`/quizzes/:id/${action}`,authorize('admin','teacher'),async(req,res)=>{
  empty.parse(req.body); const id=idSchema.parse(req.params.id);
  const data=await administrativeWrite(req.user!,`quiz.${action}`,async session=>{
    const quiz=await managedQuiz(req.user!,id,session);
    if(action==='publish') {
      const cls=await requireClass(req.user!,String(quiz.class),true,session);
      if(cls.status!=='active' || quiz.endsAt.getTime()<=Date.now() || (quiz.batch && !await Batch.exists({_id:quiz.batch,status:'active',class:quiz.class}).session(session))) throw new HttpError(409,'PUBLISH_INVALID','Use an active class/batch and an end date in the future');
      quiz.status=quiz.startsAt.getTime()>Date.now() ? 'scheduled':'published';
    } else {
      quiz.status=action==='close' ? 'closed':'archived';
      const attempts=await QuizAttempt.find({quiz:id,status:'in_progress'}).select('+snapshot').session(session);
      for(const attempt of attempts) await finalize(attempt,session);
    }
    await quiz.save({session}); return quizDto(quiz,true,undefined,session);
  }); res.json({data});
});
router.patch('/quizzes/:id/publication',authorize('admin','teacher'),async(req,res)=>{
  const id=idSchema.parse(req.params.id); const input=publicationSchema.parse(req.body);
  const data=await administrativeWrite(req.user!,'quiz.results_publication',async session=>{const quiz=await managedQuiz(req.user!,id,session); Object.assign(quiz,input); await quiz.save({session}); return quizDto(quiz,true,undefined,session);}); res.json({data});
});
router.post('/quizzes/:id/attempts',authorize('student'),async(req,res)=>{empty.parse(req.body); res.json({data:await startAttempt(req.user!,idSchema.parse(req.params.id))});});
router.get('/attempts',authorize('student'),async(req,res)=>{
  const query=pageSchema.parse(req.query); const filter={student:req.user!.id};
  const records=await QuizAttempt.find(filter).sort({startedAt:-1,_id:1}).skip((query.page-1)*query.limit).limit(query.limit).select('+snapshot');
  const items=[]; for(const a of records) { if(a.status==='in_progress' && Date.now()>=a.deadline.getTime()) items.push(await updateAttempt(req.user!,a.id,undefined)); else items.push(await attemptDto(a)); }
  res.json({data:{items,meta:{page:query.page,limit:query.limit,total:await QuizAttempt.countDocuments(filter)}}});
});
router.get('/quizzes/:id/attempts',authorize('admin','teacher'),async(req,res)=>{
  const id=idSchema.parse(req.params.id); await managedQuiz(req.user!,id); const query=pageSchema.parse(req.query);
  const attempts=await QuizAttempt.find({quiz:id}).sort({startedAt:-1,_id:1}).skip((query.page-1)*query.limit).limit(query.limit).select('+snapshot'); const items=[];
  for(const a of attempts) {
    if(a.status==='in_progress' && Date.now()>=a.deadline.getTime()) await administrativeWrite(null,'attempt.expired',async session=>{const latest=await QuizAttempt.findById(a._id).select('+snapshot').session(session); if(latest) await finalize(latest,session);});
    items.push(await attemptDto((await QuizAttempt.findById(a._id).select('+snapshot'))!,true));
  }
  res.json({data:{items,meta:{page:query.page,limit:query.limit,total:await QuizAttempt.countDocuments({quiz:id})}}});
});
router.get('/attempts/:id',authorize('student'),async(req,res)=>{res.json({data:await updateAttempt(req.user!,idSchema.parse(req.params.id),undefined)});});
router.patch('/attempts/:id/answers',authorize('student'),async(req,res)=>{res.json({data:await updateAttempt(req.user!,idSchema.parse(req.params.id),answersSchema.parse(req.body))});});
router.post('/attempts/:id/submit',authorize('student'),async(req,res)=>{res.json({data:await updateAttempt(req.user!,idSchema.parse(req.params.id),answersSchema.parse(req.body),true)});});
