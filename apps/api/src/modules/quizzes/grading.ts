export interface GradingQuestion { id:string; marks:number; correctOptionIds:string[] }
export function grade(questions: GradingQuestion[], answers: {questionId:string;optionIds:string[]}[], passingMarks:number) {
  const chosen = new Map(answers.map(a => [a.questionId,new Set(a.optionIds)]));
  const review = questions.map(q => { const selected = chosen.get(q.id) || new Set<string>(); const correct = selected.size === q.correctOptionIds.length && q.correctOptionIds.every(id => selected.has(id)); return {questionId:q.id,correctOptionIds:q.correctOptionIds,awardedMarks:correct ? q.marks : 0}; });
  const score = review.reduce((sum,q) => sum+q.awardedMarks,0); const totalMarks = questions.reduce((sum,q) => sum+q.marks,0);
  return {score,totalMarks,percentage:totalMarks ? Math.round(score/totalMarks*10000)/100 : 0,passed:score>=passingMarks,review};
}
