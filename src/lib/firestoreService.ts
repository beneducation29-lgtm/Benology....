import { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AILessonAnalysis,
  DataSourceType,
  Flashcard,
  FlashcardExample,
  LanguageCode,
  LearningLanguage,
  Lesson,
  ReviewProgress,
  SelfRating,
  UserProfile,
  VocabularyDoc,
} from '../types';
import {
  buildCanonicalFlashcardKey,
  calculateNextSrs,
  makeDeterministicId,
  mergeUniqueExamples,
  mergeUniqueStrings,
  normalizeLemma,
} from './dedupAndSrs';
import { db, handleFirestoreError, OperationType } from './firebase';

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function ensureUserProfile(fbUser: FirebaseUser): Promise<UserProfile> {
  const userPath = `users/${fbUser.uid}`;
  const ref = doc(db, 'users', fbUser.uid);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (snap.exists()) {
    return snap.data() as UserProfile;
  }

  const displayName = (fbUser.displayName || 'Học viên').trim().slice(0, 100) || 'Học viên';
  const newProfile: UserProfile = {
    uid: fbUser.uid,
    displayName,
    primaryLearningLang: 'en',
    chineseScript: 'both',
    preferredVoiceEngine: 'browser',
    preferredVoiceURI: '',
    speechRate: 1.0,
    dailyGoalMinutes: 20,
    dailyNewCardsGoal: 15,
    streakDays: 0,
    lastStudyDate: '',
    studyLog: [],
  };

  try {
    await setDoc(ref, {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }

  return newProfile;
}

export async function updateUserSettings(
  profile: UserProfile,
  updates: Partial<
    Pick<
      UserProfile,
      | 'displayName'
      | 'primaryLearningLang'
      | 'chineseScript'
      | 'preferredVoiceEngine'
      | 'preferredVoiceURI'
      | 'speechRate'
      | 'dailyGoalMinutes'
      | 'dailyNewCardsGoal'
    >
  >
): Promise<void> {
  const path = `users/${profile.uid}`;
  const ref = doc(db, 'users', profile.uid);

  const payload = {
    displayName: (updates.displayName ?? profile.displayName).trim().slice(0, 100) || 'Học viên',
    primaryLearningLang: updates.primaryLearningLang ?? profile.primaryLearningLang,
    chineseScript: updates.chineseScript ?? profile.chineseScript,
    preferredVoiceEngine: updates.preferredVoiceEngine ?? profile.preferredVoiceEngine,
    preferredVoiceURI: (updates.preferredVoiceURI ?? profile.preferredVoiceURI).slice(0, 200),
    speechRate: Math.min(1.8, Math.max(0.5, Number(updates.speechRate ?? profile.speechRate))),
    dailyGoalMinutes: Math.min(
      240,
      Math.max(5, Math.round(Number(updates.dailyGoalMinutes ?? profile.dailyGoalMinutes)))
    ),
    dailyNewCardsGoal: Math.min(
      100,
      Math.max(5, Math.round(Number(updates.dailyNewCardsGoal ?? profile.dailyNewCardsGoal)))
    ),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function recordStudyActivity(
  profile: UserProfile,
  minutesDelta: number,
  reviewsDelta: number
): Promise<void> {
  const today = getTodayDateStr();
  const yesterday = getYesterdayDateStr();
  let nextStreak = profile.streakDays || 0;

  if (profile.lastStudyDate === today) {
    nextStreak = Math.max(1, nextStreak);
  } else if (profile.lastStudyDate === yesterday) {
    nextStreak = nextStreak + 1;
  } else {
    nextStreak = 1;
  }

  const parsedMap = new Map<string, { mins: number; revs: number }>();
  for (const row of profile.studyLog || []) {
    const [d, mStr, rStr] = row.split('|');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      parsedMap.set(d, {
        mins: Number(mStr) || 0,
        revs: Number(rStr) || 0,
      });
    }
  }

  const cur = parsedMap.get(today) || { mins: 0, revs: 0 };
  parsedMap.set(today, {
    mins: Math.min(1440, cur.mins + Math.max(0, Math.round(minutesDelta))),
    revs: Math.min(5000, cur.revs + Math.max(0, Math.round(reviewsDelta))),
  });

  const sortedDates = Array.from(parsedMap.keys()).sort().slice(-28);
  const studyLog = sortedDates.map((d) => {
    const item = parsedMap.get(d)!;
    return `${d}|${item.mins}|${item.revs}`.slice(0, 50);
  });

  const path = `users/${profile.uid}`;
  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      streakDays: nextStreak,
      lastStudyDate: today,
      studyLog,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export interface ProcessTranslationParams {
  profile: UserProfile;
  sourceText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  dataSource: DataSourceType;
  existingLessons: Lesson[];
  existingFlashcards: Flashcard[];
  existingVocab: VocabularyDoc[];
}

export interface ProcessTranslationResult {
  lessonId: string;
  mergedIntoExistingLesson: boolean;
  newFlashcardsCount: number;
  updatedFlashcardsCount: number;
}

export async function processAndSaveTranslation(
  params: ProcessTranslationParams
): Promise<ProcessTranslationResult> {
  const {
    profile,
    sourceText,
    translatedText,
    sourceLang,
    targetLang,
    dataSource,
    existingLessons,
    existingFlashcards,
    existingVocab,
  } = params;

  const cleanSource = sourceText.trim().slice(0, 5000);
  const cleanTranslated = translatedText.trim().slice(0, 5000);

  // Step 1: Save raw TranslationEntry in 'pending' state
  const entryRef = doc(collection(db, 'translationEntries'));
  const entryPath = `translationEntries/${entryRef.id}`;

  try {
    await setDoc(entryRef, {
      userId: profile.uid,
      sourceText: cleanSource,
      translatedText: cleanTranslated,
      sourceLang,
      targetLang,
      dataSource,
      status: 'pending',
      lessonId: '',
      errorMessage: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, entryPath);
  }

  // Step 2: Call backend Gemini API to analyze & structure lesson + deduplicated vocabulary
  let learningLang: LearningLanguage = profile.primaryLearningLang;
  let analysis: AILessonAnalysis;

  try {
    const res = await fetch('/api/analyze-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceText: cleanSource,
        translatedText: cleanTranslated,
        sourceLang,
        targetLang,
        preferredLearningLang: profile.primaryLearningLang,
        existingLessons: existingLessons.map((l) => ({
          id: l.id,
          title: l.title,
          topic: l.topic,
          learningLang: l.learningLang,
        })),
        existingVocabulary: existingVocab.map((v) => ({
          canonicalKey: v.canonicalKey,
          word: v.word,
          lemma: v.lemma,
          learningLang: v.learningLang,
          homonymSenseKey: v.homonymSenseKey,
          meanings: v.meanings,
        })),
      }),
    });

    const payload = await res.json();
    if (!res.ok || !payload.analysis) {
      throw new Error(payload.error || 'AI không thể tạo bài học từ nội dung này.');
    }

    learningLang = payload.learningLang === 'zh' ? 'zh' : 'en';
    analysis = payload.analysis as AILessonAnalysis;
  } catch (apiErr) {
    const errMsg =
      apiErr instanceof Error
        ? apiErr.message.slice(0, 480)
        : 'Lỗi kết nối máy chủ phân tích AI.';
    try {
      await updateDoc(entryRef, {
        status: 'failed',
        lessonId: '',
        errorMessage: errMsg,
        updatedAt: serverTimestamp(),
      });
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.UPDATE, entryPath);
    }
    throw apiErr;
  }

  // Step 3: Resolve target Lesson (enrich matched related-topic lesson OR create new lesson)
  const matchedExisting = analysis.matchedLessonId
    ? existingLessons.find(
        (l) => l.id === analysis.matchedLessonId && l.learningLang === learningLang
      )
    : undefined;

  const targetLessonRef = matchedExisting
    ? doc(db, 'lessons', matchedExisting.id)
    : doc(collection(db, 'lessons'));
  const lessonId = targetLessonRef.id;
  const topicClean = (analysis.topic || 'Giao tiếp thông dụng').trim().slice(0, 100);

  // Index existing flashcards by ID and by normalized lemma+lang for smart deduplication
  const fcById = new Map<string, Flashcard>();
  for (const fc of existingFlashcards) {
    fcById.set(fc.id, fc);
  }

  const batch = writeBatch(db);
  const touchedFlashcardIds: string[] = [];
  let newFlashcardsCount = 0;
  let updatedFlashcardsCount = 0;

  // Deduplicate within the current AI response batch as well
  const seenInBatch = new Set<string>();

  for (const rawVocab of (analysis.vocabulary || []).slice(0, 25)) {
    const word = (rawVocab.word || '').trim().slice(0, 150);
    if (!word) continue;

    const lemma = normalizeLemma(rawVocab.lemma, word, learningLang).slice(0, 150);
    const canonicalKey = buildCanonicalFlashcardKey(learningLang, rawVocab);
    const flashcardId = makeDeterministicId('fc', profile.uid, canonicalKey);
    const vocabId = makeDeterministicId('vc', profile.uid, canonicalKey);
    const progressId = makeDeterministicId('rp', profile.uid, canonicalKey);

    if (seenInBatch.has(flashcardId)) {
      continue;
    }
    seenInBatch.add(flashcardId);
    touchedFlashcardIds.push(flashcardId);

    const incomingMeaning = (rawVocab.meaningVi || word).trim().slice(0, 300);
    const incomingExample: FlashcardExample = {
      target: (rawVocab.exampleTarget || word).trim().slice(0, 400),
      pronunciation: (rawVocab.examplePronunciation || rawVocab.pinyin || rawVocab.ipa || '')
        .trim()
        .slice(0, 400),
      vietnamese: (rawVocab.exampleVi || incomingMeaning).trim().slice(0, 400),
      contextTopic: topicClean,
    };

    const existingCard = fcById.get(flashcardId);
    const fcRef = doc(db, 'flashcards', flashcardId);
    const vcRef = doc(db, 'vocabulary', vocabId);

    if (existingCard) {
      // Existing word encountered again: merge polysemous meanings, append new contextual example, increment count!
      updatedFlashcardsCount += 1;
      const mergedMeanings = mergeUniqueStrings(existingCard.meanings, [incomingMeaning], 15, 300);
      const mergedExamples = mergeUniqueExamples(existingCard.examples, [incomingExample], 20);
      const mergedRelated = mergeUniqueStrings(
        existingCard.relatedForms,
        rawVocab.relatedForms || [],
        15,
        200
      );
      const mergedContexts = mergeUniqueStrings(existingCard.contexts, [topicClean], 20, 120);
      const mergedLessons = mergeUniqueStrings(existingCard.lessonIds, [lessonId], 50, 128);
      const updatedCount = (existingCard.encounterCount || 1) + 1;

      batch.update(fcRef, {
        word: existingCard.word || word,
        traditional: (rawVocab.traditional || existingCard.traditional || '').trim().slice(0, 150),
        homonymNote: (rawVocab.homonymNote || existingCard.homonymNote || '').trim().slice(0, 250),
        ipa: (rawVocab.ipa || existingCard.ipa || '').trim().slice(0, 150),
        pinyin: (rawVocab.pinyin || existingCard.pinyin || '').trim().slice(0, 200),
        partOfSpeech: (rawVocab.partOfSpeech || existingCard.partOfSpeech || '')
          .trim()
          .slice(0, 80),
        meanings: mergedMeanings.length > 0 ? mergedMeanings : [incomingMeaning],
        examples: mergedExamples.length > 0 ? mergedExamples : [incomingExample],
        relatedForms: mergedRelated,
        contexts: mergedContexts,
        encounterCount: updatedCount,
        lessonIds: mergedLessons,
        updatedAt: serverTimestamp(),
      });

      const existingVc = existingVocab.find((v) => v.id === vocabId);
      if (existingVc) {
        batch.update(vcRef, {
          word: existingCard.word || word,
          traditional: (rawVocab.traditional || existingVc.traditional || '').trim().slice(0, 150),
          pronunciation: (
            rawVocab.pinyin ||
            rawVocab.ipa ||
            existingVc.pronunciation ||
            ''
          )
            .trim()
            .slice(0, 200),
          partOfSpeech: (rawVocab.partOfSpeech || existingVc.partOfSpeech || '')
            .trim()
            .slice(0, 80),
          meanings: mergedMeanings.length > 0 ? mergedMeanings : [incomingMeaning],
          lessonIds: mergedLessons,
          encounterCount: updatedCount,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      // Brand new canonical word -> create Flashcard + Vocabulary + initial ReviewProgress
      newFlashcardsCount += 1;
      const cleanRelated = mergeUniqueStrings([], rawVocab.relatedForms || [], 15, 200);

      batch.set(fcRef, {
        userId: profile.uid,
        canonicalKey,
        learningLang,
        word,
        lemma,
        traditional: (rawVocab.traditional || '').trim().slice(0, 150),
        homonymNote: (rawVocab.homonymNote || '').trim().slice(0, 250),
        ipa: (rawVocab.ipa || '').trim().slice(0, 150),
        pinyin: (rawVocab.pinyin || '').trim().slice(0, 200),
        partOfSpeech: (rawVocab.partOfSpeech || '').trim().slice(0, 80),
        meanings: [incomingMeaning],
        examples: [incomingExample],
        relatedForms: cleanRelated,
        contexts: [topicClean],
        isFavorite: false,
        encounterCount: 1,
        lessonIds: [lessonId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(vcRef, {
        userId: profile.uid,
        canonicalKey,
        learningLang,
        word,
        lemma,
        traditional: (rawVocab.traditional || '').trim().slice(0, 150),
        homonymSenseKey: (rawVocab.homonymSenseKey || 'core').trim().slice(0, 100),
        pronunciation: (rawVocab.pinyin || rawVocab.ipa || '').trim().slice(0, 200),
        partOfSpeech: (rawVocab.partOfSpeech || '').trim().slice(0, 80),
        meanings: [incomingMeaning],
        lessonIds: [lessonId],
        encounterCount: 1,
        flashcardId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const rpRef = doc(db, 'reviewProgress', progressId);
      batch.set(rpRef, {
        userId: profile.uid,
        flashcardId,
        learningLang,
        reviewState: 'unlearned',
        lastRating: 'none',
        intervalDays: 0,
        easeFactor: 2.5,
        repetitions: 0,
        lapses: 0,
        nextReviewAtMs: Date.now(),
        lastReviewedAtMs: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Sanitize sentences, grammarPoints, exercises
  const cleanSentences = (analysis.sentences || []).slice(0, 25).map((s) => ({
    target: (s.target || '').trim().slice(0, 600),
    traditional: (s.traditional || '').trim().slice(0, 600),
    pronunciation: (s.pronunciation || '').trim().slice(0, 600),
    vietnamese: (s.vietnamese || '').trim().slice(0, 600),
    note: (s.note || '').trim().slice(0, 300),
  })).filter((s) => s.target.length > 0);

  const cleanGrammar = (analysis.grammarPoints || []).slice(0, 12).map((g) => ({
    pattern: (g.pattern || '').trim().slice(0, 200),
    explanationVi: (g.explanationVi || '').trim().slice(0, 800),
    exampleTarget: (g.exampleTarget || '').trim().slice(0, 400),
    examplePronunciation: (g.examplePronunciation || '').trim().slice(0, 400),
    exampleVi: (g.exampleVi || '').trim().slice(0, 400),
  })).filter((g) => g.pattern.length > 0);

  const cleanExercises = (analysis.exercises || []).slice(0, 12).map((ex) => ({
    question: (ex.question || '').trim().slice(0, 400),
    options: (ex.options || []).slice(0, 4).map((o) => String(o).trim().slice(0, 200)),
    correctIndex: Math.min(3, Math.max(0, Number(ex.correctIndex) || 0)),
    explanationVi: (ex.explanationVi || '').trim().slice(0, 500),
  })).filter((ex) => ex.question.length > 0 && ex.options.length >= 2);

  if (matchedExisting) {
    const combinedSource = `${matchedExisting.sourceText}\n\n${cleanSource}`.slice(0, 8000);
    const combinedTranslated = `${matchedExisting.translatedText}\n\n${cleanTranslated}`.slice(
      0,
      8000
    );
    const combinedVocabIds = mergeUniqueStrings(
      matchedExisting.vocabIds,
      touchedFlashcardIds,
      60,
      128
    );

    // Deduplicate sentences by target text
    const seenSent = new Set(matchedExisting.sentences.map((s) => s.target.toLowerCase()));
    const combinedSentences = [
      ...matchedExisting.sentences,
      ...cleanSentences.filter((s) => !seenSent.has(s.target.toLowerCase())),
    ].slice(0, 40);

    const seenGrammar = new Set(matchedExisting.grammarPoints.map((g) => g.pattern.toLowerCase()));
    const combinedGrammar = [
      ...matchedExisting.grammarPoints,
      ...cleanGrammar.filter((g) => !seenGrammar.has(g.pattern.toLowerCase())),
    ].slice(0, 20);

    const combinedExercises = [...matchedExisting.exercises, ...cleanExercises].slice(0, 20);

    batch.update(targetLessonRef, {
      sourceText: combinedSource,
      translatedText: combinedTranslated,
      summary: (analysis.summary || matchedExisting.summary || '').trim().slice(0, 1500),
      vocabIds: combinedVocabIds,
      sentences: combinedSentences,
      grammarPoints: combinedGrammar,
      exercises: combinedExercises,
      entryCount: (matchedExisting.entryCount || 1) + 1,
      masteryPercent: Math.min(95, matchedExisting.masteryPercent || 0),
      completedExercises: matchedExisting.completedExercises || 0,
      isCompleted: false,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(targetLessonRef, {
      userId: profile.uid,
      title: (analysis.lessonTitle || 'Bài học mới từ bản dịch').trim().slice(0, 200),
      topic: topicClean,
      summary: (analysis.summary || '').trim().slice(0, 1500),
      sourceText: cleanSource,
      translatedText: cleanTranslated,
      sourceLang,
      targetLang,
      learningLang,
      vocabIds: touchedFlashcardIds.slice(0, 60),
      sentences: cleanSentences,
      grammarPoints: cleanGrammar,
      exercises: cleanExercises,
      entryCount: 1,
      masteryPercent: 0,
      completedExercises: 0,
      shadowingCount: 0,
      isCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Mark TranslationEntry processed (terminal state)
  batch.update(entryRef, {
    status: 'processed',
    lessonId,
    errorMessage: '',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `lessons/${lessonId}`);
  }

  // Record 3 minutes study credit for creating/analyzing a lesson
  await recordStudyActivity(profile, 3, 0);

  return {
    lessonId,
    mergedIntoExistingLesson: Boolean(matchedExisting),
    newFlashcardsCount,
    updatedFlashcardsCount,
  };
}

export async function toggleFlashcardFavorite(card: Flashcard): Promise<void> {
  const path = `flashcards/${card.id}`;
  try {
    await updateDoc(doc(db, 'flashcards', card.id), {
      isFavorite: !card.isFavorite,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFlashcardManual(
  card: Flashcard,
  updates: {
    word: string;
    traditional: string;
    homonymNote: string;
    ipa: string;
    pinyin: string;
    partOfSpeech: string;
    meanings: string[];
    examples: FlashcardExample[];
    relatedForms: string[];
    isFavorite: boolean;
  }
): Promise<void> {
  const path = `flashcards/${card.id}`;
  const cleanMeanings = mergeUniqueStrings([], updates.meanings, 15, 300);
  const cleanExamples = mergeUniqueExamples([], updates.examples, 20);
  const cleanRelated = mergeUniqueStrings([], updates.relatedForms, 15, 200);

  try {
    await updateDoc(doc(db, 'flashcards', card.id), {
      word: updates.word.trim().slice(0, 150) || card.word,
      traditional: updates.traditional.trim().slice(0, 150),
      homonymNote: updates.homonymNote.trim().slice(0, 250),
      ipa: updates.ipa.trim().slice(0, 150),
      pinyin: updates.pinyin.trim().slice(0, 200),
      partOfSpeech: updates.partOfSpeech.trim().slice(0, 80),
      meanings: cleanMeanings.length > 0 ? cleanMeanings : card.meanings,
      examples: cleanExamples.length > 0 ? cleanExamples : card.examples,
      relatedForms: cleanRelated,
      isFavorite: updates.isFavorite,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFlashcardAndRelated(
  card: Flashcard,
  vocabDocs: VocabularyDoc[],
  progressDocs: ReviewProgress[]
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'flashcards', card.id));

  for (const vc of vocabDocs.filter((v) => v.flashcardId === card.id)) {
    batch.delete(doc(db, 'vocabulary', vc.id));
  }
  for (const rp of progressDocs.filter((p) => p.flashcardId === card.id)) {
    batch.delete(doc(db, 'reviewProgress', rp.id));
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `flashcards/${card.id}`);
  }
}

export async function submitCardReview(
  profile: UserProfile,
  card: Flashcard,
  existingProgress: ReviewProgress | undefined,
  rating: Exclude<SelfRating, 'none'>
): Promise<void> {
  const progressId =
    existingProgress?.id || makeDeterministicId('rp', profile.uid, card.canonicalKey);
  const path = `reviewProgress/${progressId}`;
  const ref = doc(db, 'reviewProgress', progressId);

  const base = existingProgress || {
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
  };

  const next = calculateNextSrs(base, rating);

  try {
    if (existingProgress) {
      await updateDoc(ref, {
        reviewState: next.reviewState,
        lastRating: next.lastRating,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        repetitions: next.repetitions,
        lapses: next.lapses,
        nextReviewAtMs: next.nextReviewAtMs,
        lastReviewedAtMs: next.lastReviewedAtMs,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: profile.uid,
        flashcardId: card.id,
        learningLang: card.learningLang,
        reviewState: next.reviewState,
        lastRating: next.lastRating,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        repetitions: next.repetitions,
        lapses: next.lapses,
        nextReviewAtMs: next.nextReviewAtMs,
        lastReviewedAtMs: next.lastReviewedAtMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  await recordStudyActivity(profile, 1, 1);
}

export async function updateLessonStudyProgress(
  profile: UserProfile,
  lesson: Lesson,
  updates: {
    completedExercises?: number;
    shadowingCount?: number;
    markCompleted?: boolean;
  }
): Promise<void> {
  const completedExercises = updates.completedExercises ?? lesson.completedExercises ?? 0;
  const shadowingCount = updates.shadowingCount ?? lesson.shadowingCount ?? 0;
  const totalEx = Math.max(1, lesson.exercises.length);
  const exScore = Math.min(70, Math.round((completedExercises / totalEx) * 70));
  const shadowScore = Math.min(30, shadowingCount * 10);
  const computedMastery = updates.markCompleted
    ? 100
    : Math.min(100, Math.max(lesson.masteryPercent || 0, exScore + shadowScore));
  const isCompleted = updates.markCompleted ? true : computedMastery >= 100 || lesson.isCompleted;

  const path = `lessons/${lesson.id}`;
  try {
    await updateDoc(doc(db, 'lessons', lesson.id), {
      masteryPercent: computedMastery,
      completedExercises,
      shadowingCount,
      isCompleted,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  await recordStudyActivity(profile, 2, 0);
}

export async function deleteLessonDoc(lessonId: string): Promise<void> {
  const path = `lessons/${lessonId}`;
  try {
    await deleteDoc(doc(db, 'lessons', lessonId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
