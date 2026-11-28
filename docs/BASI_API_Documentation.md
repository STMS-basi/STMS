# BASI | Backend API Documentation

School Transportation Management System (STMS)
**API v1.0 · Handover release · 28 November 2026**
Branch: `feature/backend-auth` · Commit: `bae5c0b`

## 1. Release overview and connection

This reference covers 49 HTTP operations (48 functional, 1 diagnostic), based on the supplied Swagger v1 OpenAPI document and controller source exported from the release commit. Request constraints come from Swagger; success bodies and explicit application error codes come from the controllers. Examples are synthetic, not live data. JSON uses the expected ASP.NET Core camelCase convention; runtime serialization and global authorization configuration were not supplied for separate review.

| Setting | Value |
|---|---|
| HTTPS development base URL | `https://localhost:7146` |
| HTTP development base URL | `http://localhost:5016` |
| Swagger UI | `https://localhost:7146/swagger/index.html` |
| OpenAPI JSON | `http://localhost:5016/swagger/v1/swagger.json` |
| Repository | `https://github.com/STMS-basi/STMS` |
| Backend branch / commit | `feature/backend-auth` / `bae5c0b` |
| Request format | `application/json` |

Use the base URL for the running backend, not the Angular port. For an Angular development proxy, use relative `/api/...` paths and configure the proxy to the actual backend; do not use the isolated QA port as the shared release URL. Do not hardcode credentials or a token into frontend source.

| Module | Operations |
|---|---:|
| Authentication / Profile | 2 / 3 |
| Parents / Students | 1 / 5 |
| Routes / Stops | 8 / 6 |
| Buses / Drivers | 6 / 6 |
| Subscriptions / Payments | 8 / 3 |
| Diagnostic | 1 |
| Total | 49 |

## 2. Authentication, conventions and errors

Login returns a JWT, the user's role, full name and email. Send the JWT on protected calls:

```http
Authorization: Bearer <JWT_FROM_LOGIN>
Content-Type: application/json
```

Access labels: Public = no controller/action authorization requirement (or explicit AllowAnonymous); Authenticated = any authenticated role; Parent and Admin = the exact role required. The supplied Swagger applies Bearer globally, which does not distinguish these access rules. The controller attributes are used here; any global fallback policy in Program.cs was not supplied. Registration always creates a Parent, not an Admin. JWT expiry is configured on the server (60 minutes by default in login code). Admin `fullName` can be an empty string. No server logout, refresh-token or password-reset operation appears in this API; frontend logout should clear local authentication state.

All path IDs are 32-bit integers. For request objects, use the documented field names and send canonical enum-like values. Transport type must be exactly `OneWay` or `RoundTrip`; direction is trimmed and case-insensitively normalized. Dates use ISO 8601 date-time; stop schedule strings use 24-hour `HH:mm`. Nullable fields must be handled explicitly. Lists may return `[]`; never replace empty server data with demo records.

| Code | Meaning / frontend handling |
|---|---|
| 200 | Successful read or mutation; parse the documented body. |
| 201 | Resource/request created; use returned server ID and refresh data. |
| 400 | Invalid request or business validation; show message or validation errors. |
| 401 | Missing/invalid/expired authentication or unresolved identity; handle session/login. |
| 403 | Wrong role; do not retry as the same user. |
| 404 | Resource missing, unavailable or outside the parent's ownership. |
| 409 | Conflict with current state, duplicates, capacity or protected records. Refresh state. |
| 500 | Unexpected server/database failure; do not report a successful mutation. |

Endpoint tables list explicit application-level errors; protected operations can additionally return framework 401/403, and malformed DTOs can return automatic 400 validation responses. Unexpected failures can occur in any operation. Error body typically follows this example; automatic model validation may instead use ProblemDetails with `errors`. Do not assume every error has a JSON body or message.

```json
{"message":"Selected route is full."}
```

