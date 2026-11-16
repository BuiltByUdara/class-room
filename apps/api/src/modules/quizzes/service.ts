import { randomInt } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { Quiz, Question, QuizAttempt, Class, Batch, Enrollment, User } from '../../db/models.js';
import { HttpError } from '../../lib/errors.js';
import { administrativeWrite } from '../../lib/transaction.js';
import { requireClass } from '../classes/service.js';
import { grade } from './grading.js';
import type { QuizInput, QuizData, QuestionInput, PublicUser, PublicQuestion, AttemptData, AnswerInput } from '@tuition/contracts';
type Snapshot = PublicQuestion & {correctOptionIds:string[]};
type Attempt = InstanceType<typeof QuizAttempt>;
export async function managedQuiz(actor:PublicUser,id:string,session?:ClientSession) {
  const quiz = await Quiz.findById(id).session(session || null); if (!quiz) throw new HttpError(404,'NOT_FOUND','Quiz not found');
  await requireClass(actor,String(quiz.class),true,session); return quiz;
}
export async function eligibleQuiz(studentId:string,id:string,session?:ClientSession,starting = false) {
  const quiz = await Quiz.findById(id).session(session || null);
  if (!quiz || !['published','scheduled'].includes(quiz.status)) throw new HttpError(404,'NOT_FOUND','Quiz is unavailable');
  if (!await Class.exists({_id:quiz.class,status:'active'}).session(session || null) || !await Enrollment.exists({student:studentId,class:quiz.class,status:'active',...(quiz.batch ? {batch:quiz.batch} : {})}).session(session || null)) throw new HttpError(403,'NOT_ELIGIBLE','You are not enrolled in this quiz’s class or batch');
  if (quiz.batch && !await Batch.exists({_id:quiz.batch,status:'active'}).session(session || null)) throw new HttpError(403,'NOT_ELIGIBLE','This batch is archived');
  if (starting && (Date.now()<quiz.startsAt.getTime() || Date.now()>=quiz.endsAt.getTime())) throw new HttpError(409,'QUIZ_WINDOW','This quiz is outside its availability window');
  return quiz;
}
export async function quizDto(quiz:InstanceType<typeof Quiz>, teacher = false, studentId?:string, session?:ClientSession):Promise<QuizData> {
  const questions = await Question.find({quiz:quiz._id}).sort({position:1}).select(teacher ? '+correctOptionIds' : '').session(session || null);
  const dto:QuizData = {id:quiz.id,title:quiz.title,description:quiz.description || '',subject:quiz.subject,classId:String(quiz.class),batchId:quiz.batch ? String(quiz.batch):null,durationSeconds:quiz.durationSeconds,passingMarks:quiz.passingMarks,totalMarks:questions.reduce((s,q)=>s+q.marks,0),startsAt:quiz.startsAt.toISOString(),endsAt:quiz.endsAt.toISOString(),maxAttempts:quiz.maxAttempts,randomizeQuestions:quiz.randomizeQuestions,randomizeOptions:quiz.randomizeOptions,status:quiz.status,resultsPublished:quiz.resultsPublished,allowReview:quiz.allowReview};
  if (teacher) { dto.questions = questions.map(q => ({type:q.type as QuestionInput['type'],prompt:q.prompt,imageUrl:q.imageUrl ?? undefined,imageAlt:q.imageAlt ?? undefined,topic:q.topic,marks:q.marks,options:q.options.map(o=>({id:o.id,text:o.text})),correctOptionIds:q.correctOptionIds})); dto.canEdit = !await QuizAttempt.exists({quiz:quiz._id}).session(session || null); }
  if (studentId) dto.attemptsUsed = await QuizAttempt.countDocuments({quiz:quiz._id,student:studentId}).session(session || null);
  return dto;
}
export async function saveQuiz(actor:PublicUser,input:QuizInput,id?:string) {
  return administrativeWrite(actor,id?'quiz.updated':'quiz.created',async session => {
    await requireClass(actor,input.classId,true,session);
    if (input.batchId && !await Batch.exists({_id:input.batchId,class:input.classId,status:'active'}).session(session)) throw new HttpError(400,'INVALID_BATCH','Choose an active batch in this class');
    const existing = id ? await managedQuiz(actor,id,session) : null;
    if (existing && await QuizAttempt.exists({quiz:id}).session(session)) throw new HttpError(409,'QUIZ_LOCKED','This quiz has attempts. Duplicate it to change questions or timing.');
    const {questions,classId,batchId,...fields} = input;
    const quiz = existing || new Quiz({createdBy:actor.id}); Object.assign(quiz,fields,{class:classId,batch:batchId,status:'draft'});
    await quiz.save({session}); await Question.deleteMany({quiz:quiz._id}).session(session);
    await Question.insertMany(questions.map((q,position)=>({...q,quiz:quiz._id,position})),{session,ordered:true});
    return quizDto(quiz,true,undefined,session);
  });
}
const shuffle = <T>(items:T[]) => { const result = [...items]; for(let i=result.length-1;i>0;i--) { const j=randomInt(i+1); [result[i],result[j]]=[result[j],result[i]]; } return result; };
// Snapshot remains server-only. Every outward field is explicitly selected below.
const snapshotOf = (attempt:Attempt):Snapshot[] => (attempt.get('snapshot') || []).map((q:Snapshot) => ({id:q.id,type:q.type,prompt:q.prompt,imageUrl:q.imageUrl ?? undefined,imageAlt:q.imageAlt ?? undefined,topic:q.topic,marks:q.marks,options:q.options.map(o=>({id:o.id,text:o.text})),correctOptionIds:[...q.correctOptionIds]}));
export async function finalize(attempt:Attempt,session:ClientSession,now = new Date()) {
  if(attempt.status === 'submitted') return;
  const result=grade(snapshotOf(attempt),attempt.answers.map(a=>({questionId:String(a.question),optionIds:a.optionIds})),Number(attempt.get('passingMarks')));
  Object.assign(attempt,{score:result.score,totalMarks:result.totalMarks,percentage:result.percentage,passed:result.passed,status:'submitted',submittedAt:new Date(Math.min(now.getTime(),attempt.deadline.getTime()))});
  attempt.set('version',Number(attempt.get('version'))+1); await attempt.save({session});
}
export async function attemptDto(attempt:Attempt,teacher=false,session?:ClientSession):Promise<AttemptData> {
  const quiz=await Quiz.findById(attempt.quiz).session(session || null);
  const dto:AttemptData={id:attempt.id,quizId:String(attempt.quiz),quizTitle:String(attempt.get('quizTitle')),studentId:String(attempt.student),attemptNumber:attempt.attemptNumber,status:attempt.status as AttemptData['status'],startedAt:attempt.startedAt.toISOString(),deadline:attempt.deadline.toISOString(),submittedAt:attempt.submittedAt?.toISOString(),serverTime:new Date().toISOString(),version:Number(attempt.get('version')),questions:snapshotOf(attempt).map(({correctOptionIds:_,...q})=>q),answers:attempt.answers.map(a=>({questionId:String(a.question),optionIds:[...a.optionIds]}))};
  if(teacher) dto.studentName=(await User.findById(attempt.student).session(session || null))?.name || 'Unknown member';
  if(attempt.status==='submitted' && (teacher || quiz?.resultsPublished)) {
    dto.result={score:attempt.score!,totalMarks:attempt.totalMarks!,percentage:attempt.percentage!,passed:attempt.passed!};
    if(teacher || quiz?.allowReview) dto.review=grade(snapshotOf(attempt),dto.answers,Number(attempt.get('passingMarks'))).review;
  }
  return dto;
}
async function ownAttempt(actor:PublicUser,id:string,session:ClientSession) {
  const attempt=await QuizAttempt.findOne({_id:id,student:actor.id}).select('+snapshot').session(session);
  if(!attempt) throw new HttpError(404,'NOT_FOUND','Attempt not found'); return attempt;
}
export async function startAttempt(actor:PublicUser,quizId:string) {
  return administrativeWrite(actor,'attempt.started',async session=>{
    const existing=await QuizAttempt.findOne({quiz:quizId,student:actor.id,status:'in_progress'}).select('+snapshot').session(session);
    if(existing) { if(Date.now()>=existing.deadline.getTime()) { await finalize(existing,session); return attemptDto(existing,false,session); } await eligibleQuiz(actor.id,quizId,session); return attemptDto(existing,false,session); }
    const quiz=await eligibleQuiz(actor.id,quizId,session,true);
    const count=await QuizAttempt.countDocuments({quiz:quizId,student:actor.id}).session(session);
    if(count>=quiz.maxAttempts) throw new HttpError(409,'ATTEMPT_LIMIT','You have used all attempts for this quiz');
    const questions=await Question.find({quiz:quizId}).sort({position:1}).select('+correctOptionIds').session(session);
    let snapshot:Snapshot[]=questions.map(q=>({id:q.id,type:q.type as Snapshot['type'],prompt:q.prompt,imageUrl:q.imageUrl ?? undefined,imageAlt:q.imageAlt ?? undefined,topic:q.topic,marks:q.marks,options:q.options.map(o=>({id:o.id,text:o.text})),correctOptionIds:[...q.correctOptionIds]}));
    if(!snapshot.length) throw new HttpError(409,'EMPTY_QUIZ','This quiz has no questions');
    if(quiz.randomizeQuestions) snapshot=shuffle(snapshot); if(quiz.randomizeOptions) snapshot=snapshot.map(q=>({...q,options:shuffle(q.options)}));
    const now=new Date(); const [attempt]=await QuizAttempt.create([{quiz:quizId,student:actor.id,attemptNumber:count+1,startedAt:now,deadline:new Date(Math.min(now.getTime()+quiz.durationSeconds*1000,quiz.endsAt.getTime())),snapshot,quizTitle:quiz.title,passingMarks:quiz.passingMarks,version:0}],{session});
    return attemptDto(attempt,false,session);
  });
}
function validateAnswers(attempt:Attempt,answers:AnswerInput['answers']) {
  const questions=new Map(snapshotOf(attempt).map(q=>[q.id,q]));
  for(const answer of answers) { const q=questions.get(answer.questionId); if(!q || new Set(answer.optionIds).size!==answer.optionIds.length || answer.optionIds.some(id=>!q.options.some(o=>o.id===id)) || (q.type!=='multiple' && answer.optionIds.length>1)) throw new HttpError(400,'INVALID_ANSWER','An answer contains invalid options or questions'); }
}
export async function updateAttempt(actor:PublicUser,id:string,input:AnswerInput|undefined,submit=false) {
  return administrativeWrite(actor,submit?'attempt.submitted':'attempt.saved',async session=>{
    const attempt=await ownAttempt(actor,id,session);
    if(attempt.status==='submitted') { if(submit || !input) return attemptDto(attempt,false,session); throw new HttpError(409,'ATTEMPT_SUBMITTED','Submitted answers cannot be changed'); }
    if(Date.now()>=attempt.deadline.getTime()) { await finalize(attempt,session); return attemptDto(attempt,false,session); }
    await eligibleQuiz(actor.id,String(attempt.quiz),session);
    if(input) {
      if(input.version!==Number(attempt.get('version'))) throw new HttpError(409,'STALE_VERSION','This attempt changed in another tab. Reload before continuing.');
      validateAnswers(attempt,input.answers); attempt.set('answers',input.answers.map(a=>({question:a.questionId,optionIds:a.optionIds}))); attempt.set('version',input.version+1);
    }
    if(submit) await finalize(attempt,session); else if(input) await attempt.save({session});
    return attemptDto(attempt,false,session);
  });
}
export async function expireAttempts() {
  const expired=await QuizAttempt.find({status:'in_progress',deadline:{$lte:new Date()}}).select('_id').limit(100);
  for(const record of expired) await administrativeWrite(null,'attempt.expired',async session=>{const attempt=await QuizAttempt.findById(record._id).select('+snapshot').session(session); if(attempt?.status==='in_progress' && Date.now()>=attempt.deadline.getTime()) await finalize(attempt,session);});
}
