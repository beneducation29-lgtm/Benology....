import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Loader2,
  Mic,
  Share2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import { processAndSaveTranslation, ProcessTranslationResult } from '../lib/firestoreService';
import { DataSourceType, LanguageCode } from '../types';

const LANG_OPTIONS: Array<{ value: LanguageCode; label: string }> = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'Tiếng Anh (English)' },
  { value: 'zh', label: 'Tiếng Trung (中文)' },
];

interface SamplePreset {
  id: string;
  label: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  sourceText: string;
  translatedText: string;
}

const QUICK_SAMPLES: SamplePreset[] = [
  {
    id: 'en_work_1',
    label: 'Mẫu Anh – Việt: Lịch họp dự án',
    sourceLang: 'vi',
    targetLang: 'en',
    sourceText:
      'Chúng ta cần dời lịch họp sang sáng thứ Năm vì khách hàng muốn xem lại ngân sách dự án. Vui lòng gửi báo cáo chi tiết cho tôi trước 5 giờ chiều nay.',
    translatedText:
      'We need to reschedule the meeting to Thursday morning because the client wants to review the project budget. Please send me the detailed report before 5 PM today.',
  },
  {
    id: 'en_work_2',
    label: 'Mẫu Anh – Việt (Cùng chủ đề & kiểm tra gộp từ)',
    sourceLang: 'en',
    targetLang: 'vi',
    sourceText:
      'Could you check the bank transfer status and update our project budget before the meeting?',
    translatedText:
      'Bạn có thể kiểm tra trạng thái chuyển khoản ngân hàng và cập nhật ngân sách dự án của chúng ta trước cuộc họp không?',
  },
  {
    id: 'zh_travel_1',
    label: 'Mẫu Trung – Việt: Đặt phòng & di chuyển',
    sourceLang: 'vi',
    targetLang: 'zh',
    sourceText:
      'Xin chào, tôi đã đặt một phòng đôi trong ba đêm. Xin hỏi từ khách sạn đi tàu điện ngầm đến ngân hàng trung tâm mất bao lâu?',
    translatedText:
      '您好，我预订了三晚的双人间。请问从酒店坐地铁去中心银行需要多长时间？',
  },
];

function detectLocalLang(text: string): LanguageCode | null {
  const clean = text.trim();
  if (!clean) return null;
  if (/[\u4e00-\u9fff]/.test(clean)) return 'zh';
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(clean)) {
    return 'vi';
  }
  if (/[a-zA-Z]{3,}/.test(clean)) return 'en';
  return null;
}