The following sections use shared named response examples to avoid repeating identical payloads. Array responses use `[]` around the corresponding object; example IDs must be replaced by actual server IDs. A dash in the request column means no JSON body.

## 3. Authentication and profile (5 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| POST `/api/auth/register` | Public | Register | 201 Register result | 409 |
| POST `/api/auth/login` | Public | Login | 200 Login result | 401 |
| GET `/api/profile` | Authenticated | — | 200 Profile | — |
| GET `/api/profile/parent` | Parent | — | 200 Parent greeting | — |
| GET `/api/profile/admin` | Admin | — | 200 Admin greeting | — |

**Register request** — required: fullName (1–150), email (valid email, max 150), phone (1–20), address (1–250), password (min 8). Email is normalized to lowercase; passwords are BCrypt-hashed; duplicate email returns 409.

```json
{"fullName":"Example Parent","email":"parent@example.test",
 "phone":"0700000000","address":"Example address",
 "password":"<your-password>"}
```

**Register result — 201**

```json
{"message":"Registered successfully"}
```

**Login request** — email and password required; invalid email/password or inactive account returns 401.

```json
{"email":"parent@example.test","password":"<your-password>"}
```

**Login result — 200**

```json
{"token":"<JWT_FROM_LOGIN>","role":"Parent",
 "fullName":"Example Parent","email":"parent@example.test"}
```

**Profile and role greetings — 200**

```json
{"message":"You are authenticated!","userId":"10",
 "email":"parent@example.test","role":"Parent"}
```
```json
{"message":"Welcome Parent!","role":"Parent"}
```
```json
{"message":"Welcome Admin!","role":"Admin"}
```

`userId` in the profile response is a string claim, not a numeric parent ID.

## 4. Parents and students (6 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/parents/admin` | Admin | — | 200 Parent[] | — |
| GET `/api/students/admin` | Admin | — | 200 AdminStudent[] | — |
| GET `/api/students` | Parent | — | 200 Student[] | 401, 404 |
| POST `/api/students` | Parent | Student input | 201 Student created | 400, 401, 404 |
| PUT `/api/students/{id}` | Parent | Student input | 200 Student updated | 400, 401, 404 |
| DELETE `/api/students/{id}` | Parent | — | 200 Student deleted | 401, 404, 409 |

**Parent (list item)**

```json
{"parentId":10,"userId":20,"fullName":"Example Parent",
 "email":"parent@example.test","phone":"0700000000",
 "address":"Example address","isActive":true,"studentCount":1}
```

**Student (list item)**

```json
{"studentId":101,"fullName":"Example Student","grade":"5",
 "className":"A","dateOfBirth":"2015-05-01T00:00:00","notes":null}
```

**AdminStudent (list item)** — same fields as Student, plus `parentId` and `parentName`.

```json
{"studentId":101,"fullName":"Example Student","grade":"5",
 "className":"A","dateOfBirth":"2015-05-01T00:00:00","notes":null,
 "parentId":10,"parentName":"Example Parent"}
```

**Student input (create/update)** — required: fullName (1–150), grade (1–20), className (1–20). Optional nullable: dateOfBirth (ISO date-time), notes (max 500). The parent is derived from JWT; do not submit parentId. Use DTO/server validation for date restrictions; Swagger does not expose additional custom date rules.

```json
{"fullName":"Example Student","grade":"5","className":"A",
 "dateOfBirth":"2015-05-01T00:00:00","notes":null}
```

**Mutation results**

```json
{"message":"Student created successfully.","studentId":101}
```
```json
{"message":"Student updated successfully.","studentId":101}
```
```json
{"message":"Student deleted successfully.","studentId":101}
```

Parent reads/updates/deletes are restricted to owned students; another parent's student returns 404. Deleting a student with any subscription history returns 409. Admin student/parent operations are read-only in this release.

