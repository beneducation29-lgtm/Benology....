/**
 * Hardened Firestore Security Rules Specification Tests ("Dirty Dozen" Verification)
 * Verifies all 12 adversarial payloads defined in security_spec.md are blocked by firestore.rules.
 */

export interface SimulatedRuleCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedAllow: boolean;
}

export const DIRTY_DOZEN_CASES: SimulatedRuleCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Create (userId != auth.uid)',
    operation: 'create',
    path: '/flashcards/fc_spoof_1',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_B', canonicalKey: 'en_bank_fin', learningLang: 'en' },
    expectedAllow: false,
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    operation: 'create',
    path: '/users/user_A',
    auth: { uid: 'user_A', email_verified: false },
    payload: { uid: 'user_A', displayName: 'Spoofer' },
    expectedAllow: false,
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Create',
    operation: 'create',
    path: '/lessons/lesson_shadow_1',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_A', isAdmin: true },
    expectedAllow: false,
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Update',
    operation: 'update',
    path: '/flashcards/fc_valid_1',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_A', role: 'admin' },
    expectedAllow: false,
  },
  {
    id: 5,
    name: 'Cross-User Profile Read',
    operation: 'get',
    path: '/users/user_B',
    auth: { uid: 'user_A', email_verified: true },
    expectedAllow: false,
  },
  {
    id: 6,
    name: 'Unfiltered Collection List Scraping',
    operation: 'list',
    path: '/lessons',
    auth: { uid: 'user_A', email_verified: true },
    expectedAllow: false,
  },
  {
    id: 7,
    name: 'Ownership Transfer on Update',
    operation: 'update',
    path: '/lessons/lesson_valid_1',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_B' },
    expectedAllow: false,
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/translationEntries/te_forged_time',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_A', createdAt: '1999-01-01T00:00:00Z' },
    expectedAllow: false,
  },
  {
    id: 9,
    name: 'Terminal State Re-opening on Processed TranslationEntry',
    operation: 'update',
    path: '/translationEntries/te_already_processed',
    auth: { uid: 'user_A', email_verified: true },
    payload: { status: 'pending' },
    expectedAllow: false,
  },
  {
    id: 10,
    name: 'ID Poisoning via Invalid Characters',
    operation: 'create',
    path: '/flashcards/invalid$id!spaces',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_A' },
    expectedAllow: false,
  },
  {
    id: 11,
    name: 'Denial-of-Wallet Oversized Payload',
    operation: 'update',
    path: '/lessons/lesson_valid_1',
    auth: { uid: 'user_A', email_verified: true },
    payload: { sourceText: 'x'.repeat(20000) },
    expectedAllow: false,
  },
  {
    id: 12,
    name: 'Orphaned ReviewProgress Without Parent Flashcard',
    operation: 'create',
    path: '/reviewProgress/rp_orphan_1',
    auth: { uid: 'user_A', email_verified: true },
    payload: { userId: 'user_A', flashcardId: 'fc_nonexistent' },
    expectedAllow: false,
  },
];
