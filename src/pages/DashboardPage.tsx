import React, { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Flame,
  Headphones,
  Layers,
  Mic,
  PlusCircle,
  Repeat,
  Target,
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import { getEffectiveReviewState, isDueToday } from '../lib/dedupAndSrs';

function getLast7DaysLabels(): Array<{ dateStr: string; shortLabel: string }> {
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const out: Array<{ dateStr: string; shortLabel: string }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push({
      dateStr: `${y}-${m}-${day}`,
      shortLabel: i === 0 ? 'Hôm nay' : `${days[d.getDay()]} (${day}/${m})`,
    });
  }
  return out;
}

export function DashboardPage() {
  const {
    profile,
    lessons,
    flashcards,
    reviewProgressMap,
    setActiveTab,
    openLessonDetail,
    openShadowingForLesson,
  } = useLearning();

  const stats = useMemo(() => {
    let learnedCount = 0;
    let dueTodayCount = 0;
    let enCards = 0;
    let zhCards = 0;

    for (const fc of flashcards) {
      if (fc.learningLang === 'en') enCards += 1;
      if (fc.learningLang === 'zh') zhCards += 1;

      const prog = reviewProgressMap.get(fc.id);
      const effectiveState = getEffectiveReviewState(prog);
      if (effectiveState === 'learning' || effectiveState === 'remembered') {
        learnedCount += 1;
      }
      if (isDueToday(prog)) {
        dueTodayCount += 1;
      }
    }

    const completedLessons = lessons.filter((l) => l.isCompleted || l.masteryPercent >= 100).length;

    return {
      totalCards: flashcards.length,
      learnedCount,
      dueTodayCount,
      enCards,
      zhCards,
      completedLessons,
      totalLessons: lessons.length,
      streakDays: profile?.streakDays || 0,
    };
  }, [flashcards, reviewProgressMap, lessons, profile]);

  const weeklyChart = useMemo(() => {
    const logMap = new Map<string, { mins: number; revs: number }>();
    for (const entry of profile?.studyLog || []) {
      const [dateStr, minsStr, revsStr] = entry.split('|');
      if (dateStr) {
        logMap.set(dateStr, {
          mins: Number(minsStr) || 0,
          revs: Number(revsStr) || 0,
        });
      }
    }

    const days = getLast7DaysLabels();
    const goal = profile?.dailyGoalMinutes || 20;
    const maxMins = Math.max(
      goal,
      ...days.map((d) => logMap.get(d.dateStr)?.mins || 0),
      10
    );

    return {
      goal,
      maxMins,
      items: days.map((d) => {
        const rec = logMap.get(d.dateStr) || { mins: 0, revs: 0 };
        return {
          ...d,
          mins: rec.mins,
          revs: rec.revs,
          heightPct: Math.min(100, Math.round((rec.mins / maxMins) * 100)),
          reachedGoal: rec.mins >= goal,
        };
      }),
    };
  }, [profile]);

  const todayMinutes = weeklyChart.items[weeklyChart.items.length - 1]?.mins || 0;
  const dailyGoal = profile?.dailyGoalMinutes || 20;
  const todayGoalPct = Math.min(100, Math.round((todayMinutes / dailyGoal) * 100));

  return (
    <div className="space-y-8">
      {/* Header Welcome & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Tổng quan học tập · Mục tiêu mỗi ngày {dailyGoal} phút ({todayGoalPct}% hôm nay)
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Xin chào, {profile?.displayName || 'Học viên'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {stats.dueTodayCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Repeat className="w-4 h-4 text-sky-700" />
              Ôn tập hôm nay ({stats.dueTodayCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            Nhập bản dịch mới
          </button>
        </div>
      </div>

      {/* 4 Core KPI Metrics Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Số từ đã học</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.learnedCount}
            <span className="text-base font-normal text-slate-400">/{stats.totalCards}</span>
          </p>
          <p className="text-xs text-slate-500">
            Tiếng Anh: {stats.enCards} · Tiếng Trung: {stats.zhCards}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Cần ôn hôm nay</span>
            <Repeat className="w-4 h-4 text-sky-700" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-sky-700 font-mono tabular-nums">
            {stats.dueTodayCount}
          </p>
          <p className="text-xs text-slate-500">
            {stats.dueTodayCount === 0
              ? 'Đã hoàn thành lịch ôn hôm nay'
              : 'Thẻ đến hạn lặp lại ngắt quãng'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Bài học hoàn thành</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.completedLessons}
            <span className="text-base font-normal text-slate-400">/{stats.totalLessons}</span>
          </p>
          <p className="text-xs text-slate-500">
            Tự động phân nhóm theo chủ đề
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Chuỗi ngày liên tục</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.streakDays} <span className="text-sm font-sans font-normal text-slate-500">ngày</span>
          </p>
          <p className="text-xs text-slate-500">
            Hôm nay đã học {todayMinutes}/{dailyGoal} phút
          </p>
        </div>
      </section>

      {/* Weekly Progress & Recent Lessons 2-Column Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Weekly Activity Bar Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 font-display">
                Tiến trình học 7 ngày qua
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thời lượng học tập (phút) và số lượt ôn thẻ mỗi ngày · Mục tiêu {weeklyChart.goal} phút/ngày
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              Tổng:{' '}
              {weeklyChart.items.reduce((acc, item) => acc + item.mins, 0)} phút
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-3 pt-4 h-48 items-end border-b border-slate-100 pb-3">
            {weeklyChart.items.map((day) => (
              <div key={day.dateStr} className="flex flex-col items-center justify-end h-full gap-2">
                <span className="text-[11px] font-mono tabular-nums text-slate-500">
                  {day.mins > 0 ? `${day.mins}p` : '0'}
                </span>
                <div className="w-full max-w-[36px] bg-slate-100 rounded-t-md h-32 flex items-end overflow-hidden">
                  <div
                    className={`w-full rounded-t-md transition-opacity ${
                      day.reachedGoal
                        ? 'bg-emerald-600'
                        : day.mins > 0
                        ? 'bg-sky-600'
                        : 'bg-slate-200'
                    }`}
                    style={{ height: `${Math.max(day.mins > 0 ? 10 : 3, day.heightPct)}%` }}
                    title={`${day.shortLabel}: ${day.mins} phút · ${day.revs} lượt ôn thẻ`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-3 text-center">
            {weeklyChart.items.map((day) => (
              <div key={`${day.dateStr}-lbl`} className="space-y-0.5">
                <p className="text-[11px] font-medium text-slate-700 truncate">{day.shortLabel}</p>
                <p className="text-[10px] font-mono tabular-nums text-slate-400">
                  {day.revs} thẻ
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Lessons List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 font-display">
              Bài học gần đây
            </h2>
            {lessons.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('lessons')}
                className="text-xs font-semibold text-sky-700 hover:text-sky-800 inline-flex items-center gap-1 whitespace-nowrap"
              >
                Xem tất cả
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {lessons.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-800">
                  Chưa có bài học nào được tạo
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Dán một câu hoặc đoạn văn bạn vừa dịch trên Google Dịch để AI tạo bài học và bộ flashcard đầu tiên.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Tạo bài học đầu tiên
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lessons.slice(0, 4).map((lesson) => (
                <div key={lesson.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openLessonDetail(lesson.id)}
                      className="text-left group"
                    >
                      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                        {lesson.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {lesson.learningLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'} · {lesson.topic} ·{' '}
                        {lesson.vocabIds.length} từ vựng
                      </p>
                    </button>
                    <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
                      {lesson.masteryPercent}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openLessonDetail(lesson.id)}
                      className="text-xs font-medium text-sky-700 hover:underline whitespace-nowrap"
                    >
                      Học từ & ngữ pháp
                    </button>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => openShadowingForLesson(lesson.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                    >
                      <Mic className="w-3 h-3" />
                      Luyện Shadowing
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Guided 15-minute learning path */}
      <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-800">
              <Target className="w-4 h-4" />
              Lộ trình học mỗi ngày
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
              15 phút hôm nay, tiến bộ từng chút
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Học theo vòng lặp: nhớ lại → hiểu cách dùng → nghe và nói → tự kiểm tra.
              Bạn có thể hoàn thành từng bước theo tốc độ của mình.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-white/90 border border-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-800 whitespace-nowrap">
            <Clock3 className="w-3.5 h-3.5" />
            4 chặng · 15 phút
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab(stats.dueTodayCount > 0 ? 'review' : 'flashcards')}
            className="group text-left rounded-xl border border-white bg-white/90 hover:bg-white hover:border-sky-200 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50 text-amber-700">
                <Repeat className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono text-slate-500">03 phút</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">1. Gọi lại trí nhớ</p>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              {stats.dueTodayCount > 0
                ? `Ôn ${stats.dueTodayCount} thẻ đang đến hạn trước khi học mới.`
                : 'Lật lại vài thẻ cũ và thử nhớ nghĩa trước khi xem đáp án.'}
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-700 group-hover:gap-2 transition-all">
              {stats.dueTodayCount > 0 ? 'Bắt đầu ôn tập' : 'Mở flashcard'} <ArrowRight className="w-3 h-3" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('flashcards')}
            className="group text-left rounded-xl border border-white bg-white/90 hover:bg-white hover:border-sky-200 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-50 text-violet-700">
                <Layers className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono text-slate-500">04 phút</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">2. Học từ trong ngữ cảnh</p>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Chọn 3–5 từ, đọc ví dụ và tự đặt một câu mới thay vì chỉ học thuộc nghĩa.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-700 group-hover:gap-2 transition-all">
              Mở kho từ vựng <ArrowRight className="w-3 h-3" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => lessons[0] ? openShadowingForLesson(lessons[0].id) : setActiveTab('import')}
            className="group text-left rounded-xl border border-white bg-white/90 hover:bg-white hover:border-sky-200 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700">
                <Headphones className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono text-slate-500">04 phút</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">3. Nghe và nhại lại</p>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Nghe một câu, chú ý nhịp và phát âm, sau đó tự thu âm để luyện phản xạ.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-700 group-hover:gap-2 transition-all">
              {lessons.length > 0 ? 'Luyện Shadowing' : 'Tạo bài học để luyện'} <ArrowRight className="w-3 h-3" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => lessons[0] ? openLessonDetail(lessons[0].id) : setActiveTab('import')}
            className="group text-left rounded-xl border border-white bg-white/90 hover:bg-white hover:border-sky-200 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-50 text-rose-700">
                <BookOpen className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono text-slate-500">04 phút</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">4. Kiểm tra cách dùng</p>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Làm câu hỏi trong bài học và đọc giải thích tiếng Việt để sửa lỗi ngay.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-700 group-hover:gap-2 transition-all">
              {lessons.length > 0 ? 'Mở bài học' : 'Nhập bản dịch đầu tiên'} <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Gợi ý: nếu hôm nay chỉ có 5 phút, hãy ưu tiên ôn các thẻ đến hạn. Duy trì đều đặn quan trọng hơn học thật nhiều trong một lần.
        </p>
      </section>
    </div>
  );
}