## 5. Routes (8 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/routes` | Public | Optional `search`, `area` query strings | 200 RouteAvailability[] | — |
| GET `/api/routes/areas` | Public | — | 200 string[] | — |
| GET `/api/routes/{id}` | Public | — | 200 RouteDetail | 404 |
| GET `/api/routes/admin` | Admin | — | 200 Route[] | — |
| POST `/api/routes/admin` | Admin | Route input | 201 Route created | 400, 409 |
| PUT `/api/routes/admin/{id}` | Admin | Route input | 200 Route updated | 400, 404, 409 |
| PATCH `/api/routes/admin/{id}/deactivate` | Admin | — | 200 Route deactivated | 404, 409 |
| PATCH `/api/routes/admin/{id}/activate` | Admin | — | 200 Route activated | 400, 404, 409 |

Search example: `/api/routes?search=Abdoun&area=Amman`. Search matches name, route number, start point or destination (case-insensitive substring); area matches serviceArea (case-insensitive exact match). The public route list is not restricted to active routes. Areas are distinct and may include areas of inactive routes.

**RouteAvailability (public list item)**

```json
{"routeId":1,"routeNumber":"R1","name":"Example route",
 "startPoint":"Abdoun","destination":"Example school","serviceArea":"Amman",
 "capacity":30,"busId":21,"driverId":3,"isActive":true,
 "registrationOpen":true,"semesterStart":"2026-09-01T00:00:00",
 "semesterEnd":"2026-12-31T00:00:00","reservedSeats":7,"remainingSeats":23}
```

When registration is closed, `registrationOpen` is false; semesterStart, semesterEnd, reservedSeats and remainingSeats are null. Do not calculate a fake seat count from capacity. `routeId`, not `id`, is the route identifier. This response does not expose bus/driver active flags; active-route assignment checks are enforced in backend route operations. If the UI has separate authoritative status data, use it too.

**Areas response**

```json
["Amman","Example area"]
```

**Route (admin list item)** — no availability fields.

```json
{"routeId":1,"routeNumber":"R1","name":"Example route",
 "startPoint":"Abdoun","destination":"Example school","serviceArea":"Amman",
 "capacity":30,"busId":21,"driverId":3,"isActive":true}
```

**RouteDetail** — same base route fields, plus ordered `stops`. Unlike the dedicated public Stops API, this action does not reject inactive routes. Nested stop objects omit routeId.

```json
{"routeId":1,"routeNumber":"R1","name":"Example route",
 "startPoint":"Abdoun","destination":"Example school","serviceArea":"Amman",
 "capacity":30,"busId":21,"driverId":3,"isActive":true,
 "stops":[{"stopId":11,"name":"Example stop","stopOrder":1,
           "pickupTime":"07:00","dropoffTime":"14:30"}]}
```

**Route input (create/update)** — required strings: routeNumber (1–20), name/startPoint/destination (1–150 each), serviceArea (1–100); capacity positive integer. busId and driverId are nullable integer assignments. No `isActive` field in this request.

```json
{"routeNumber":"R1","name":"Example route","startPoint":"Abdoun",
 "destination":"Example school","serviceArea":"Amman","capacity":30,
 "busId":21,"driverId":3}
```

**Mutation results**

```json
{"message":"Route created successfully.","routeId":1,
 "routeNumber":"R1","isActive":true}
```
```json
{"message":"Route updated successfully.","routeId":1,"routeNumber":"R1"}
```
```json
{"message":"Route deactivated successfully.","routeId":1,"isActive":false}
```
```json
{"message":"Route activated successfully.","routeId":1,"isActive":true}
```

Route rules: create is active only when both bus and driver are assigned and pass validation. Incomplete assignments create an inactive route. PUT preserves the current active status; activate separately. An active route must retain both assignments; both must be active, not assigned to another active route, and bus capacity must cover route capacity. Route number must be unique. With a protected subscription (Pending/AwaitingPayment/Approved, end date today or later), deactivation and changes to startPoint, destination or serviceArea are blocked. Capacity cannot fall below the maximum protected reservation count grouped by semester date range; a conflict can include `minimumCapacity`. Public list availability counts overlapping reservations for the currently available registration semester.

