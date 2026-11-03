import {
  AIVocabExtracted,
  FlashcardExample,
  LearningLanguage,
  ReviewProgress,
  ReviewState,
  SelfRating,
} from '../types';

/**
 * Normalizes a dictionary headword/lemma beyond simple string comparison:
 * - For English: lowercases, strips leading infinitive "to " or articles ("a ", "an ", "the "),
 *   normalizes apostrophes, removes surrounding punctuation, collapses spaces.
 * - For Chinese: strips whitespace and punctuation, preserving exact Simplified Hanzi base form.
 */
export function normalizeLemma(rawLemma: string, rawWord: string, lang: LearningLanguage): string {
  const base = (rawLemma || rawWord || '').trim();
  if (!base) return 'unknown';

  if (lang === 'en') {
    let cleaned = base
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.startsWith('to ') && cleaned.length > 4) {
      cleaned = cleaned.slice(3).trim();
    } else if (cleaned.startsWith('the ') && cleaned.length > 5) {
      cleaned = cleaned.slice(4).trim();
    } else if (cleaned.startsWith('an ') && cleaned.length > 4) {
      cleaned = cleaned.slice(3).trim();
    } else if (cleaned.startsWith('a ') && cleaned.length > 3) {
      cleaned = cleaned.slice(2).trim();
    }
    return cleaned || base.toLowerCase();
  }

  // Chinese: strip spaces and ASCII/CJK punctuation
  return base.replace(/[\s\p{P}]/gu, '').trim() || base;
}

/**
 * Strips diacritics from Pinyin to create a stable reading key for Chinese heteronyms
 * (e.g. 行 "xíng" -> "xing" vs "háng" -> "hang").
 */
