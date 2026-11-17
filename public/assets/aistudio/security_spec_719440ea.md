# Firestore Security Specification (Luna - Voice Companion)

## 1. Data Invariants

1. **Strict Multi-User Isolation**: Every document in `/users/{userId}` and its subcollections (`/memories`, `/sessions`, `/canvases`) belongs exclusively to `userId == request.auth.uid`. Cross-user reads, lists, writes, or deletes are unconditionally denied.
2. **Email Verification Gate**: All authenticated read and write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Master Gate on Subcollections**: Every single-document subcollection operation (`get`, `create`, `update`, `delete`) verifies that the parent `/users/{userId}` document exists and its `uid` matches `request.auth.uid`.
4. **Immutable Ownership & Creation Timestamps**: `uid` and `createdAt` can never be altered after creation. `createdAt == request.time` on `create`; `updatedAt == request.time` on `create` and `update`.
5. **Terminal State Locking on Sessions**: Once a `VoiceSession` reaches `status == 'ended'`, no further updates are permitted (except deletion during user data clear).
6. **Strict Schema & Boundary Enforcement**: Every string has explicit `.size()` bounds, enums are validated against allowlists, and `keys().hasAll(...) && keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` prevent shadow fields.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on User Create**: `POST /users/victimUid` as `attackerUid` with `{ uid: "victimUid", ... }` -> **DENIED** (`userId == request.auth.uid` fails).
2. **Mismatched Body UID**: `POST /users/attackerUid` with `{ uid: "victimUid", ... }` -> **DENIED** (`data.uid == request.auth.uid` fails).
3. **Unverified Email Spoof**: Signed-in user with `email_verified: false` attempting `POST /users/attackerUid` -> **DENIED** (`request.auth.token.email_verified == true` fails).
4. **Shadow Field Injection (User Profile)**: `POST /users/attackerUid` including extra field `isAdmin: true` or `role: "admin"` -> **DENIED** (`keys().hasOnly(...)` fails).
5. **Cross-User PII Read**: `GET /users/victimUid` as `attackerUid` -> **DENIED** (`userId == request.auth.uid` fails).
6. **Blanket User List Scraping**: `LIST /users` as any signed-in user -> **DENIED** (no `allow list` on `/users`).
7. **ID Poisoning (Oversized / Invalid Doc ID)**: `POST /users/attackerUid/memories/invalid$id...` (or 1.5KB string) -> **DENIED** (`isValidId(memoryId)` fails).
8. **Content Resource Exhaustion**: `POST /users/attackerUid/memories/mem1` with 50KB `content` string -> **DENIED** (`data.content.size() <= 1000` fails).
9. **Timestamp Forgery**: `POST /users/attackerUid/memories/mem1` with `createdAt: "1999-01-01T00:00:00Z"` -> **DENIED** (`incoming().createdAt == request.time` fails).
10. **Immutable Field Mutation**: `PATCH /users/attackerUid/memories/mem1` changing `uid` or `createdAt` -> **DENIED** (`affectedKeys().hasOnly(...)` and immutability check fail).
11. **Terminal State Bypass on Session**: `PATCH /users/attackerUid/sessions/sess1` where `existing().status == 'ended'` trying to set `status: 'active'` or inflate `durationSeconds` -> **DENIED** (`existing().status != 'ended'` fails).
12. **Orphan Subcollection Write**: `POST /users/attackerUid/memories/mem1` when `/users/attackerUid` does not exist -> **DENIED** (Master Gate `exists(...)` / `get(...)` fails).