```json
{"message":"Route capacity cannot be smaller than existing reservations for an active or future semester.","minimumCapacity":7}
```

## 6. Stops (6 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/stops/admin` | Admin | — | 200 Stop[] | — |
| GET `/api/stops/route/{routeId}` | Public | — | 200 Stop[] | 404 |
| GET `/api/stops/{id}` | Public | — | 200 Stop | 404 |
| POST `/api/stops/admin` | Admin | Stop input | 201 Stop created | 400, 409 |
| PUT `/api/stops/admin/{id}` | Admin | Stop input | 200 Stop updated | 400, 404, 409 |
| DELETE `/api/stops/admin/{id}` | Admin | — | 200 Stop deleted | 404, 409 |

**Stop (object or list item)** — Admin list includes stops on inactive routes; public Stops reads require an active route.

```json
{"stopId":11,"routeId":1,"name":"Example stop","stopOrder":1,
 "pickupTime":"07:00","dropoffTime":"14:30"}
```

**Stop input (create/update)** — name required (1–150); routeId and stopOrder positive integers. pickupTime and dropoffTime are nullable `HH:mm` strings. Both may be null; such stops are not eligible for any new subscription. The destination route must be active. No map coordinates are accepted in the DTO.

```json
{"routeId":1,"name":"Example stop","stopOrder":1,
 "pickupTime":"07:00","dropoffTime":"14:30"}
```

**Mutation results**

```json
{"message":"Stop created successfully.","stopId":11,"routeId":1,"stopOrder":1}
```
```json
{"message":"Stop updated successfully.","stopId":11,"routeId":1,"stopOrder":1}
```
```json
{"message":"Stop deleted successfully.","stopId":11}
```

Stop order must be unique per route. A stop with any subscription history cannot be moved to another route or deleted. For protected subscriptions (Pending/AwaitingPayment/Approved, end date today or later), the final code also blocks changes to name, order, pickupTime and dropoffTime. Do not assume an admin can correct a protected stop name. Concurrent modification may return 409; refresh and retry only when appropriate.

## 7. Buses (6 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/buses/admin` | Admin | — | 200 Bus[] | — |
| GET `/api/buses/admin/{id}` | Admin | — | 200 Bus | 404 |
| POST `/api/buses/admin` | Admin | Bus input | 201 Bus created | 400, 409 |
| PUT `/api/buses/admin/{id}` | Admin | Bus input | 200 Bus updated | 400, 404, 409 |
| PATCH `/api/buses/admin/{id}/deactivate` | Admin | — | 200 Bus deactivated | 400, 404, 409 |
| PATCH `/api/buses/admin/{id}/activate` | Admin | — | 200 Bus activated | 400, 404 |

**Bus (object or list item)**

```json
{"busId":21,"plateNumber":"EXAMPLE-21","capacity":30,"isActive":true}
```

**Bus input (create/update)** — plateNumber required (1–20); capacity positive integer. Plate must be unique. Create sets isActive to true; PUT does not change active status.

```json
{"plateNumber":"EXAMPLE-21","capacity":30}
```

**Mutation results**

```json
{"message":"Bus created successfully.","busId":21,"plateNumber":"EXAMPLE-21","capacity":30}
```
```json
{"message":"Bus updated successfully.","busId":21,"plateNumber":"EXAMPLE-21","capacity":30}
```
```json
{"message":"Bus deactivated successfully.","busId":21}
```
```json
{"message":"Bus activated successfully.","busId":21}
```

Deactivation is blocked if assigned to any active route. Reducing capacity below the capacity of an assigned active route returns 409. Repeating activate/deactivate on a bus already in the requested state returns 400 (unlike routes, which return 409). No DELETE operation exists for buses.

