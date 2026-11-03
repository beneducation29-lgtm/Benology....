import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Mic,
  PlusCircle,
  Search,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import {
  deleteLessonDoc,
  toggleFlashcardFavorite,
  updateLessonStudyProgress,
} from '../lib/firestoreService';
import { speakText } from '../lib/speech';
import { LearningLanguage, Lesson } from '../types';

function formatDateShort(ts: unknown): string {
  if (!ts) return 'Mới tạo';
  let ms = 0;
  if (typeof ts === 'number') ms = ts;
  else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    ms = Number((ts as { seconds: number }).seconds) * 1000;
  }
  if (!ms) return 'Mới tạo';
  return new Date(ms).toLocaleDateString('vi-VN');
}

export function LessonsPage() {
  const {
    profile,
    lessons,
    flashcards,
    selectedLessonId,
    setSelectedLessonId,
    setActiveTab,
    openShadowingForLesson,
  } = useLearning();

  const [langFilter, setLangFilter] = useState<'all' | LearningLanguage>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  // Interactive Exercise state keyed by `${lessonId}_${exerciseIdx}`
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedLesson: Lesson | undefined = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId),
    [lessons, selectedLessonId]
  );

  const filteredLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lessons.filter((l) => {
      if (langFilter !== 'all' && l.learningLang !== langFilter) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.topic.toLowerCase().includes(q) ||
        l.sourceText.toLowerCase().includes(q) ||
        l.translatedText.toLowerCase().includes(q)
      );
    });
  }, [lessons, langFilter, searchQuery]);

  const linkedFlashcards = useMemo(() => {
    if (!selectedLesson) return [];
    const idSet = new Set(selectedLesson.vocabIds);
    return flashcards.filter((fc) => idSet.has(fc.id) || fc.lessonIds.includes(selectedLesson.id));
  }, [selectedLesson, flashcards]);

  const handlePlayAudio = async (text: string, lang: LearningLanguage, key: string) => {
    setSpeakingKey(key);
    try {
      await speakText({
        text,
        lang,
        rate: profile?.speechRate || 1.0,
        engine: profile?.preferredVoiceEngine || 'browser',
        preferredVoiceURI: profile?.preferredVoiceURI,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSpeakingKey(null);
    }
  };

  const handleSelectOption = async (lesson: Lesson, exIdx: number, optIdx: number) => {
    const stateKey = `${lesson.id}_${exIdx}`;
    const nextMap = { ...selectedAnswers, [stateKey]: optIdx };
    setSelectedAnswers(nextMap);

    if (!profile) return;
    let correctTotal = 0;
    lesson.exercises.forEach((ex, i) => {
      const chosen = nextMap[`${lesson.id}_${i}`];
      if (chosen === ex.correctIndex) {
        correctTotal += 1;
      }
    });

    await updateLessonStudyProgress(profile, lesson, {
      completedExercises: Math.max(lesson.completedExercises || 0, correctTotal),
    });
  };

  const handleMarkLessonComplete = async (lesson: Lesson) => {
    if (!profile) return;
    await updateLessonStudyProgress(profile, lesson, { markCompleted: true });
  };

  const handleDeleteLesson = async (lessonId: string) => {
    await deleteLessonDoc(lessonId);
    setConfirmDeleteId(null);
    if (selectedLessonId === lessonId) {
      setSelectedLessonId(null);
    }
  };

  const renderChineseTarget = (simplified: string, traditional: string) => {
    const mode = profile?.chineseScript || 'both';
    if (mode === 'traditional' && traditional) return traditional;
    if (mode === 'both' && traditional && traditional !== simplified) {
      return `${simplified} (${traditional})`;
    }
    return simplified;
  };

  // DETAIL VIEW OF A SINGLE LESSON
  if (selectedLesson) {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setSelectedLessonId(null)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách bài học
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openShadowingForLesson(selectedLesson.id)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Mic className="w-4 h-4 text-sky-700" />
              Luyện nói Shadowing
            </button>
            {!selectedLesson.isCompleted && (
              <button
                type="button"
                onClick={() => handleMarkLessonComplete(selectedLesson)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                Đánh dấu hoàn thành
              </button>
            )}
          </div>
        </div>

        {/* Lesson Header & Progress */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">
                {selectedLesson.learningLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'} · Chủ đề:{' '}
                {selectedLesson.topic} · Ngày tạo: {formatDateShort(selectedLesson.createdAt)} ·{' '}
                {selectedLesson.entryCount} bản dịch đã gộp
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
                {selectedLesson.title}
              </h1>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <p className="text-xs text-slate-500">Tiến trình bài học</p>
              <p className="text-xl font-bold font-mono tabular-nums text-sky-700">
                {selectedLesson.masteryPercent}%
              </p>
            </div>
          </div>

          {selectedLesson.summary && (
            <p className="text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
              {selectedLesson.summary}
            </p>
          )}

          {/* Verbatim Original & Translation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">
                Nội dung gốc ({selectedLesson.sourceLang.toUpperCase()})
              </p>
              <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                {selectedLesson.sourceText}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">
                Bản dịch gốc của bạn ({selectedLesson.targetLang.toUpperCase()})
              </p>
              <p className="text-sm text-slate-900 font-medium whitespace-pre-line leading-relaxed">
                {selectedLesson.translatedText}
              </p>
            </div>
          </div>
        </section>

        {/* Sentence Breakdown & Examples */}
        {selectedLesson.sentences.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 font-display">
              Phân tích từng câu & Ví dụ minh họa ({selectedLesson.sentences.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {selectedLesson.sentences.map((sent, idx) => {
                const key = `sent_${idx}`;
                const displayTarget =
                  selectedLesson.learningLang === 'zh'
                    ? renderChineseTarget(sent.target, sent.traditional)
                    : sent.target;

                return (
                  <div key={key} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-900">{displayTarget}</p>
                      {sent.pronunciation && (
                        <p className="text-xs font-mono text-sky-700">{sent.pronunciation}</p>
                      )}
                      <p className="text-sm text-slate-700">{sent.vietnamese}</p>
                      {sent.note && (
                        <p className="text-xs text-slate-500">Ghi chú: {sent.note}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handlePlayAudio(sent.target, selectedLesson.learningLang, key)
                      }
                      className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                        speakingKey === key
                          ? 'bg-sky-700 text-white border-sky-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Nghe câu mẫu"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Core Vocabulary Linked to Non-Duplicate Flashcards */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 font-display">
                Từ vựng trọng tâm ({linkedFlashcards.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đã đồng bộ tự động vào kho Flashcard không trùng lặp của bạn
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('flashcards')}
              className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
            >
              Mở kho Flashcard →
            </button>
          </div>

          {linkedFlashcards.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có từ vựng nào được trích xuất.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {linkedFlashcards.map((fc) => {
                const audioKey = `fc_${fc.id}`;
                const displayHead =
                  fc.learningLang === 'zh'
                    ? renderChineseTarget(fc.word, fc.traditional)
                    : fc.word;

                return (
                  <div key={fc.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-base font-bold text-slate-900">{displayHead}</span>
                        <span className="text-xs font-mono text-sky-700">
                          {fc.learningLang === 'zh' ? fc.pinyin : fc.ipa}
                        </span>
                        <span className="text-xs text-slate-500">
                          · {fc.partOfSpeech} · Bắt gặp {fc.encounterCount} lần
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{fc.meanings.join(' ; ')}</p>
                      {fc.homonymNote && (
                        <p className="text-xs text-amber-800">Lưu ý phân biệt: {fc.homonymNote}</p>
                      )}
                      {fc.examples[0] && (
                        <p className="text-xs text-slate-500">
                          Ví dụ: {fc.examples[0].target} — {fc.examples[0].vietnamese}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleFlashcardFavorite(fc)}
                        className={`p-2 rounded-lg border transition-colors ${
                          fc.isFavorite
                            ? 'text-amber-600 bg-amber-50 border-amber-200'
                            : 'text-slate-400 bg-white border-slate-200 hover:text-slate-700'
                        }`}
                        title="Đánh dấu yêu thích"
                      >
                        <Star className="w-4 h-4" fill={fc.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayAudio(fc.word, fc.learningLang, audioKey)}
                        className={`p-2 rounded-lg border transition-colors ${
                          speakingKey === audioKey
                            ? 'bg-sky-700 text-white border-sky-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Nghe phát âm từ"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Grammar Structures */}
        {selectedLesson.grammarPoints.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 font-display">
              Cấu trúc ngữ pháp cần nhớ ({selectedLesson.grammarPoints.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {selectedLesson.grammarPoints.map((gp, idx) => {
                const gKey = `gp_${idx}`;
                return (
                  <div key={gKey} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-base font-bold text-slate-900">{gp.pattern}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          handlePlayAudio(gp.exampleTarget, selectedLesson.learningLang, gKey)
                        }
                        className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
                        title="Nghe câu ví dụ ngữ pháp"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{gp.explanationVi}</p>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5">
                      <p className="text-sm font-semibold text-slate-900">{gp.exampleTarget}</p>
                      {gp.examplePronunciation && (
                        <p className="text-xs font-mono text-sky-700">{gp.examplePronunciation}</p>
                      )}
                      <p className="text-xs text-slate-600">{gp.exampleVi}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Interactive Practice Exercises */}
        {selectedLesson.exercises.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 font-display">
                Bài luyện tập áp dụng ({selectedLesson.exercises.length} câu)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chọn đáp án đúng để kiểm tra mức độ hiểu bài và tự động cập nhật tiến trình học
              </p>
            </div>

            <div className="space-y-6">
              {selectedLesson.exercises.map((ex, exIdx) => {
                const stateKey = `${selectedLesson.id}_${exIdx}`;
                const chosenIdx = selectedAnswers[stateKey];
                const answered = chosenIdx !== undefined;
                const isCorrect = chosenIdx === ex.correctIndex;

                return (
                  <div key={stateKey} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">
                      Câu {exIdx + 1}: {ex.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ex.options.map((opt, optIdx) => {
                        let btnStyle =
                          'bg-white border-slate-200 text-slate-800 hover:border-sky-400';
                        if (answered) {
                          if (optIdx === ex.correctIndex) {
                            btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold';
                          } else if (optIdx === chosenIdx) {
                            btnStyle = 'bg-rose-50 border-rose-400 text-rose-900';
                          } else {
                            btnStyle = 'bg-white border-slate-200 text-slate-400';
                          }
                        }

                        return (
                          <button
                            key={`${stateKey}_opt_${optIdx}`}
                            type="button"
                            onClick={() => handleSelectOption(selectedLesson, exIdx, optIdx)}
                            className={`text-left px-3.5 py-2.5 text-sm border rounded-lg transition-colors ${btnStyle}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {answered && (
                      <p
                        className={`text-xs leading-relaxed ${
                          isCorrect ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        <span className="font-semibold">
                          {isCorrect ? '✓ Chính xác: ' : '✕ Chưa đúng: '}
                        </span>
                        {ex.explanationVi}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  // MASTER LIST OF LESSONS
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Hệ thống hóa kiến thức từ lịch sử dịch thuật · Tự động gộp bài cùng chủ đề
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Danh sách bài học ({lessons.length})
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          Tạo bài học mới
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'en', label: 'Tiếng Anh' },
            { id: 'zh', label: 'Tiếng Trung' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLangFilter(tab.id as 'all' | LearningLanguage)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                langFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên bài, chủ đề, nội dung..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
        </div>
      </div>

      {filteredLessons.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <BookOpen className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-base font-semibold text-slate-800">
            {lessons.length === 0
              ? 'Bạn chưa có bài học nào'
              : 'Không tìm thấy bài học phù hợp với bộ lọc'}
          </p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Hãy nhập câu hoặc đoạn văn từ Google Dịch để AI tự động tách từ vựng, cấu trúc ngữ pháp và bài luyện tập.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredLessons.map((lesson) => (
            <div
              key={lesson.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className="text-left group"
                  >
                    <h2 className="text-lg font-bold text-slate-900 group-hover:text-sky-700 transition-colors font-display">
                      {lesson.title}
                    </h2>
                  </button>
                  <span className="text-xs font-mono tabular-nums font-semibold text-sky-700 shrink-0">
                    {lesson.masteryPercent}%
                  </span>
                </div>

                <p className="text-xs text-slate-500">
                  {lesson.learningLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'} · {lesson.topic} ·{' '}
                  {lesson.vocabIds.length} từ vựng · {lesson.grammarPoints.length} ngữ pháp ·{' '}
                  {formatDateShort(lesson.createdAt)}
                </p>

                <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                  {lesson.summary || lesson.translatedText}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedLessonId(lesson.id)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Mở bài học
                  </button>
                  <button
                    type="button"
                    onClick={() => openShadowingForLesson(lesson.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Shadowing
                  </button>
                </div>

                {confirmDeleteId === lesson.id ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteLesson(lesson.id)}
                      className="text-xs font-semibold text-rose-700 hover:underline whitespace-nowrap"
                    >
                      Xác nhận xóa
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-slate-500 hover:underline whitespace-nowrap"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(lesson.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                    title="Xóa bài học"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
