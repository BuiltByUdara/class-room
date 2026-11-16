// Disposable browser QA fixture. Never connects to the application database.
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { User, Class, Enrollment, ParentStudentRelationship, Quiz, QuizAttempt } from '../src/db/models.js';
const db = await MongoMemoryReplSet.create({ binary: { downloadDir: fileURLToPath(new URL('../../../node_modules/.cache/mongodb-memory-server/',import.meta.url)) }, replSet: { count: 1 } });
await mongoose.connect(db.getUri());
await Promise.all(Object.values(mongoose.models).map(m => m.init()));
const password = randomBytes(18).toString('base64url');
const passwordHash = await bcrypt.hash(password,12);
const [admin, teacher, student, parent] = await User.create(['admin','teacher','student','parent'].map(role => ({ name:`QA ${role}`,email:`${role}@example.test`,role,status:'active',passwordHash })));
const cls = await Class.create({name:'Geometry Circle',subject:'Mathematics',grade:8,teacher:teacher._id});
await Enrollment.create({class:cls._id,student:student._id,joinedAt:new Date(Date.now()-365*86400000)});
await ParentStudentRelationship.create({parent:parent._id,student:student._id,linkedBy:admin._id});
const sibling=await User.create({name:'QA new learner',email:'sibling@example.test',role:'student',status:'active',passwordHash});
await ParentStudentRelationship.create({parent:parent._id,student:sibling._id,linkedBy:admin._id});
for(let i=0;i<3;i++){
  const submittedAt=new Date();submittedAt.setUTCMonth(submittedAt.getUTCMonth()-2+i);submittedAt.setUTCDate(5);
  const quiz=await Quiz.create({title:['Fractions baseline','Geometry practice','Unit review'][i],subject:'Mathematics',class:cls._id,createdBy:teacher._id,durationSeconds:600,passingMarks:2,startsAt:new Date(submittedAt.getTime()-600000),endsAt:submittedAt,maxAttempts:1,status:'closed',resultsPublished:i<2});
  const snapshot=Array.from({length:4},(_,q)=>({id:new mongoose.Types.ObjectId().toString(),type:'single',prompt:`Practice question ${q+1}`,topic:q<2?'Fractions':'Geometry',marks:1,options:[{id:'a',text:'Correct'},{id:'b',text:'Alternative'}],correctOptionIds:['a']}));
  await QuizAttempt.create({quiz:quiz._id,student:student._id,attemptNumber:1,startedAt:quiz.startsAt,deadline:submittedAt,submittedAt,status:'submitted',score:i+2,totalMarks:4,percentage:(i+2)*25,passed:true,passingMarks:2,quizTitle:quiz.title,snapshot,answers:snapshot.map((q,j)=>({question:q.id,optionIds:[j<i+2?'a':'b']}))});
}
await Quiz.create({title:'Weekly revision',subject:'Mathematics',class:cls._id,createdBy:teacher._id,durationSeconds:600,passingMarks:1,startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()-3600000),maxAttempts:1,status:'closed',resultsPublished:true});
const config = readConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:5174',MONGODB_URI:db.getUri(),SMTP_HOST:'localhost',MAIL_FROM:'qa@example.test'});
const server = createApp(config, async () => {}).listen(4001,'127.0.0.1', () => console.log(JSON.stringify({ url:'http://localhost:5174',email:admin.email,password,disposable:true })));
const stop = () => { server.close(() => { void mongoose.disconnect().then(() => db.stop()).then(() => process.exit(0)); }); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
