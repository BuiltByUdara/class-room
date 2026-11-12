# REST API contracts

Base `/api`. JSON success: `{ "data": ... }`; error: `{ "error": { "code": "...", "message": "...", "details": ... } }`. No body for 204. All mutations require `Origin: <APP_ORIGIN>` and `X-Requested-With: tuition-web`. Authentication uses an HttpOnly session cookie. No bearer token or public registration.

The frontend calls its configured `VITE_API_URL` origin with `credentials: include`. CORS permits exactly `APP_ORIGIN` and credentials; OPTIONS preflights allow GET/POST/PATCH/PUT/DELETE with Content-Type and X-Requested-With. Other origins are rejected with 403. Public health requests without an Origin remain supported. Web and API may be deployed on separate services.

## Implemented in Phase 1

| Method and path | Access | Body | Response |
|---|---|---|---|
| POST /auth/login | Public, throttled | `{email,password}` | 200 `{data:{user}}` + session cookie |
| POST /auth/logout | Any | `{}` | 204; revoke and clear cookie |
| GET /auth/me | Authenticated | — | 200 `{data:{user}}` |
| POST /auth/password/forgot | Public, throttled | `{email}` | 202 generic message; email if eligible |
| POST /auth/password/reset | Public, throttled | `{token,password}` | 204; single-use token, revoke sessions |
| POST /users/invitations | Admin | `{name,email,role}` | 201 `{data:{user}}`; invitation email |
| GET /health | Public | — | 200 `{data:{status:"ready"}}` or 503 `{data:{status:"unavailable"}}` |

Public user: `{id:string,name:string,email:string,role:"admin"|"teacher"|"student"|"parent"}`. Unexpected request properties are rejected. Error codes: VALIDATION_ERROR 400, INVALID_TOKEN 400, INVALID_CREDENTIALS/UNAUTHENTICATED 401, FORBIDDEN/INVALID_ORIGIN 403, NOT_FOUND 404, CONFLICT 409, RATE_LIMIT 429, EMAIL_FAILED 503. If invitation delivery fails, the invited account remains and password reset can resend its activation link. Reset responses deliberately do not disclose account existence; timing equalization and a durable mail queue are production-hardening items.

## Implemented in Phase 2

Paginated responses use `{data:{items:[],meta:{page,limit,total}}}` with default limit 20 and maximum 100. Class and user lists support literal `search`; user lists support `role` and `status`, class lists support `status`. IDs are validated ObjectId strings. Out-of-scope records return 404 to avoid confirming existence.

| Method and path | Access and body | Response |
|---|---|---|
| GET /users | Admin: all; teacher: own enrolled students | Paginated Member DTOs |
| GET /users/:id | Admin | Member DTO |
| PATCH /users/:id | Admin; `{name,role,status}` | Updated Member DTO |
| POST /users/:id/deactivate | Admin | Updated Member DTO; sessions revoked |
| GET /students/:id/profile | Admin, owning teacher, self, linked parent | Profile or null |
| PUT /students/:id/profile | Admin; `{studentNumber,grade,school}` | Saved profile |
| GET /relationships | Admin | Paginated `{id,parent:Member,student:Member}` |
| POST /relationships | Admin; `{parentId,studentId}` | 201 `{data:{id}}` |
| DELETE /relationships/:id | Admin | 204; parent access revoked |
| GET /parents/me/children | Parent | Array of linked Member DTOs |
| GET /students/:id/classes | Admin, owning teacher, self, linked parent | Array of accessible active classes |
| GET /classes | Role-scoped | Paginated Class DTOs |
| POST /classes | Admin or teacher; `{name,subject,grade,teacherId,status?}` | 201 Class DTO |
| GET /classes/:id | Role-scoped | Class DTO |
| PATCH /classes/:id | Admin/owning teacher; complete class fields | Updated Class DTO |
| GET /classes/:id/batches | Scoped; learners see only their assigned batches | Array of Batch DTOs |
| POST /classes/:id/batches | Admin/owning teacher; `{name,schedule,timezone,status?}` | 201 Batch DTO |
| PATCH /batches/:id | Admin/owning teacher; complete batch fields | Updated Batch DTO |
| GET /classes/:id/enrollments | Admin/owning teacher: roster; learners: own/linked records only | Paginated Enrollment DTOs |
| POST /classes/:id/enrollments | Admin enrolls or restores; teacher changes batch for already-enrolled students; `{studentId,batchId:null|string}` | 200 `{data:{id}}` |
| DELETE /classes/:id/enrollments/:studentId | Admin/owning teacher | 204; status becomes removed |
| GET /dashboard | Authenticated, scoped | `{classes,students,batches,users?,children?}` |

