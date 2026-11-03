export type LanguageCode = 'vi' | 'en' | 'zh';
export type LearningLanguage = 'en' | 'zh';
export type ChineseScriptMode = 'simplified' | 'traditional' | 'both';
export type VoiceEngineMode = 'browser' | 'gemini';

export type DataSourceType =
  | 'manual_paste'
  | 'share_intent'
  | 'extension_bridge'
  | 'quick_sample';

export type TranslationStatus = 'pending' | 'processed' | 'failed';

export type ReviewState = 'unlearned' | 'learning' | 'remembered' | 'needs_review';
export type SelfRating = 'none' | 'forgot' | 'hard' | 'good' | 'easy';

export type NavTab =
  | 'dashboard'
  | 'import'
  | 'lessons'
  | 'flashcards'
  | 'shadowing'
  | 'review'
  | 'settings';

export interface UserProfile {
  uid: string;
  displayName: string;
  primaryLearningLang: LearningLanguage;
  chineseScript: ChineseScriptMode;
  preferredVoiceEngine: VoiceEngineMode;
  preferredVoiceURI: string;
  speechRate: number;
  dailyGoalMinutes: number;
  dailyNewCardsGoal: number;
  streakDays: number;
  lastStudyDate: string;
  studyLog: string[]; // Format: "YYYY-MM-DD|minutes|reviews"
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TranslationEntry {
  id: string;
  userId: string;
  sourceText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  dataSource: DataSourceType;
  status: TranslationStatus;
  lessonId: string;
  errorMessage: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LessonSentence {
  target: string;
  traditional: string;
  pronunciation: string;
  vietnamese: string;
  note: string;
}

export interface GrammarPoint {
  pattern: string;
  explanationVi: string;
  exampleTarget: string;
  examplePronunciation: string;
  exampleVi: string;
}

export interface LessonExercise {
  question: string;
  options: string[];
  correctIndex: number;
  explanationVi: string;
}

export interface Lesson {
  id: string;
  userId: string;
  title: string;
  topic: string;
  summary: string;
  sourceText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  learningLang: LearningLanguage;
  vocabIds: string[];
  sentences: LessonSentence[];
  grammarPoints: GrammarPoint[];
  exercises: LessonExercise[];
  entryCount: number;
  masteryPercent: number;
  completedExercises: number;
  shadowingCount: number;
  isCompleted: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FlashcardExample {
  target: string;
  pronunciation: string;
  vietnamese: string;
  contextTopic: string;
}

export interface VocabularyDoc {
  id: string;
  userId: string;
  canonicalKey: string;
  learningLang: LearningLanguage;
  word: string;
  lemma: string;
  traditional: string;
  homonymSenseKey: string;
  pronunciation: string;
  partOfSpeech: string;
  meanings: string[];
  lessonIds: string[];
  encounterCount: number;
  flashcardId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Flashcard {
  id: string;
  userId: string;
  canonicalKey: string;
  learningLang: LearningLanguage;
  word: string;
  lemma: string;
  traditional: string;
  homonymNote: string;
  ipa: string;
  pinyin: string;
  partOfSpeech: string;
  meanings: string[];
  examples: FlashcardExample[];
  relatedForms: string[];
  contexts: string[];
  isFavorite: boolean;
  encounterCount: number;
  lessonIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReviewProgress {
  id: string;
  userId: string;
  flashcardId: string;
  learningLang: LearningLanguage;
  reviewState: ReviewState;
  lastRating: SelfRating;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  nextReviewAtMs: number;
  lastReviewedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AIVocabExtracted {
  word: string;
  lemma: string;
  traditional: string;
  homonymSenseKey: string;
  homonymNote: string;
  alreadyInBank: boolean;
  ipa: string;
  pinyin: string;
  partOfSpeech: string;
  meaningVi: string;
  exampleTarget: string;
  examplePronunciation: string;
  exampleVi: string;
  relatedForms: string[];
}

export interface AILessonAnalysis {
  matchedLessonId: string;
  lessonTitle: string;
  topic: string;
  summary: string;
  sentences: LessonSentence[];
  vocabulary: AIVocabExtracted[];
  grammarPoints: GrammarPoint[];
  exercises: LessonExercise[];
}