## 8. Drivers (6 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/drivers/admin` | Admin | — | 200 Driver[] | — |
| GET `/api/drivers/admin/{id}` | Admin | — | 200 Driver | 404 |
| POST `/api/drivers/admin` | Admin | Driver input | 201 Driver created | 400, 409 |
| PUT `/api/drivers/admin/{id}` | Admin | Driver input | 200 Driver updated | 400, 404, 409 |
| PATCH `/api/drivers/admin/{id}/deactivate` | Admin | — | 200 Driver deactivated | 400, 404, 409 |
| PATCH `/api/drivers/admin/{id}/activate` | Admin | — | 200 Driver activated | 400, 404 |

**Driver (object or list item)**

```json
{"driverId":3,"fullName":"Example Driver","phone":"0700000000",
 "licenseNumber":"EXAMPLE-LIC-3","isActive":true}
```

**Driver input (create/update)** — fullName required (1–150), phone required (1–20), licenseNumber optional nullable (max 50). Non-empty license numbers must be unique. Create sets active=true; PUT does not change it.

```json
{"fullName":"Example Driver","phone":"0700000000","licenseNumber":"EXAMPLE-LIC-3"}
```

**Mutation results**

```json
{"message":"Driver created successfully.","driverId":3,"fullName":"Example Driver",
 "phone":"0700000000","licenseNumber":"EXAMPLE-LIC-3"}
```
```json
{"message":"Driver updated successfully.","driverId":3,"fullName":"Example Driver",
 "phone":"0700000000","licenseNumber":"EXAMPLE-LIC-3"}
```
```json
{"message":"Driver deactivated successfully.","driverId":3}
```
```json
{"message":"Driver activated successfully.","driverId":3}
```

A driver assigned to an active route cannot be deactivated (409). Repeated activate/deactivate returns 400. A driver may not be assigned to multiple active routes. No DELETE operation exists for drivers.

## 9. Subscriptions (8 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/subscriptions/registration-info` | Public | — | 200 RegistrationInfo | — |
| GET `/api/subscriptions` | Parent | — | 200 Subscription[] | 401 |
| GET `/api/subscriptions/{id}` | Parent | — | 200 Subscription | 401, 404 |
| POST `/api/subscriptions` | Parent | Subscription input | 201 Subscription created | 400, 401, 404, 409 |
| POST `/api/subscriptions/{id}/renew` | Parent | — | 201 Subscription renewed | 400, 401, 404, 409 |
| GET `/api/subscriptions/admin` | Admin | — | 200 Subscription[] | — |
| PATCH `/api/subscriptions/admin/{id}/approve` | Admin | — | 200 Accepted | 400, 404, 409 |
| PATCH `/api/subscriptions/admin/{id}/reject` | Admin | — | 200 Rejected | 400, 404, 409 |

**RegistrationInfo (open and closed)** — dates below illustrate the JSON contract, not a promise of the deployed semester schedule. Backend uses SchoolSemesters configuration and local server date; opens the configured number of days before start (default 14), remains open through end date inclusive, and chooses the eligible semester with the latest start date. Query this endpoint rather than hardcoding dates.

```json
{"registrationOpen":true,"semesterName":"Example semester",
 "startDate":"2026-09-01T00:00:00","endDate":"2026-12-31T00:00:00",
 "message":"Registration is open."}
```
```json
{"registrationOpen":false,"semesterName":null,"startDate":null,"endDate":null,
 "message":"Registration is currently closed."}
```

**Subscription (object or list item)** — same projected fields for Parent and Admin. Parent only sees owned records. Lists are ordered by requestedAt descending. Legacy tripDirection may be null; do not guess the missing OneWay direction.

```json
{"subscriptionId":501,"referenceNumber":"SUB-A1B2C3D4E5F6",
 "studentId":101,"studentName":"Example Student","routeId":1,
 "routeName":"Example route","stopId":11,"stopName":"Example stop",
 "transportType":"OneWay","tripDirection":"MorningPickup","fee":150,
 "status":"Pending","startDate":"2026-09-01T00:00:00",
 "endDate":"2026-12-31T00:00:00","requestedAt":"2026-11-28T12:00:00"}
```