export function normalizePinyinReading(pinyin: string): string {
  return pinyin
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Generates a composite canonical key combining:
 * 1. Learning language (en | zh)
 * 2. Normalized dictionary lemma
 * 3. Homonym / heteronym / Traditional-script divergence disambiguator
 *
 * Notice: Polysemous senses of the SAME word share the same canonicalKey so their
 * meanings and examples merge into a single Flashcard, while true homonyms
 * (e.g., bank [finance] vs bank [river], or 行 xíng vs 行 háng, or 发 發 vs 髮)
 * receive distinct keys.
 */
export function buildCanonicalFlashcardKey(
  lang: LearningLanguage,
  item: Pick<AIVocabExtracted, 'word' | 'lemma' | 'traditional' | 'pinyin' | 'homonymSenseKey'>
): string {
  const lemma = normalizeLemma(item.lemma, item.word, lang);
  const rawSense = (item.homonymSenseKey || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

  if (lang === 'zh') {
    const reading = normalizePinyinReading(item.pinyin || '');
    // Include reading so multi-pronunciation characters (多音字 like 行 xíng/háng, 长 cháng/zhǎng) stay distinct
    // Include sense key only when explicitly disambiguating homographs (like 发: 發 vs 髮)
    const disambiguator = rawSense || reading || 'default';
    return `zh::${lemma}::${disambiguator}`.slice(0, 190);
  }

  const disambiguator = rawSense || 'core';
  return `en::${lemma}::${disambiguator}`.slice(0, 190);
}

/**
 * Deterministic alphanumeric hash (dual 32-bit FNV-1a) producing a safe Firestore ID
 * matching ^[a-zA-Z0-9_\-]+$ and <= 128 chars, preventing duplicate documents concurrently.
 */
export function makeDeterministicId(prefix: string, userId: string, canonicalKey: string): string {
  const input = `${userId}::${canonicalKey}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const safeUid = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  return `${prefix}_${safeUid}_${hex1}${hex2}`;
}

export function mergeUniqueStrings(
  existing: string[],
  incoming: string[],
  maxItems: number,
  maxLen: number
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of [...existing, ...incoming]) {
    const trimmed = (raw || '').trim().slice(0, maxLen);
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(trimmed);
      if (result.length >= maxItems) break;
    }
  }
  return result;
}

export function mergeUniqueExamples(
  existing: FlashcardExample[],
  incoming: FlashcardExample[],
  maxItems = 20
): FlashcardExample[] {
  const seen = new Set<string>();
  const result: FlashcardExample[] = [];

  for (const ex of [...existing, ...incoming]) {
    const target = (ex.target || '').trim().slice(0, 400);
    if (!target) continue;
    const norm = target.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push({
        target,
        pronunciation: (ex.pronunciation || '').trim().slice(0, 400),
        vietnamese: (ex.vietnamese || '').trim().slice(0, 400),
        contextTopic: (ex.contextTopic || 'Chung').trim().slice(0, 100),
      });
      if (result.length >= maxItems) break;
    }
  }
  return result;
}

/**
 * Spaced Repetition System (SM-2) calculation
 */
export interface SrsUpdateResult {
  reviewState: ReviewState;
  lastRating: SelfRating;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  nextReviewAtMs: number;
  lastReviewedAtMs: number;
}

export function calculateNextSrs(
  current: Pick<
    ReviewProgress,
    'intervalDays' | 'easeFactor' | 'repetitions' | 'lapses'
  >,
  rating: Exclude<SelfRating, 'none'>,
  nowMs = Date.now()
): SrsUpdateResult {
  const DAY_MS = 24 * 60 * 60 * 1000;
  let ef = current.easeFactor || 2.5;
  let reps = current.repetitions || 0;
  let lapses = current.lapses || 0;
  let interval = current.intervalDays || 0;
  let state: ReviewState = 'learning';
  let nextReviewAtMs = nowMs;

  if (rating === 'forgot') {
    reps = 0;
    lapses += 1;
    interval = 0;
    ef = Math.max(1.3, Number((ef - 0.2).toFixed(2)));
    state = 'needs_review';
    // Re-queue in 10 minutes (still due today)
    nextReviewAtMs = nowMs + 10 * 60 * 1000;
  } else if (rating === 'hard') {
    reps = Math.max(1, reps);
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    ef = Math.max(1.3, Number((ef - 0.15).toFixed(2)));
    state = 'learning';
    nextReviewAtMs = nowMs + interval * DAY_MS;
  } else if (rating === 'good') {
    reps += 1;
    if (reps === 1) {
      interval = 1;
      state = 'learning';
    } else if (reps === 2) {
      interval = 3;
      state = 'remembered';
    } else {
      interval = Math.min(3650, Math.max(4, Math.round(interval * ef)));
      state = 'remembered';
    }
    nextReviewAtMs = nowMs + interval * DAY_MS;
  } else {
    // 'easy'
    reps += 1;
    ef = Math.min(4.0, Number((ef + 0.15).toFixed(2)));
    if (reps === 1) {
      interval = 4;
    } else {
      interval = Math.min(3650, Math.max(5, Math.round(interval * ef * 1.3)));
    }
    state = 'remembered';
    nextReviewAtMs = nowMs + interval * DAY_MS;
  }

  return {
    reviewState: state,
    lastRating: rating,
    intervalDays: interval,
    easeFactor: Math.min(4.0, Math.max(1.3, ef)),
    repetitions: reps,
    lapses,
    nextReviewAtMs,
    lastReviewedAtMs: nowMs,
  };
}

export function getEffectiveReviewState(
  progress: ReviewProgress | undefined,
  nowMs = Date.now()
): ReviewState {
  if (!progress) return 'unlearned';
  if (progress.reviewState === 'unlearned') return 'unlearned';
  if (progress.reviewState === 'needs_review') return 'needs_review';
  if (progress.nextReviewAtMs > 0 && progress.nextReviewAtMs <= nowMs) {
    return 'needs_review';
  }
  return progress.reviewState;
}

export function isDueToday(progress: ReviewProgress | undefined, nowMs = Date.now()): boolean {
  if (!progress) return true;
  if (progress.reviewState === 'unlearned' || progress.reviewState === 'needs_review') {
    return true;
  }
  const endOfToday = new Date(nowMs);
  endOfToday.setHours(23, 59, 59, 999);
  return progress.nextReviewAtMs <= endOfToday.getTime();
}
