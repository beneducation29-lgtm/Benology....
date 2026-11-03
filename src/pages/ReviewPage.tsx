import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Repeat,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import {
  calculateNextSrs,
  getEffectiveReviewState,
  isDueToday,
} from '../lib/dedupAndSrs';
import { submitCardReview } from '../lib/firestoreService';
import { speakText } from '../lib/speech';
import { Flashcard, LearningLanguage, SelfRating } from '../types';

export function ReviewPage() {
  const {
    profile,
    flashcards,
    reviewProgressMap,
    setActiveTab,
  } = useLearning();

  const [langFilter, setLangFilter] = useState<'all' | LearningLanguage>('all');
  const [practiceAllMode, setPracticeAllMode] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Breakdown counts across all 4 required states
  const stateBreakdown = useMemo(() => {
    const counts = {
      unlearned: 0,
      learning: 0,
      remembered: 0,
      needs_review: 0,
      dueToday: 0,
    };

    for (const fc of flashcards) {
      if (langFilter !== 'all' && fc.learningLang !== langFilter) continue;
      const prog = reviewProgressMap.get(fc.id);
      const st = getEffectiveReviewState(prog);
      counts[st] += 1;
      if (isDueToday(prog)) {
        counts.dueToday += 1;
      }
    }
    return counts;
  }, [flashcards, reviewProgressMap, langFilter]);

  const queue: Flashcard[] = useMemo(() => {
    const filtered = flashcards.filter((fc) => {
      if (langFilter !== 'all' && fc.learningLang !== langFilter) return false;
      if (practiceAllMode) return true;
      return isDueToday(reviewProgressMap.get(fc.id));
    });

    // Sort priority: needs_review -> unlearned -> learning -> remembered
    const priority: Record<string, number> = {
      needs_review: 0,
      unlearned: 1,
      learning: 2,
      remembered: 3,
    };

    return filtered.sort((a, b) => {
      const sa = getEffectiveReviewState(reviewProgressMap.get(a.id));
      const sb = getEffectiveReviewState(reviewProgressMap.get(b.id));
      return (priority[sa] ?? 4) - (priority[sb] ?? 4);
    });
  }, [flashcards, reviewProgressMap, langFilter, practiceAllMode]);

  const activeCard = queue[Math.min(currentIndex, Math.max(0, queue.length - 1))] || null;
  const activeProgress = activeCard ? reviewProgressMap.get(activeCard.id) : undefined;

  const previewIntervals = useMemo(() => {
    const base = activeProgress || {
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
    };
    const fmt = (days: number) => (days === 0 ? '10 phút' : `${days} ngày`);
    return {
      forgot: fmt(calculateNextSrs(base, 'forgot').intervalDays),
      hard: fmt(calculateNextSrs(base, 'hard').intervalDays),
      good: fmt(calculateNextSrs(base, 'good').intervalDays),
      easy: fmt(calculateNextSrs(base, 'easy').intervalDays),
    };
  }, [activeProgress]);

  const handlePlayWord = async (card: Flashcard) => {
    try {
      await speakText({
        text: card.word,
        lang: card.learningLang,
        rate: profile?.speechRate || 1.0,
        engine: profile?.preferredVoiceEngine || 'browser',
        preferredVoiceURI: profile?.preferredVoiceURI,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRate = async (rating: Exclude<SelfRating, 'none'>) => {
    if (!profile || !activeCard || submitting) return;
    setSubmitting(true);
    try {
      await submitCardReview(profile, activeCard, activeProgress, rating);
      setRevealed(false);
      setSessionReviewedCount((c) => c + 1);
      if (practiceAllMode) {
        setCurrentIndex((idx) => (idx + 1 < queue.length ? idx + 1 : 0));
      } else {
        setCurrentIndex(0);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderHeadword = (fc: Flashcard) => {
    if (fc.learningLang !== 'zh') return fc.word;
    const mode = profile?.chineseScript || 'both';
    if (mode === 'traditional' && fc.traditional) return fc.traditional;
    if (mode === 'both' && fc.traditional && fc.traditional !== fc.word) {
      return `${fc.word} · ${fc.traditional}`;
    }
    return fc.word;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Phương pháp lặp lại ngắt quãng (Spaced Repetition) · Đã ôn {sessionReviewedCount} thẻ trong phiên này
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Ôn tập thông minh hôm nay
          </h1>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start sm:self-auto">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'en', label: 'Tiếng Anh' },
            { id: 'zh', label: 'Tiếng Trung' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setLangFilter(t.id as 'all' | LearningLanguage);
                setCurrentIndex(0);
                setRevealed(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                langFilter === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 SRS State Summary Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Chưa học</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900">
            {stateBreakdown.unlearned}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Cần ôn lại</p>
          <p className="text-xl font-bold font-mono tabular-nums text-rose-700">
            {stateBreakdown.needs_review}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Đang học</p>
          <p className="text-xl font-bold font-mono tabular-nums text-amber-700">
            {stateBreakdown.learning}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Đã nhớ</p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700">
            {stateBreakdown.remembered}
          </p>
        </div>
      </section>

      {/* Active Review Card Stage */}
      {!activeCard ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 font-display">
              {flashcards.length === 0
                ? 'Chưa có từ vựng nào để ôn tập'
                : 'Tuyệt vời! Bạn đã hoàn thành hết các từ cần ôn hôm nay'}
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {flashcards.length === 0
                ? 'Hãy tạo bài học đầu tiên từ trang Nhập bản dịch để hệ thống sinh thẻ từ tự động.'
                : 'Hệ thống đã lên lịch nhắc lại vào đúng thời điểm tối ưu giúp bạn ghi nhớ dài hạn.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {flashcards.length === 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
              >
                Nhập bản dịch tạo từ mới
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPracticeAllMode(true);
                  setCurrentIndex(0);
                  setRevealed(false);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Ôn luyện tự do toàn bộ kho thẻ ({flashcards.length})
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {activeCard.learningLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'} ·{' '}
              {activeCard.partOfSpeech || 'Từ vựng'} · Còn lại{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-800">
                {queue.length}
              </span>{' '}
              thẻ
            </span>

            <button
              type="button"
              onClick={() => handlePlayWord(activeCard)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Nghe phát âm
            </button>
          </div>

          {/* Front Prompt */}
          <div className="py-6 text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 font-display">
              {renderHeadword(activeCard)}
            </h2>
            {activeCard.contexts.length > 0 && (
              <p className="text-xs text-slate-400">
                Chủ đề bắt gặp: {activeCard.contexts.join(' · ')}
              </p>
            )}
          </div>

          {!revealed ? (
            <div className="pt-4 border-t border-slate-100 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setRevealed(true);
                  void handlePlayWord(activeCard);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Eye className="w-4 h-4" />
                Lật thẻ xem nghĩa & ví dụ
              </button>
            </div>
          ) : (
            <div className="pt-6 border-t border-slate-100 space-y-5">
              {/* Revealed Answer Details */}
              <div className="space-y-3">
                <div className="text-center space-y-1">
                  <p className="text-base font-mono font-semibold text-sky-700">
                    {activeCard.learningLang === 'zh' ? activeCard.pinyin : activeCard.ipa}
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    {activeCard.meanings.join(' ; ')}
                  </p>
                </div>

                {activeCard.homonymNote && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    Lưu ý đồng âm: {activeCard.homonymNote}
                  </p>
                )}

                {activeCard.examples.length > 0 && (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Ví dụ ngữ cảnh:</p>
                    {activeCard.examples.slice(0, 2).map((ex, idx) => (
                      <div key={`rev_ex_${idx}`} className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-900">{ex.target}</p>
                        {ex.pronunciation && (
                          <p className="text-xs font-mono text-sky-700">{ex.pronunciation}</p>
                        )}
                        <p className="text-xs text-slate-600">{ex.vietnamese}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeCard.relatedForms.length > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    Từ liên quan: {activeCard.relatedForms.join(' · ')}
                  </p>
                )}
              </div>

              {/* 4 Self-Evaluation Buttons */}
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium text-center text-slate-500">
                  Tự đánh giá mức độ nhớ của bạn để lên lịch ôn tiếp theo:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRate('forgot')}
                    className="p-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900 transition-colors text-center space-y-0.5"
                  >
                    <span className="block text-sm font-bold">Quên</span>
                    <span className="block text-[11px] font-mono tabular-nums text-rose-700">
                      {previewIntervals.forgot}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRate('hard')}
                    className="p-3 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 transition-colors text-center space-y-0.5"
                  >
                    <span className="block text-sm font-bold">Khó</span>
                    <span className="block text-[11px] font-mono tabular-nums text-amber-700">
                      {previewIntervals.hard}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRate('good')}
                    className="p-3 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-900 transition-colors text-center space-y-0.5"
                  >
                    <span className="block text-sm font-bold">Đã nhớ</span>
                    <span className="block text-[11px] font-mono tabular-nums text-sky-700">
                      {previewIntervals.good}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRate('easy')}
                    className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 transition-colors text-center space-y-0.5"
                  >
                    <span className="block text-sm font-bold">Rất dễ</span>
                    <span className="block text-[11px] font-mono tabular-nums text-emerald-700">
                      {previewIntervals.easy}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {practiceAllMode && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setPracticeAllMode(false)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
              >
                <Repeat className="w-3.5 h-3.5" />
                Quay về chế độ chỉ ôn thẻ đến hạn hôm nay
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