Member is PublicUser plus `status`. Class is `{id,name,subject,grade,teacherId,status}`. Batch is `{id,classId,name,schedule,timezone,status}`. Enrollment is `{id,studentId,studentName,batchId,status}`. Profile is `{studentNumber,grade,school}`. Shared request validators and DTOs live in `packages/contracts/src/index.ts`.

Updates are transactional and audited. Last-active-admin removal returns 409 `LAST_ADMIN`; role changes on referenced academic accounts return 409 `ROLE_IN_USE`. Invitations must be accepted before activation. Archiving an occupied batch returns 409 `BATCH_IN_USE`; moving or removing its students first resolves this. Archived classes remain visible to managers but are unavailable for new enrollments and hidden from students/parents. Student roster DTOs omit email and all authentication fields. Parent unlinking takes effect on the next API request. Management transactions require a replica set.

## Planned contracts — not exposed yet

List endpoints use `page` (default 1), `limit` (default 20, maximum 100), explicit search/status filters, and `{data:{items:T[],meta:{page,limit,total}}}`. ObjectId parameters, dates, enums and pagination must be validated. Every query is scoped to the caller before pagination or aggregation.

| Phase | Endpoints | Authorization and contract |
|---|---|---|
| 3 | GET/POST /quizzes; GET/PATCH /quizzes/:id | Admin/owner teacher; student read stripped of answer keys |
| 3 | POST /quizzes/:id/duplicate; POST /quizzes/:id/publish; POST /quizzes/:id/archive | Admin/owner teacher; copy creates draft with new IDs |
| 3 | PUT /quizzes/:id/questions | Admin/owner teacher; validated array `{type,prompt,topic,marks,options:[{id,text}],correctOptionIds}` |
| 3 | GET /quizzes/available | Student; active enrollment plus scheduling |
| 3 | POST /quizzes/:id/attempts | Student; 201 new or 200 resumable `{id,deadline,serverTime,questions,answers,version}` |
| 3 | GET /attempts/:id; PATCH /attempts/:id/answers | Owner student only; autosave `{version,answers:[{questionId,optionIds}]}`; 409 stale version |
| 3 | POST /attempts/:id/submit | Owner student; atomic finalization, repeated submit returns existing finalization; never returns unpublished score |
| 3 | PATCH /quizzes/:id/publication | Admin/owner teacher; `{resultsPublished,allowReview}` |
| 4 | GET /students/:id/results; GET /students/:id/progress | Self, authorized teacher/admin or linked parent; publication filter mandatory |
| 4 | GET /parents/me/children/:id/progress | Linked parent only; relationship checked on each request |
| 4 | GET /classes/:id/performance; GET /classes/:id/subjects | Admin/assigned teacher |
| 4 | GET /students/:id/progress-report | Same scope as progress; attachment response |

Quiz mutation body: `{title,description,subject,classId,batchId?,durationSeconds,passingMarks,startsAt,endsAt,maxAttempts,randomizeQuestions,randomizeOptions,allowReview}`. Backend computes totals; caller cannot set scores. Attempts use server timestamps. Deadline is `min(startedAt+duration, endsAt)`. Random order is persisted and stable across refreshes. Saved answers never include correct-answer metadata. Network retry and duplicate finalization are idempotent; a later submitted answer must never alter a finalized score.

Progress response: `{assigned,completed,missed,average,highest,lowest,passRate,completionRate,recentResults,monthly,subjects,topics}`. Zero-data metrics return null where an average is undefined, not a fabricated zero score. Define latest-versus-best retake policy before Phase 4 implementation. Use unique completed quiz counts for completion rates, distinct from total attempt counts.