**Subscription input** — all IDs must be positive and the student must belong to the authenticated parent. The server calculates fee, semester dates, status and reference number; do not send those fields. Use the canonical values below.

```json
{"studentId":101,"routeId":1,"stopId":11,"transportType":"OneWay",
 "tripDirection":"MorningPickup"}
```
```json
{"studentId":101,"routeId":1,"stopId":11,"transportType":"OneWay",
 "tripDirection":"AfternoonDropoff"}
```
```json
{"studentId":101,"routeId":1,"stopId":11,"transportType":"RoundTrip",
 "tripDirection":"Both"}
```

| transportType | tripDirection | Required stop times | Semester fee (JOD) |
|---|---|---|---:|
| OneWay | MorningPickup | pickupTime | 150 |
| OneWay | AfternoonDropoff | dropoffTime | 150 |
| RoundTrip | Both | pickupTime and dropoffTime | 300 |

OneWay requires an explicit valid direction. RoundTrip accepts a missing/null/blank direction for compatibility and normalizes it to Both; send Both explicitly in new clients. A time must be nonblank to qualify. OneWay with Both or RoundTrip with only one direction returns 400. Direction strings are normalized; transportType is not.

**Subscription created — 201**

```json
{"message":"Subscription request created successfully.","subscriptionId":501,
 "referenceNumber":"SUB-A1B2C3D4E5F6","transportType":"OneWay",
 "tripDirection":"MorningPickup","fee":150,"status":"Pending",
 "startDate":"2026-09-01T00:00:00","endDate":"2026-12-31T00:00:00"}
```

Creation requires open registration, an active route with non-null bus and driver assignments, a stop belonging to that route and a compatible schedule. A student cannot hold overlapping protected subscriptions; overlapping Pending, AwaitingPayment and Approved requests count toward route capacity. A full route or duplicate semester request returns 409. No payment is made or created during this operation.

**Renewal — 201** — no body; path ID is the previous subscription ID. Previous subscription must be owned and Approved; registration must be open for a later semester. Reuses student, route, stop, transport type and direction; revalidates availability, schedule, seat capacity, duplicates and recalculates fee. Legacy OneWay without a valid direction requires a new subscription; legacy RoundTrip with no direction normalizes to Both. Renewal creates a new Pending record without changing the old record.

```json
{"message":"Subscription renewal request created successfully.",
 "previousSubscriptionId":501,"subscriptionId":502,
 "referenceNumber":"SUB-B1C2D3E4F5A6","studentId":101,"routeId":1,"stopId":11,
 "transportType":"OneWay","tripDirection":"MorningPickup","fee":150,
 "status":"Pending","startDate":"2027-01-15T00:00:00",
 "endDate":"2027-05-31T00:00:00"}
```

**Accepted — 200**

```json
{"message":"Subscription accepted. Awaiting full payment confirmation.",
 "subscriptionId":501,"status":"AwaitingPayment"}
```

**Rejected — 200**

```json
{"message":"Subscription rejected successfully.","subscriptionId":501,"status":"Rejected"}
```

Approve/reject operations accept only Pending. They return 409 for other existing states and 404 for missing IDs. No reject-after-accept, cancellation or subscription edit endpoint is provided. Legacy Cancelled records may exist but are not included in protected reservation counts.

## 10. Payments (3 operations)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/payments/my` | Parent | — | 200 Payment[] | 401 |
| GET `/api/payments/admin` | Admin | — | 200 AdminPayment[] | — |
| POST `/api/payments/admin` | Admin | Payment input | 200 Payment confirmed | 400, 401, 404, 409 |

**Payment (list item)** — scoped to current parent's subscriptions for /my; admin list includes all records. Empty array is valid. A pending or accepted subscription may not yet have a payment record; use subscription status as the source for the workflow.

