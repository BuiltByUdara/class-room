import {describe,it,expect} from 'vitest';
import {calculateProgress,reportingMonth,type AnalyticsQuiz,type AnalyticsAttempt,type AnalyticsEnrollment} from '../src/modules/progress/calculations.js';
import {csvCell,progressCsv} from '../src/modules/reports/csv.js';
const quizzes:AnalyticsQuiz[]=[
  {id:'q1',title:'First',subject:'Maths',classId:'c1',batchId:null,startsAt:new Date('2026-09-01'),endsAt:new Date('2026-11-01'),status:'published',resultsPublished:true},
  {id:'q2',title:'Hidden',subject:'Secret subject',classId:'c1',batchId:null,startsAt:new Date('2026-10-01'),endsAt:new Date('2026-11-02'),status:'closed',resultsPublished:false},
  {id:'q3',title:'Missed',subject:'Maths',classId:'c1',batchId:null,startsAt:new Date('2026-10-01'),endsAt:new Date('2026-11-03'),status:'closed',resultsPublished:true},
  {id:'q4',title:'Draft',subject:'Maths',classId:'c1',batchId:null,startsAt:new Date('2026-10-01'),endsAt:new Date('2026-11-03'),status:'draft',resultsPublished:false},
  {id:'q5',title:'Upcoming',subject:'Maths',classId:'c1',batchId:null,startsAt:new Date('2026-12-01'),endsAt:new Date('2026-12-02'),status:'scheduled',resultsPublished:false},
  {id:'q6',title:'Other batch',subject:'Maths',classId:'c1',batchId:'batch2',startsAt:new Date('2026-10-01'),endsAt:new Date('2026-11-03'),status:'closed',resultsPublished:true},
];
const attempts:AnalyticsAttempt[]=[
  {id:'a1',quizId:'q1',studentId:'s1',attemptNumber:1,submittedAt:new Date('2026-09-20'),score:5,totalMarks:10,percentage:50,passed:true,topics:[{name:'Fractions',earned:5,possible:10}]},
  {id:'a2',quizId:'q1',studentId:'s1',attemptNumber:2,submittedAt:new Date('2026-11-01'),score:10,totalMarks:10,percentage:100,passed:true,topics:[{name:'Fractions',earned:10,possible:10}]},
  {id:'a3',quizId:'q2',studentId:'s1',attemptNumber:1,submittedAt:new Date('2026-11-02'),score:2.5,totalMarks:10,percentage:25,passed:false,topics:[{name:'Hidden topic',earned:2.5,possible:10}]},
];
const enrollments:AnalyticsEnrollment[]=[{studentId:'s1',classId:'c1',batchId:'batch1',status:'active',enrolledAt:new Date('2026-08-01')}];
const calculate=(manager=false)=>calculateProgress({id:'s1',name:'Student'},quizzes,attempts,enrollments,manager,{},new Date('2026-11-16'));
describe('Progress calculations',()=>{
  it('counts quizzes once and excludes hidden scores from every family aggregate',()=>{const p=calculate();expect(p.summary).toMatchObject({assigned:4,completed:2,missed:1,pendingResults:1,visibleQuizzes:1,attemptCount:3,average:100,highest:100,lowest:100,latestScore:100,passRate:100,completionRate:50});expect(p.subjects).toEqual([{name:'Maths',average:100,count:1}]);expect(p.topics.map(t=>t.name)).toEqual(['Fractions']);expect(p.results[0]).toMatchObject({published:false,score:null,percentage:null,passed:null,totalMarks:null});});
  it('preserves monthly history while retakes replace summary scores',()=>{const p=calculate();expect(p.monthly).toEqual([{month:'2026-09',average:50,count:1},{month:'2026-11',average:100,count:1}]);expect(p.results).toHaveLength(3);});
  it('includes unpublished results for class managers',()=>{const p=calculate(true);expect(p.summary.average).toBe(62.5);expect(p.summary.pendingResults).toBe(0);expect(p.weaknesses[0].name).toBe('Hidden topic');});
  it('does not count drafts, unrelated batches, future quizzes as missed',()=>{expect(calculate().missedQuizzes.map(q=>q.id)).toEqual(['q3']);});
  it('returns null averages and rates for no data',()=>{const p=calculateProgress({id:'s2',name:'New student'},quizzes,[],[],false);expect(p.summary).toMatchObject({assigned:0,completed:0,average:null,highest:null,lowest:null,passRate:null,completionRate:null});expect(p.monthly).toEqual([]);});
  it('keeps historical completions after removal without adding new assignments',()=>{const p=calculateProgress({id:'s1',name:'Student'},quizzes,attempts,[],false);expect(p.summary.assigned).toBe(2);expect(p.summary.completed).toBe(2);expect(p.summary.completionRate).toBe(100);});
  it('excludes deadlines before joining and respects batch-change dates',()=>{const p=calculateProgress({id:'s1',name:'Student'},quizzes,[],[{...enrollments[0],batchId:'batch2',enrolledAt:new Date('2026-11-02T12:00:00Z'),batchJoinedAt:new Date('2026-11-04')}],false,{},new Date('2026-11-16'));expect(p.summary.assigned).toBe(2);expect(p.missedQuizzes.map(q=>q.id)).toEqual(['q3']);});
  it('filters attempt submission times and quiz deadlines consistently',()=>{const p=calculateProgress({id:'s1',name:'Student'},quizzes,attempts,enrollments,false,{from:'2026-09-01T00:00:00.000Z',to:'2026-09-30T23:59:59.999Z'});expect(p.summary.average).toBe(50);expect(p.summary.assigned).toBe(1);expect(p.results).toHaveLength(1);});
  it('buckets month boundaries in Asia/Colombo',()=>{expect(reportingMonth(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');});
  it('quotes CSV and neutralizes spreadsheet formulas',()=>{expect(csvCell('=SUM(A1:A2)')).toBe('"\'=SUM(A1:A2)"');expect(csvCell('  +cmd')).toBe('"\'  +cmd"');expect(csvCell('A,"B"')).toBe('"A,""B"""');const p=calculate();const csv=progressCsv(p,p.results);expect(csv).toContain('Awaiting publication');expect(csv).not.toContain('Hidden topic');});
});
