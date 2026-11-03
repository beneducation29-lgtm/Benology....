# Security Specification — Smart Translation Learning

## 1. Data Invariants

1. **Zero Cross-Tenant Access**: Every document in `/users/{userId}`, `/translationEntries/{entryId}`, `/lessons/{lessonId}`, `/vocabulary/{vocabId}`, `/flashcards/{flashcardId}`, and `/reviewProgress/{progressId}` is strictly private to `request.auth.uid`. No user can read, list, create, update, or delete another user's documents.
2. **Verified Identity Enforcement**: Every write operation across all collections requires `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Exclusion**: No PII (`email`, `phone`, `address`) is stored in any Firestore document. `/users/{userId}` is only readable via `get` by `request.auth.uid == userId` (`list` on `/users` is denied).
4. **Relational Existence Gate**: Records in `translationEntries`, `lessons`, `vocabulary`, `flashcards`, and `reviewProgress` cannot be created unless the owner's `/users/$(request.auth.uid)` profile exists (`exists` or `existsAfter` in the same atomic batch).Furthermore, `reviewProgress` creation requires the referenced `/flashcards/$(incoming().flashcardId)` document to exist (`exists` or `existsAfter`).
5. **Immortal Identity & Temporal Integrity**: `uid`, `userId`, `canonicalKey`, `learningLang`, `flashcardId`, and `createdAt` are strictly immutable on update. `createdAt` must equal `request.time` on `create`, and `updatedAt` must equal `request.time` on both `create` and `update`.
6. **Terminal State Locking**: Once a `TranslationEntry` reaches `status == 'processed'`, any further update is rejected.
7. **Strict Schema & Volumetric Bounds**: Every `create` and `update` invokes `isValid[Entity](incoming())` checking `keys().hasAll(...)`, `keys().hasOnly(...)`, regex ID guards (`^[a-zA-Z0-9_\-]+$`), string `.size()` bounds, and list `.size()` bounds.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Create**: Authenticated user `user_A` creates `/flashcards/fc_1` with `userId: "user_B"`. -> `PERMISSION_DENIED`
2. **Unverified Email Write**: Authenticated user `user_A` with `email_verified: false` creates `/users/user_A`. -> `PERMISSION_DENIED`
3. **Shadow Field Injection on Create**: `user_A` creates `/lessons/lesson_1` with all required fields plus `isAdmin: true`. -> `PERMISSION_DENIED`
4. **Shadow Field Injection on Update**: `user_A` updates `/flashcards/fc_1` adding `role: "admin"`. -> `PERMISSION_DENIED`
5. **Cross-User PII/Profile Scrape**: `user_A` performs `get` or `list` on `/users/user_B`. -> `PERMISSION_DENIED`
6. **Unfiltered Collection List Scraping**: `user_A` executes `getDocs(collection(db, 'lessons'))` without `where('userId', '==', 'user_A')`. -> `PERMISSION_DENIED`
7. **Ownership Transfer Attack**: `user_A` updates `/lessons/lesson_1` changing `userId` from `"user_A"` to `"user_B"`. -> `PERMISSION_DENIED`
8. **Timestamp Forgery**: `user_A` creates `/translationEntries/te_1` with `createdAt` set to a past timestamp instead of `request.time`. -> `PERMISSION_DENIED`
9. **Terminal State Re-opening**: `user_A` updates `/translationEntries/te_processed` whose existing `status` is `'processed'` back to `'pending'`. -> `PERMISSION_DENIED`
10. **ID Poisoning Attack**: `user_A` creates `/flashcards/bad$id!with spaces` or a 200-char ID. -> `PERMISSION_DENIED`
11. **Denial-of-Wallet Oversized String/Array**: `user_A` updates `/lessons/lesson_1` with a 20,000-char `sourceText` or 200 `vocabIds`. -> `PERMISSION_DENIED`
12. **Orphaned Child Record**: `user_A` creates `/reviewProgress/rp_1` referencing a non-existent `flashcardId: "fc_ghost"` or without `/users/user_A` existing. -> `PERMISSION_DENIED`