```json
{"paymentId":301,"subscriptionId":501,"referenceNumber":"SUB-A1B2C3D4E5F6",
 "studentName":"Example Student","startDate":"2026-09-01T00:00:00",
 "endDate":"2026-12-31T00:00:00","amountDue":150,"amountPaid":150,
 "remainingAmount":0,"status":"Paid","paymentDate":"2026-11-28T12:30:00Z",
 "notes":"Example cash confirmation"}
```

**AdminPayment** — same fields as Payment, plus `recordedBy` (admin user ID; may be null on legacy records).

```json
{"paymentId":301,"subscriptionId":501,"referenceNumber":"SUB-A1B2C3D4E5F6",
 "studentName":"Example Student","startDate":"2026-09-01T00:00:00",
 "endDate":"2026-12-31T00:00:00","amountDue":150,"amountPaid":150,
 "remainingAmount":0,"status":"Paid","paymentDate":"2026-11-28T12:30:00Z",
 "recordedBy":900,"notes":"Example cash confirmation"}
```

**Payment input** — subscriptionId positive integer, amount positive and exactly equal to subscription fee; notes nullable string. C# uses decimal for amount; send a JSON number. No paymentMethod field or online payment gateway is present. Cash/bank transfer is a manual business process; the admin may describe the payment in notes.

```json
{"subscriptionId":501,"amount":150,"notes":"Cash received"}
```

**Payment confirmed — 200**

```json
{"message":"Full payment confirmed and subscription approved successfully.",
 "paymentId":301,"subscriptionId":501,"amountDue":150,"amountPaid":150,
 "remainingAmount":0,"paymentStatus":"Paid","subscriptionStatus":"Approved"}
```

Only AwaitingPayment can be confirmed. The backend creates a payment record if none exists, or uses an eligible unpaid record whose amount due matches the fee. It will not overwrite a previously paid or partially paid record, and it does not accept installments or overpayment. Both payment and subscription updates occur in one transaction. Parent has no payment-write operation.

**Incorrect amount — 400 example**

```json
{"message":"The full subscription fee must be paid in one payment. Installments are not allowed.",
 "requiredAmount":150}
```

## 11. Diagnostic operation (1 operation)

| Method and endpoint | Access | Request | Success | Explicit errors |
|---|---|---|---|---|
| GET `/api/test/db` | Public at controller level | — | 200 Database check | 500 |

```json
{"message":"Oracle connection successful!","usersCount":10}
```
```json
{"message":"Database connection or query failed."}
```

Development-only use is recommended. The supplied controller does not enforce authentication and discloses a user count on success; protect or remove the endpoint before public deployment. It is not a frontend feature.

## 12. Subscription and payment workflow

| Current state | Action / endpoint | Next state |
|---|---|---|
| No current request | Parent creates or renews | Pending |
| Pending | Admin PATCH approve | AwaitingPayment |
| Pending | Admin PATCH reject | Rejected |
| AwaitingPayment | Admin POST payment, full fee | Approved + Paid |
| Approved | Parent renews when later semester is available | New Pending; old record unchanged |

Pending, AwaitingPayment and Approved reserve seats for overlapping registration-semester dates. Rejected and Cancelled do not. Operational route/stop protections apply to protected subscriptions whose end date is today or later. Fees are per shared school semester, not a rolling duration. The UI must not treat preliminary approval as final activation or display payment as completed until the server confirms it.

## 13. Frontend integration checklist

