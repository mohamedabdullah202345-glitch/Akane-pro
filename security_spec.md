# Firestore Security Specification (Akane Pro — Stage 2)

## 1. Data Invariants

1. **Strict Owner Isolation**: Every document in `/users/{userId}` and its subcollections (`/memories`, `/sessionSummaries`, `/tasks`) belongs exclusively to `userId == request.auth.uid`. Cross-user reads, lists, writes, or deletes are unconditionally denied.
2. **Email Verification Gate**: All authenticated read/write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Master Gate on Subcollections**: Every single-document subcollection operation (`get`, `create`, `update`, `delete`) verifies that the parent `/users/{userId}` document exists and its `uid` matches `request.auth.uid`.
4. **Immutable Ownership & Creation Timestamps**: `uid` and `createdAt` cannot be modified after creation. `createdAt == request.time` on `create`; `updatedAt == request.time` on `create` and `update`.
5. **Strict Schema & Boundary Enforcement**: Every string enforces `.size()` bounds, enums check allowlists, importance is bounded `1..10`, and `keys().hasAll(...) && keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` reject shadow fields.
6. **Secure List Queries**: Every `allow list` rule evaluates `resource.data.uid == request.auth.uid` with zero `get()` or `exists()` calls inside `allow list`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on User Create**: `CREATE /users/victimUid` as `attackerUid` with `{ uid: "victimUid", ... }` -> **DENIED** (`userId == request.auth.uid` fails).
2. **Mismatched Body UID**: `CREATE /users/attackerUid` with `{ uid: "victimUid", ... }` -> **DENIED** (`data.uid == request.auth.uid` fails).
3. **Unverified Email Spoof**: Signed-in user with `email_verified: false` creating `/users/attackerUid` -> **DENIED** (`request.auth.token.email_verified == true` fails).
4. **Shadow Field Injection**: `CREATE /users/attackerUid` with extra field `isAdmin: true` -> **DENIED** (`keys().hasOnly(...)` fails).
5. **Cross-User Memory Read**: `GET /users/victimUid/memories/mem1` as `attackerUid` -> **DENIED** (`userId == request.auth.uid` fails).
6. **Blanket User List Scraping**: `LIST /users` as any signed-in user -> **DENIED** (no `allow list` on `/users`).
7. **ID Poisoning**: `CREATE /users/attackerUid/memories/invalid$id...` -> **DENIED** (`isValidId(memoryId)` fails).
8. **Content Resource Exhaustion**: `CREATE /users/attackerUid/memories/mem1` with 10KB `content` -> **DENIED** (`data.content.size() <= 1000` fails).
9. **Timestamp Forgery**: `CREATE /users/attackerUid/memories/mem1` with backdated `createdAt` -> **DENIED** (`incoming().createdAt == request.time` fails).
10. **Immutable Field Mutation**: `UPDATE /users/attackerUid/memories/mem1` altering `uid` or `createdAt` -> **DENIED** (`affectedKeys().hasOnly(...)` fails).
11. **SessionSummary Tampering**: `UPDATE /users/attackerUid/sessionSummaries/sum1` -> **DENIED** (session summaries are append-only).
12. **Orphan Subcollection Write**: `CREATE /users/attackerUid/memories/mem1` before `/users/attackerUid` exists -> **DENIED** (Master Gate `get(...)` fails).
