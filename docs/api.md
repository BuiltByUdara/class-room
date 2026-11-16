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

## Implemented in Phase 3

Manager means admin or the teacher owning the quiz class. Lists are paginated.

| Method and path | Access and behavior |
|---|---|
| GET/POST /quizzes; GET/PATCH /quizzes/:id | Manager list/create/update; eligible students may read a safe individual quiz |
| POST /quizzes/:id/duplicate | Manager; copies into a new draft |
| POST /quizzes/:id/publish, /close, /archive | Manager; empty body; close/archive finalizes active attempts |
| PATCH /quizzes/:id/publication | Manager; `{resultsPublished,allowReview}` |
| GET /quizzes/available | Student; active enrollment and schedule |
| POST /quizzes/:id/attempts | Student; empty body; 200 new or resumable attempt |
| GET /attempts | Student's own attempts |
| GET /quizzes/:id/attempts | Manager's quiz attempts |
| GET /attempts/:id | Owner student; resume or finalized result |
| PATCH /attempts/:id/answers | Owner student; `{version,answers:[{questionId,optionIds}]}` |
| POST /attempts/:id/submit | Owner student; same answer/version body; idempotent finalization |

Quiz create/update contains the full quiz settings and questions array; there is no separate questions endpoint. Exact validators and DTOs are in `packages/contracts/src/quizzes.ts`. The server derives totals, grading and deadlines. Content freezes after the first attempt. Stale autosaves return 409; unpublished scores and unauthorized answer keys are omitted. See phase3.md.

## Implemented in Phase 4

| Method and path | Access and response |
|---|---|
| GET /students/:id/progress | Self, linked parent, owning teacher or admin; ProgressData |
| GET /parents/me/children/:id/progress | Linked parent only; ProgressData |
| GET /students/:id/results | Same scope; paginated ResultRow records |
| GET /students/:id/progress-report | Same scope; CSV attachment |
| GET /classes/:id/performance | Admin/owning teacher; ClassPerformance |
| GET /classes/:id/subjects | Admin/owning teacher; subject averages |

All accept optional inclusive ISO UTC `from`/`to`; results additionally accepts `page` and `limit` (maximum 100). Invalid or reversed ranges return 400. Parent relationships and teacher class ownership are checked on each request. Teacher student reports contain only that teacher's classes. Family responses exclude unpublished scores from all aggregates and export cells, retaining a pending-result indicator.

ProgressData contains student, generatedAt, timezone, policy, filter, summary, monthly, subjects, topics, strengths, weaknesses, recentActivity and missedQuizzes. Summary includes assigned/completed/missed, attemptCount, pendingResults, visibleQuizzes, average/highest/lowest/latestScore, passRate and completionRate. Undefined metrics are null. Full DTO definitions are in `packages/contracts/src/progress.ts`; aggregation rules are documented in phase4.md.
