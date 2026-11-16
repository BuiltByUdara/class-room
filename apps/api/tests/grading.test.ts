import { describe,it,expect } from 'vitest';
import { grade } from '../src/modules/quizzes/grading.js';
import { questionInputSchema, quizInputSchema } from '@tuition/contracts';
describe('Objective grading',()=>{
  const questions=[{id:'one',marks:2,correctOptionIds:['a']},{id:'two',marks:3,correctOptionIds:['b','c']},{id:'three',marks:1,correctOptionIds:['true']}];
  it('awards exact-match marks and passes at the threshold',()=>{const result=grade(questions,[{questionId:'one',optionIds:['a']},{questionId:'two',optionIds:['c','b']}],5);expect(result).toMatchObject({score:5,totalMarks:6,percentage:83.33,passed:true});});
  it('does not grant partial marks for incomplete or excessive selections',()=>{expect(grade(questions,[{questionId:'one',optionIds:['a','b']},{questionId:'two',optionIds:['b']}],1)).toMatchObject({score:0,passed:false});});
  it('scores unanswered questions as zero',()=>{expect(grade(questions,[],1).score).toBe(0);});
  it('grades true/false and ignores answer ordering',()=>{expect(grade(questions,[{questionId:'three',optionIds:['true']},{questionId:'two',optionIds:['c','b']},{questionId:'one',optionIds:['a']}],6)).toMatchObject({score:6,percentage:100,passed:true});});
  it('rejects invalid correct-option references and duplicate options',()=>{expect(questionInputSchema.safeParse({type:'single',prompt:'Test',topic:'Test',marks:1,options:[{id:'a',text:'A'},{id:'a',text:'B'}],correctOptionIds:['missing']}).success).toBe(false);});
  it('requires valid boolean labels and one correct boolean answer',()=>{expect(questionInputSchema.safeParse({type:'boolean',prompt:'Test',topic:'Test',marks:1,options:[{id:'a',text:'Yes'},{id:'b',text:'No'}],correctOptionIds:['a','b']}).success).toBe(false);});
  it('rejects empty quizzes',()=>{expect(quizInputSchema.safeParse({questions:[]}).success).toBe(false);});
});