- Auth: attach Bearer token only where appropriate, respect Parent/Admin roles, handle expiry and 401/403, and clear local session on logout. Never expose tokens or passwords in logs.
- Parent dashboard: use /api/students, /api/subscriptions and /api/payments/my. Admin dashboard: use /api/students/admin, /api/parents/admin, /api/stops/admin, /api/routes/admin, /api/buses/admin, /api/drivers/admin, /api/subscriptions/admin and /api/payments/admin. Do not use mock data as a fallback for an empty successful response.
- Registration: read registration-info; if closed, disable new subscription and renewal. Display unavailable seat counts as a neutral placeholder, not NaN or zero. For new subscriptions filter active routes with non-null busId and driverId, registrationOpen=true, and remainingSeats > 0. The public response lacks individual bus/driver active flags; do not invent these fields. Server remains authoritative.
- Stops: use /api/stops/route/{routeId}; filter by pickupTime/dropoffTime according to the direction table. Reset the selected stop when a changed route or direction makes it invalid. Disable submit while invalid or a request is in progress. Known non-blocking UI note: validation currently prevents an invalid POST, but the button can remain clickable.
- Mutations: wait for a successful response before updating lists, counters or local state; use returned IDs instead of temporary IDs. Re-fetch server data after success; never create phantom subscriptions on 400/409. Render server messages and extra minimumCapacity/requiredAmount fields when present.
- Admin workflow: show approve/reject only for Pending; show payment confirmation only for AwaitingPayment. Read the current fee from the server. Refresh both subscription and payment lists after confirmation.
- Admin CRUD: preserve full PUT request fields, including nullable values and assignments; do not send isActive in DTOs. Use the explicit activate/deactivate operations. Stop and route conflicts should be shown to the admin, not silently ignored.

## 14. Database setup and release handover

Use the database README in the release branch as the operational source. Back up existing data first and stop the backend before applying schema changes. Never run reset or sample data scripts against an existing working database. Use a separate QA schema for write tests.

| Target | Script sequence |
|---|---|
| Fresh database | `00_create_user.sql` → `01_create_tables.sql` → optional `02_sample_data.sql` → `03_add_trip_direction.sql` |
| Existing database | Check current schema; apply `03_add_trip_direction.sql` only if not already correctly applied; use `04_update_subscription_status.sql` if old status constraint requires upgrade, following the README guards. |

The final schema allows AwaitingPayment in the subscription status constraint. TripDirection is nullable for existing legacy rows; new OneWay and RoundTrip values must satisfy direction rules. Do not backfill an unknown direction arbitrarily. Migration 04 is intended for upgrading the old status constraint; fresh setup already has the updated status constraint. Use the exact SQL filenames from the repository README; verify the Oracle schema/container and constraints after execution.

Local appsettings.json changes were intentionally excluded from the final commit: configure Oracle connection details, JWT settings and SchoolSemesters privately for each environment. Do not share appsettings containing actual credentials. Confirm deployment settings, HTTPS, CORS/proxy and authorization middleware before production. Backend and frontend branches have not been merged into main as part of this handover.

## 15. QA status and scope limitations

Recorded project QA: 172 functional passes, zero open functional failures in the planned checklist, and one non-blocking frontend UI note. Additional status-migration verification: 5/5, tracked separately. Final original backend smoke checks: 6/6. The team lead reported successful push of four commits and a 0/0 ahead/behind count for the release branch. These figures are from the project test records; this document is not a new execution of all tests.

The original schema was migrated for TripDirection; status migration 04 was rehearsed separately and was not needed on the original schema. Backup/restore checks were performed as recorded in the project; the combined restore script was not rerun end-to-end. Keep backups outside GitHub. No production deployment or final merge has been verified. The initial secret scan was not a comprehensive security audit.

Review before public deployment: protect the diagnostic endpoint, confirm intended public route visibility (including inactive routes and nested stops), confirm actual global authentication/serialization settings and private semester configuration, and complete the final integration/merge review. No changes to code or database were made to prepare this reference.

Source basis: supplied BASI_API_FINAL.json (OpenAPI 3.0.1, STMS.Api 1.0), supplied controller export at bae5c0b, and the reported release/QA history. Swagger lists only 200 responses and a global Bearer scheme; the tables above reflect actual explicit controller behavior rather than treating Swagger's incomplete response metadata as authoritative. Request schemas: 14 (including create/update pairs). Additional custom DTO validators and middleware were not supplied, so their full behavior is outside this static documentation review.
