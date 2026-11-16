import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const optionId = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
export const questionInputSchema = z.object({
  type: z.enum(['single','multiple','boolean']), prompt: z.string().trim().min(1).max(2000), topic: z.string().trim().min(1).max(100),
  marks: z.number().int().min(1).max(100), options: z.array(z.object({ id: optionId, text: z.string().trim().min(1).max(500) }).strict()).min(2).max(8),
  correctOptionIds: z.array(optionId).min(1).max(8),
}).strict().superRefine((q,ctx) => {
  if (new Set(q.options.map(o => o.id)).size !== q.options.length) ctx.addIssue({code:'custom',message:'Option IDs must be unique'});
  if (new Set(q.correctOptionIds).size !== q.correctOptionIds.length || q.correctOptionIds.some(id => !q.options.some(o => o.id === id))) ctx.addIssue({code:'custom',message:'Correct answers must be unique existing options'});
  if (q.type !== 'multiple' && q.correctOptionIds.length !== 1) ctx.addIssue({code:'custom',message:'Single-answer questions need exactly one correct answer'});
  if (q.type === 'boolean' && (q.options.length !== 2 || !q.options.some(o => o.text.toLowerCase() === 'true') || !q.options.some(o => o.text.toLowerCase() === 'false'))) ctx.addIssue({code:'custom',message:'True/False questions need True and False options'});
});
export const quizInputSchema = z.object({
  title: z.string().trim().min(2).max(150), description: z.string().trim().max(3000), subject: z.string().trim().min(1).max(100), classId: id, batchId: id.nullable(),
  durationSeconds: z.number().int().min(60).max(14400), passingMarks: z.number().int().min(0), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  maxAttempts: z.number().int().min(1).max(10), randomizeQuestions: z.boolean(), randomizeOptions: z.boolean(), questions: z.array(questionInputSchema).min(1).max(100),
}).strict().superRefine((q,ctx) => {
  if (Date.parse(q.endsAt) <= Date.parse(q.startsAt)) ctx.addIssue({code:'custom',path:['endsAt'],message:'End must be later than start'});
  if (q.passingMarks > q.questions.reduce((sum,v) => sum+v.marks,0)) ctx.addIssue({code:'custom',path:['passingMarks'],message:'Passing marks cannot exceed total marks'});
});
export const answersSchema = z.object({ version: z.number().int().min(0), answers: z.array(z.object({ questionId:id, optionIds:z.array(optionId).max(8) }).strict()).max(100) }).strict().superRefine((v,ctx) => {
  if (new Set(v.answers.map(a => a.questionId)).size !== v.answers.length) ctx.addIssue({code:'custom',message:'Duplicate question answers'});
});
export const publicationSchema = z.object({ resultsPublished:z.boolean(),allowReview:z.boolean() }).strict();
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuizInput = z.infer<typeof quizInputSchema>;
export type AnswerInput = z.infer<typeof answersSchema>;
export interface PublicQuestion extends Omit<QuestionInput,'correctOptionIds'> { id:string }
export interface QuizData { id:string; title:string; description:string; subject:string; classId:string; batchId:string|null; durationSeconds:number; passingMarks:number; totalMarks:number; startsAt:string; endsAt:string; maxAttempts:number; randomizeQuestions:boolean; randomizeOptions:boolean; status:string; resultsPublished:boolean; allowReview:boolean; attemptsUsed?:number; canEdit?:boolean; questions?:QuestionInput[] }
export interface AttemptData { id:string; quizId:string; quizTitle:string; studentId:string; studentName?:string; attemptNumber:number; status:'in_progress'|'submitted'; startedAt:string; deadline:string; submittedAt?:string; serverTime:string; version:number; questions:PublicQuestion[]; answers:AnswerInput['answers']; result?:{score:number;totalMarks:number;percentage:number;passed:boolean}; review?:{questionId:string;correctOptionIds:string[];awardedMarks:number}[] }
