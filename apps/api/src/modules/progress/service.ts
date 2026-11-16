import type {PublicUser,ProgressFilter,ClassPerformance} from '@tuition/contracts';
import type {FilterQuery} from 'mongoose';
import {User,Class,Batch,Quiz,QuizAttempt,Enrollment,ParentStudentRelationship} from '../../db/models.js';
import {HttpError} from '../../lib/errors.js';
import {requireClass} from '../classes/service.js';
import {grade} from '../quizzes/grading.js';
import {calculateProgress,latestAttempts,performance,inRange,round,type AnalyticsQuiz,type AnalyticsAttempt,type AnalyticsEnrollment} from './calculations.js';

async function loadData(classIds?:string[],studentId?:string) {
  const quizFilter:FilterQuery<unknown>=classIds?{class:{$in:classIds}}:{};
  const quizDocs=await Quiz.find(quizFilter);
  const quizzes:AnalyticsQuiz[]=quizDocs.map(q=>({id:q.id,title:q.title,subject:q.subject,classId:String(q.class),batchId:q.batch?String(q.batch):null,startsAt:q.startsAt,endsAt:q.endsAt,status:q.status,resultsPublished:q.resultsPublished}));
  const enrollmentDocs=await Enrollment.find({...classIds?{class:{$in:classIds}}:{},...studentId?{student:studentId}:{}});
  const activeClasses=new Set((await Class.find({_id:{$in:enrollmentDocs.map(e=>e.class)},status:'active'}).distinct('_id')).map(String));
  const activeBatches=new Set((await Batch.find({_id:{$in:enrollmentDocs.map(e=>e.batch)},status:'active'}).distinct('_id')).map(String));
  const enrollments:AnalyticsEnrollment[]=enrollmentDocs.map(e=>({studentId:String(e.student),classId:String(e.class),batchId:e.batch&&activeBatches.has(String(e.batch))?String(e.batch):null,status:activeClasses.has(String(e.class))?e.status:'removed',enrolledAt:e.get('joinedAt')||e.createdAt,batchJoinedAt:e.get('batchJoinedAt')||e.get('joinedAt')||e.createdAt}));
  const docs=await QuizAttempt.find({quiz:{$in:quizDocs.map(q=>q._id)},status:'submitted',...studentId?{student:studentId}:{}}).select('+snapshot');
  const attempts:AnalyticsAttempt[]=docs.filter(a=>a.submittedAt&&typeof a.score==='number'&&typeof a.percentage==='number'&&typeof a.totalMarks==='number'&&typeof a.passed==='boolean').map(a=>{
    const snapshot=(a.get('snapshot')||[]) as {id:string;topic:string;marks:number;correctOptionIds:string[]}[];
    const review=grade(snapshot,a.answers.map(answer=>({questionId:String(answer.question),optionIds:answer.optionIds})),Number(a.get('passingMarks'))).review;
    return {id:a.id,quizId:String(a.quiz),studentId:String(a.student),attemptNumber:a.attemptNumber,submittedAt:a.submittedAt!,score:a.score!,totalMarks:a.totalMarks!,percentage:a.percentage!,passed:a.passed!,topics:snapshot.map(q=>({name:q.topic,possible:q.marks,earned:review.find(r=>r.questionId===q.id)?.awardedMarks||0}))};
  });
  return {quizzes,attempts,enrollments};
}
export async function studentProgress(actor:PublicUser,studentId:string,filter:ProgressFilter) {
  let classIds:string[]|undefined;
  if(actor.role==='student'&&actor.id!==studentId)throw new HttpError(404,'NOT_FOUND','Student not found');
  if(actor.role==='parent'&&!await ParentStudentRelationship.exists({parent:actor.id,student:studentId}))throw new HttpError(404,'NOT_FOUND','Student not found');
  if(actor.role==='teacher'){
    classIds=(await Class.find({teacher:actor.id}).distinct('_id')).map(String);
    if(!await Enrollment.exists({student:studentId,class:{$in:classIds}}))throw new HttpError(404,'NOT_FOUND','Student not found');
  }
  const student=await User.findOne({_id:studentId,role:'student'});if(!student)throw new HttpError(404,'NOT_FOUND','Student not found');
  if(!classIds){const enrolled=(await Enrollment.find({student:studentId}).distinct('class')).map(String);const attemptedIds=await QuizAttempt.find({student:studentId,status:'submitted'}).distinct('quiz');const attemptedClasses=(await Quiz.find({_id:{$in:attemptedIds}}).distinct('class')).map(String);classIds=[...new Set([...enrolled,...attemptedClasses])];}
  const data=await loadData(classIds,studentId);
  return calculateProgress({id:student.id,name:student.name},data.quizzes,data.attempts,data.enrollments,['teacher','admin'].includes(actor.role),filter);
}
export async function classPerformance(actor:PublicUser,classId:string,filter:ProgressFilter):Promise<ClassPerformance> {
  const cls=await requireClass(actor,classId,true);const data=await loadData([classId]);
  const attempts=data.attempts.filter(a=>inRange(a.submittedAt,filter));const ids=[...new Set([...data.enrollments.filter(e=>e.status==='active').map(e=>e.studentId),...attempts.map(a=>a.studentId)])];
  const students=await User.find({_id:{$in:ids},role:'student'}).sort({name:1,_id:1});
  const rows=students.map(s=>({id:s.id,name:s.name,summary:calculateProgress({id:s.id,name:s.name},data.quizzes,attempts,data.enrollments,true,filter).summary}));
  const latest=latestAttempts(attempts);const groups=performance(latest,data.quizzes,attempts);const assigned=rows.reduce((sum,r)=>sum+r.summary.assigned,0);const completed=rows.reduce((sum,r)=>sum+r.summary.completed,0);
  return {class:{id:cls.id,name:cls.name},generatedAt:new Date().toISOString(),timezone:'Asia/Colombo',policy:'Latest submitted attempt per student and quiz; includes unpublished scores.',filter,summary:{students:rows.length,quizzes:data.quizzes.filter(q=>q.status!=='draft'&&inRange(q.endsAt,filter)).length,assigned,completed,completionRate:assigned?round(completed/assigned*100):null,average:latest.length?round(latest.reduce((sum,a)=>sum+a.percentage,0)/latest.length):null,passRate:latest.length?round(latest.filter(a=>a.passed).length/latest.length*100):null},...groups,students:rows};
}
