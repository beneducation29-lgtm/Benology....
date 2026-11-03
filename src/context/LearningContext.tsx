import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  Flashcard,
  Lesson,
  NavTab,
  ReviewProgress,
  TranslationEntry,
  UserProfile,
  VocabularyDoc,
} from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ensureUserProfile } from '../lib/firestoreService';

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    const fn = (ts as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn.call(ts);
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

interface LearningContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  authLoading: boolean;
  dataLoading: boolean;
  entries: TranslationEntry[];
  lessons: Lesson[];
  flashcards: Flashcard[];
  vocabulary: VocabularyDoc[];
  reviewProgressMap: Map<string, ReviewProgress>;
  reviewProgressList: ReviewProgress[];
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedLessonId: string | null;
  setSelectedLessonId: (id: string | null) => void;
  openLessonDetail: (lessonId: string) => void;
  openShadowingForLesson: (lessonId: string) => void;
}

const LearningContext = createContext<LearningContextValue | null>(null);

export function LearningProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [entries, setEntries] = useState<TranslationEntry[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyDoc[]>([]);
  const [reviewProgressList, setReviewProgressList] = useState<ReviewProgress[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  // Check URL share params on boot (e.g. ?source=...&translation=...) to open Import tab automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') || params.get('text') || params.get('translation')) {
      setActiveTab('import');
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setEntries([]);
        setLessons([]);
        setFlashcards([]);
        setVocabulary([]);
        setReviewProgressList([]);
        setAuthLoading(false);
        return;
      }

      try {
        setDataLoading(true);
        const initialProfile = await ensureUserProfile(user);
        setProfile(initialProfile);
      } catch (err) {
        console.error('Failed to initialize user profile:', err);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!firebaseUser || authLoading) return;
    const uid = firebaseUser.uid;
    let readyCount = 0;
    const markReady = () => {
      readyCount += 1;
      if (readyCount >= 5) {
        setDataLoading(false);
      }
    };

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const qEntries = query(collection(db, 'translationEntries'), where('userId', '==', uid));
    const unsubEntries = onSnapshot(
      qEntries,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TranslationEntry, 'id'>),
        }));
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setEntries(list);
        markReady();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'translationEntries')
    );

    const qLessons = query(collection(db, 'lessons'), where('userId', '==', uid));
    const unsubLessons = onSnapshot(
      qLessons,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Lesson, 'id'>),
        }));
        list.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
        setLessons(list);
        markReady();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'lessons')
    );

    const qFlashcards = query(collection(db, 'flashcards'), where('userId', '==', uid));
    const unsubFlashcards = onSnapshot(
      qFlashcards,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Flashcard, 'id'>),
        }));
        list.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
        setFlashcards(list);
        markReady();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'flashcards')
    );

    const qVocab = query(collection(db, 'vocabulary'), where('userId', '==', uid));
    const unsubVocab = onSnapshot(
      qVocab,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<VocabularyDoc, 'id'>),
        }));
        setVocabulary(list);
        markReady();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vocabulary')
    );

    const qProgress = query(collection(db, 'reviewProgress'), where('userId', '==', uid));
    const unsubProgress = onSnapshot(
      qProgress,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReviewProgress, 'id'>),
        }));
        setReviewProgressList(list);
        markReady();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviewProgress')
    );

    return () => {
      unsubUser();
      unsubEntries();
      unsubLessons();
      unsubFlashcards();
      unsubVocab();
      unsubProgress();
    };
  }, [firebaseUser, authLoading]);

  const reviewProgressMap = useMemo(() => {
    const map = new Map<string, ReviewProgress>();
    for (const p of reviewProgressList) {
      map.set(p.flashcardId, p);
    }
    return map;
  }, [reviewProgressList]);

  const openLessonDetail = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setActiveTab('lessons');
  };

  const openShadowingForLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setActiveTab('shadowing');
  };

  const value: LearningContextValue = {
    firebaseUser,
    profile,
    authLoading,
    dataLoading,
    entries,
    lessons,
    flashcards,
    vocabulary,
    reviewProgressMap,
    reviewProgressList,
    activeTab,
    setActiveTab,
    selectedLessonId,
    setSelectedLessonId,
    openLessonDetail,
    openShadowingForLesson,
  };

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning() {
  const ctx = useContext(LearningContext);
  if (!ctx) {
    throw new Error('useLearning must be used inside LearningProvider');
  }
  return ctx;
}