function formatDateVi(ts: unknown): string {
  if (!ts) return 'Vừa xong';
  let ms = 0;
  if (typeof ts === 'number') ms = ts;
  else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    ms = Number((ts as { seconds: number }).seconds) * 1000;
  }
  if (!ms) return 'Vừa xong';
  return new Date(ms).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ImportPage() {
  const {
    profile,
    entries,
    lessons,
    flashcards,
    vocabulary,
    openLessonDetail,
    openShadowingForLesson,
  } = useLearning();

  const [sourceLang, setSourceLang] = useState<LanguageCode>('vi');
  const [targetLang, setTargetLang] = useState<LanguageCode>('en');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [dataSource, setDataSource] = useState<DataSourceType>('manual_paste');
  const [autoDetectedNote, setAutoDetectedNote] = useState<string>('');

  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<ProcessTranslationResult | null>(null);
  const [showIntegrationBox, setShowIntegrationBox] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

  // Support incoming Web Share / Bookmarklet query parameters (?source=...&translation=...&sl=...&tl=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedSource = params.get('source') || params.get('text') || '';
    const sharedTrans = params.get('translation') || '';
    const sl = params.get('sl') as LanguageCode | null;
    const tl = params.get('tl') as LanguageCode | null;

    if (sharedSource || sharedTrans) {
      if (sharedSource) setSourceText(sharedSource);
      if (sharedTrans) setTranslatedText(sharedTrans);
      if (sl && ['vi', 'en', 'zh'].includes(sl)) setSourceLang(sl);
      if (tl && ['vi', 'en', 'zh'].includes(tl)) setTargetLang(tl);
      setDataSource(params.get('via') === 'extension' ? 'extension_bridge' : 'share_intent');
      setAutoDetectedNote('Đã nhận nội dung chuyển tiếp từ liên kết chia sẻ.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSourceChange = (val: string) => {
    setSourceText(val);
    const detected = detectLocalLang(val);
    if (detected && detected !== sourceLang) {
      setSourceLang(detected);
      if (detected === targetLang) {
        const nextTarget: LanguageCode =
          detected === 'vi' ? profile?.primaryLearningLang || 'en' : 'vi';
        setTargetLang(nextTarget);
      }
      const lbl = LANG_OPTIONS.find((o) => o.value === detected)?.label || detected;
      setAutoDetectedNote(`Tự động nhận diện ngôn ngữ nguồn: ${lbl}`);
    }
  };

  const handleTranslatedChange = (val: string) => {
    setTranslatedText(val);
    const detected = detectLocalLang(val);
    if (detected && detected !== targetLang && detected !== sourceLang) {
      setTargetLang(detected);
      const lbl = LANG_OPTIONS.find((o) => o.value === detected)?.label || detected;
      setAutoDetectedNote(`Tự động nhận diện ngôn ngữ đích: ${lbl}`);
    }
  };

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    if (sourceText || translatedText) {
      setSourceText(translatedText);
      setTranslatedText(sourceText);
    }
  };

  const handleSuggestTranslation = async () => {
    if (!sourceText.trim()) {
      setErrorMsg('Vui lòng nhập hoặc dán văn bản nguồn trước khi lấy bản dịch gợi ý.');
      return;
    }
    if (sourceLang === targetLang) {
      setErrorMsg('Ngôn ngữ nguồn và ngôn ngữ đích cần khác nhau.');
      return;
    }

    setSuggesting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/suggest-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText,
          sourceLang,
          targetLang,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.translatedText) {
        throw new Error(data.error || 'Không thể lấy bản dịch gợi ý.');
      }
      setTranslatedText(data.translatedText);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối dịch tự động.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleApplySample = (sample: SamplePreset) => {
    setSourceLang(sample.sourceLang);
    setTargetLang(sample.targetLang);
    setSourceText(sample.sourceText);
    setTranslatedText(sample.translatedText);
    setDataSource('quick_sample');
    setErrorMsg(null);
    setResultInfo(null);
    setAutoDetectedNote(`Đã nạp mẫu đa câu (${sample.label})`);
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!sourceText.trim() || !translatedText.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ cả Văn bản nguồn và Bản dịch từ Google Dịch.');
      return;
    }
    if (sourceLang === targetLang) {
      setErrorMsg('Ngôn ngữ nguồn và ngôn ngữ đích không được trùng nhau.');
      return;
    }
    if (sourceLang === 'vi' && targetLang === 'vi') {
      setErrorMsg('Cần ít nhất một ngôn ngữ là Tiếng Anh hoặc Tiếng Trung để tạo bài học.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setResultInfo(null);

    try {
      const res = await processAndSaveTranslation({
        profile,
        sourceText,
        translatedText,
        sourceLang,
        targetLang,
        dataSource,
        existingLessons: lessons,
        existingFlashcards: flashcards,
        existingVocab: vocabulary,
      });
      setResultInfo(res);
      setSourceText('');
      setTranslatedText('');
      setDataSource('manual_paste');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể tạo bài học lúc này. Bản dịch đã được lưu trạng thái lỗi để bạn thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const bookmarkletCode = `javascript:(function(){var s=window.getSelection().toString()||'';window.open('${appOrigin}/?via=extension&source='+encodeURIComponent(s),'_blank');})();`;

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopiedBookmarklet(true);
      setTimeout(() => setCopiedBookmarklet(false), 2500);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Thu thập nội dung dịch thuật · Giữ nguyên bản gốc & tự động phân loại chủ đề
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Nhập bản dịch từ Google Dịch
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowIntegrationBox((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Share2 className="w-3.5 h-3.5 text-sky-700" />
          {showIntegrationBox ? 'Ẩn tích hợp Chia sẻ & Tiện ích' : 'Tích hợp Chia sẻ ĐT & Tiện ích'}
        </button>
      </div>

      {/* Extensible Google Translate Mobile Share & Browser Extension Bridge */}
      {showIntegrationBox && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Cổng kết nối mở rộng với Google Dịch (Điện thoại & Trình duyệt)
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Do trình duyệt bảo mật dữ liệu riêng tư giữa các trang web, ứng dụng không tự ý đọc ngầm lịch sử Google Dịch của bạn. Bạn có thể dán thủ công bên dưới hoặc chuyển nội dung nhanh qua 2 cơ chế tích hợp sẵn:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                1. Chia sẻ từ điện thoại (URL Share Intent)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Trang này tự động nhận tham số chia sẻ{' '}
                <code className="font-mono text-slate-800">?source=...&translation=...&sl=vi&tl=en</code>{' '}
                từ phím tắt iOS Shortcuts hoặc Android Web Share Target để điền sẵn nội dung ngay khi mở.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  2. Bookmarklet / Tiện ích trình duyệt
                </h3>
                <button
                  type="button"
                  onClick={copyBookmarklet}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-sky-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
                >
                  <Copy className="w-3 h-3" />
                  {copiedBookmarklet ? 'Đã sao chép mã' : 'Sao chép Bookmarklet'}
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Lưu mã Bookmarklet lên thanh dấu trang trình duyệt: khi bôi đen văn bản trên Google Dịch và bấm nút, nội dung sẽ gửi thẳng sang trang Nhập bản dịch này.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Quick Sample Presets for Testing Multi-sentence & Non-duplicate Merging */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">
          Dùng thử nhanh với dữ liệu mẫu nhiều câu:
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => handleApplySample(sample)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-sky-300 hover:text-sky-800 rounded-lg transition-colors whitespace-nowrap"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Translation Input Form */}
      <form onSubmit={handleCreateLesson} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        {/* Language Selector Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor="source-lang" className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Ngôn ngữ nguồn:
            </label>
            <select
              id="source-lang"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value as LanguageCode)}
              className="flex-1 sm:max-w-[200px] px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSwapLanguages}
            title="Đảo chiều ngôn ngữ và văn bản"
            className="self-center inline-flex items-center justify-center p-2 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 flex-1 sm:justify-end">
            <label htmlFor="target-lang" className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Ngôn ngữ đích:
            </label>
            <select
              id="target-lang"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value as LanguageCode)}
              className="flex-1 sm:max-w-[200px] px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {autoDetectedNote && (
          <p className="text-xs text-sky-700 font-medium">{autoDetectedNote}</p>
        )}

        {/* Side-by-Side Source & Translation Textareas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="source-text" className="text-sm font-semibold text-slate-800">
                Văn bản nguồn (hỗ trợ nhiều câu / đoạn văn)
              </label>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {sourceText.length}/5000
              </span>
            </div>
            <textarea
              id="source-text"
              rows={6}
              value={sourceText}
              onChange={(e) => handleSourceChange(e.target.value)}
              placeholder="Nhập hoặc dán câu, đoạn văn gốc bạn đã tra trên Google Dịch..."
              className="w-full p-3.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600 leading-relaxed resize-y"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="translated-text" className="text-sm font-semibold text-slate-800">
                Bản dịch từ Google Dịch
              </label>
              <button
                type="button"
                onClick={handleSuggestTranslation}
                disabled={suggesting || !sourceText.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800 disabled:opacity-40 whitespace-nowrap"
              >
                {suggesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                {suggesting ? 'Đang dịch...' : 'Chưa có sẵn? Gợi ý bản dịch'}
              </button>
            </div>
            <textarea
              id="translated-text"
              rows={6}
              value={translatedText}
              onChange={(e) => handleTranslatedChange(e.target.value)}
              placeholder="Dán kết quả dịch từ Google Dịch vào đây (hệ thống giữ nguyên 100% câu dịch gốc của bạn)..."
              className="w-full p-3.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600 leading-relaxed resize-y"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {resultInfo && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
            <div className="flex items-start gap-2.5 text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  {resultInfo.mergedIntoExistingLesson
                    ? 'Đã bổ sung nội dung vào bài học cùng chủ đề hiện có!'
                    : 'Đã phân tích và tạo bài học mới thành công!'}
                </p>
                <p className="text-xs text-emerald-800">
                  Thêm mới {resultInfo.newFlashcardsCount} flashcard · Cập nhật thêm ngữ cảnh/nghĩa cho{' '}
                  {resultInfo.updatedFlashcardsCount} từ vựng đã có trong kho.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pl-7">
              <button
                type="button"
                onClick={() => openLessonDetail(resultInfo.lessonId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Mở bài học vừa tạo
              </button>
              <button
                type="button"
                onClick={() => openShadowingForLesson(resultInfo.lessonId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <Mic className="w-3.5 h-3.5" />
                Luyện nói Shadowing ngay
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <p className="text-xs text-slate-500">
            AI sẽ tự động tách câu, giải thích ngữ pháp tiếng Việt và kiểm tra trùng lặp từ vựng theo từ gốc (lemma).
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang phân tích & tạo bài học...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Tạo bài học
              </>
            )}
          </button>
        </div>
      </form>

      {/* Saved Translation Entries Log */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 font-display">
              Lịch sử bản dịch đã lưu ({entries.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lưu đầy đủ văn bản gốc, bản dịch, cặp ngôn ngữ, nguồn nhập và trạng thái xử lý
            </p>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
            <ClipboardPaste className="w-7 h-7 text-slate-300" />
            <span>Chưa có bản dịch nào được lưu.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.slice(0, 10).map((entry) => (
              <div key={entry.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {entry.sourceLang.toUpperCase()} → {entry.targetLang.toUpperCase()} ·{' '}
                    {entry.dataSource === 'manual_paste'
                      ? 'Nhập thủ công'
                      : entry.dataSource === 'share_intent'
                      ? 'Chia sẻ di động'
                      : entry.dataSource === 'extension_bridge'
                      ? 'Tiện ích trình duyệt'
                      : 'Dữ liệu mẫu'}{' '}
                    · {formatDateVi(entry.createdAt)}
                  </span>
                  <span className="font-medium text-slate-700">
                    {entry.status === 'processed'
                      ? '✓ Đã tạo bài học'
                      : entry.status === 'pending'
                      ? '⋯ Đang xử lý'
                      : '✕ Lỗi xử lý'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <p className="text-slate-700 line-clamp-2">{entry.sourceText}</p>
                  <p className="text-slate-900 font-medium line-clamp-2">{entry.translatedText}</p>
                </div>

                {entry.lessonId && (
                  <div>
                    <button
                      type="button"
                      onClick={() => openLessonDetail(entry.lessonId)}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Xem bài học đã liên kết →
                    </button>
                  </div>
                )}
                {entry.status === 'failed' && entry.errorMessage && (
                  <p className="text-xs text-rose-700">{entry.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
