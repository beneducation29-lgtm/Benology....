import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import { updateLessonStudyProgress } from '../lib/firestoreService';
import {
  getAvailableVoicesForLang,
  isMediaRecorderSupported,
  isSpeechSynthesisSupported,
  speakText,
  stopAllSpeech,
} from '../lib/speech';
import { VoiceEngineMode } from '../types';

export function ShadowingPage() {
  const {
    profile,
    lessons,
    selectedLessonId,
    setSelectedLessonId,
    setActiveTab,
  } = useLearning();

  const activeLesson = useMemo(() => {
    if (selectedLessonId) {
      const found = lessons.find((l) => l.id === selectedLessonId);
      if (found) return found;
    }
    return lessons[0] || null;
  }, [lessons, selectedLessonId]);

  const [activeSentenceIdx, setActiveSentenceIdx] = useState(0);
  const [speed, setSpeed] = useState<number>(profile?.speechRate || 1.0);
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineMode>(
    profile?.preferredVoiceEngine || 'browser'
  );
  const [hideTranslation, setHideTranslation] = useState(false);

  const [isPlayingModel, setIsPlayingModel] = useState(false);
  const [playingMode, setPlayingMode] = useState<'single' | 'all' | null>(null);
  const [currentLoopInfo, setCurrentLoopInfo] = useState<string>('');
  const [audioError, setAudioError] = useState<string | null>(null);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingsBySentence, setRecordingsBySentence] = useState<Record<string, string>>({});
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopParagraphRef = useRef(false);

  const recorderSupported = isMediaRecorderSupported();
  const browserSpeechSupported = isSpeechSynthesisSupported();

  useEffect(() => {
    setActiveSentenceIdx(0);
    stopAllSpeech();
    setIsPlayingModel(false);
    setPlayingMode(null);
  }, [activeLesson?.id]);

  useEffect(() => {
    return () => {
      stopAllSpeech();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (!activeLesson) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
        <Mic className="w-9 h-9 text-slate-300 mx-auto" />
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900 font-display">
            Chưa có bài học để luyện nói Shadowing
          </h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Hãy nhập một bản dịch từ Google Dịch để hệ thống tách câu kèm phiên âm IPA / Pinyin phục vụ luyện nghe và nhại lại giọng mẫu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
        >
          Nhập bản dịch ngay
        </button>
      </div>
    );
  }

  const sentences =
    activeLesson.sentences.length > 0
      ? activeLesson.sentences
      : [
          {
            target:
              activeLesson.targetLang === activeLesson.learningLang
                ? activeLesson.translatedText
                : activeLesson.sourceText,
            traditional: '',
            pronunciation: '',
            vietnamese:
              activeLesson.sourceLang === 'vi'
                ? activeLesson.sourceText
                : activeLesson.translatedText,
            note: '',
          },
        ];

  const currentSentence = sentences[Math.min(activeSentenceIdx, sentences.length - 1)];
  const sentenceRecordKey = `${activeLesson.id}_${activeSentenceIdx}`;
  const currentRecordedUrl = recordingsBySentence[sentenceRecordKey];
  const browserVoices = getAvailableVoicesForLang(activeLesson.learningLang);

  const handleStopPlayback = () => {
    stopParagraphRef.current = true;
    stopAllSpeech();
    setIsPlayingModel(false);
    setPlayingMode(null);
    setCurrentLoopInfo('');
  };

  const handlePlaySingleSentence = async (idx = activeSentenceIdx) => {
    const sent = sentences[idx];
    if (!sent) return;

    stopParagraphRef.current = false;
    setAudioError(null);
    setActiveSentenceIdx(idx);
    setIsPlayingModel(true);
    setPlayingMode('single');

    try {
      await speakText({
        text: sent.target,
        lang: activeLesson.learningLang,
        rate: speed,
        repeatCount,
        engine: voiceEngine,
        preferredVoiceURI: profile?.preferredVoiceURI,
        onRepeatTick: (cur, tot) => {
          setCurrentLoopInfo(tot > 1 ? `Lần lặp ${cur}/${tot}` : 'Đang đọc câu mẫu');
        },
      });
      if (profile) {
        await updateLessonStudyProgress(profile, activeLesson, {
          shadowingCount: (activeLesson.shadowingCount || 0) + 1,
        });
      }
    } catch (err) {
      setAudioError(
        err instanceof Error
          ? err.message
          : 'Không thể phát âm câu mẫu. Hệ thống gợi ý chuyển sang Giọng đọc AI tự nhiên.'
      );
    } finally {
      setIsPlayingModel(false);
      setPlayingMode(null);
      setCurrentLoopInfo('');
    }
  };

  const handlePlayWholeParagraph = async () => {
    stopParagraphRef.current = false;
    setAudioError(null);
    setIsPlayingModel(true);
    setPlayingMode('all');

    try {
      for (let i = 0; i < sentences.length; i++) {
        if (stopParagraphRef.current) break;
        setActiveSentenceIdx(i);
        setCurrentLoopInfo(`Đoạn văn: Câu ${i + 1}/${sentences.length}`);
        await speakText({
          text: sentences[i].target,
          lang: activeLesson.learningLang,
          rate: speed,
          repeatCount: 1,
          engine: voiceEngine,
          preferredVoiceURI: profile?.preferredVoiceURI,
        });
      }
      if (profile && !stopParagraphRef.current) {
        await updateLessonStudyProgress(profile, activeLesson, {
          shadowingCount: (activeLesson.shadowingCount || 0) + 1,
        });
      }
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Lỗi phát toàn bộ đoạn văn.');
    } finally {
      setIsPlayingModel(false);
      setPlayingMode(null);
      setCurrentLoopInfo('');
    }
  };

  const handleStartRecording = async () => {
    setMicError(null);
    if (!recorderSupported) {
      setMicError(
        'Trình duyệt của bạn không hỗ trợ ghi âm trực tiếp (MediaRecorder). Bạn vẫn có thể nghe câu mẫu lặp lại và tự nhại theo trực tiếp.'
      );
      return;
    }

    try {
      stopAllSpeech();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordingsBySentence((prev) => ({
          ...prev,
          [sentenceRecordKey]: url,
        }));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setMicError(
        'Không thể truy cập micro. Vui lòng cấp quyền sử dụng Micro trên trình duyệt, hoặc tiếp tục luyện nói không ghi âm.'
      );
    }
  };

  const handleStopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const displayTargetSentence = () => {
    if (activeLesson.learningLang !== 'zh') return currentSentence.target;
    const mode = profile?.chineseScript || 'both';
    if (mode === 'traditional' && currentSentence.traditional) {
      return currentSentence.traditional;
    }
    if (
      mode === 'both' &&
      currentSentence.traditional &&
      currentSentence.traditional !== currentSentence.target
    ) {
      return `${currentSentence.target} (${currentSentence.traditional})`;
    }
    return currentSentence.target;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Luyện nghe phản xạ & nhại giọng bản xứ · Hỗ trợ tốc độ chậm, lặp câu và thu âm tự đối chiếu
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Phòng luyện nói Shadowing
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="shadow-lesson-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
            Chọn bài học:
          </label>
          <select
            id="shadow-lesson-select"
            value={activeLesson.id}
            onChange={(e) => setSelectedLessonId(e.target.value)}
            className="max-w-[260px] px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600 truncate"
          >
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                [{l.learningLang.toUpperCase()}] {l.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Browser Capability Notice if Browser Voices Missing */}
      {(!browserSpeechSupported || browserVoices.length === 0) && voiceEngine === 'browser' && (
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
            <span>
              Trình duyệt hiện tại không có sẵn bộ giọng đọc{' '}
              {activeLesson.learningLang === 'zh' ? 'Tiếng Trung Phổ thông' : 'Tiếng Anh'} nội bộ. Hệ thống tự động sử dụng <strong>Giọng đọc AI tự nhiên (Gemini TTS)</strong> để đảm bảo bạn vẫn nghe phát âm chuẩn.
            </span>
          </div>
        </div>
      )}

      {/* Two-Zone Interactive Shadowing Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Interactive Stage (7 cols) */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Câu {activeSentenceIdx + 1} / {sentences.length} ·{' '}
              {activeLesson.learningLang === 'zh' ? 'Tiếng Trung Phổ thông' : 'Tiếng Anh'}
            </span>

            <button
              type="button"
              onClick={() => setHideTranslation((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              {hideTranslation ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Hiện nghĩa tiếng Việt
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Ẩn nghĩa để luyện nghe
                </>
              )}
            </button>
          </div>

          {/* Focal Sentence Stage */}
          <div className="py-4 space-y-3">
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug font-display">
              {displayTargetSentence()}
            </p>
            {currentSentence.pronunciation && (
              <p className="text-base font-mono text-sky-700">
                {currentSentence.pronunciation}
              </p>
            )}
            {!hideTranslation && (
              <p className="text-base text-slate-600 pt-1">
                {currentSentence.vietnamese}
              </p>
            )}
            {currentSentence.note && !hideTranslation && (
              <p className="text-xs text-slate-500 pt-1">
                Mẹo phát âm / ngữ điệu: {currentSentence.note}
              </p>
            )}
          </div>

          {/* Playback Controls */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            {isPlayingModel ? (
              <button
                type="button"
                onClick={handleStopPlayback}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Pause className="w-4 h-4" />
                Dừng phát ({currentLoopInfo || 'Đang phát'})
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handlePlaySingleSentence(activeSentenceIdx)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Volume2 className="w-4 h-4" />
                  Nghe câu này ({repeatCount}x)
                </button>

                <button
                  type="button"
                  onClick={handlePlayWholeParagraph}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" />
                  Nghe cả đoạn ({sentences.length} câu)
                </button>
              </>
            )}
          </div>

          {audioError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {audioError}
            </p>
          )}

          {/* Voice Recording & Self-Comparison Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Thu âm giọng đọc của bạn & tự đối chiếu
                </h2>
                <p className="text-xs text-slate-500">
                  Nghe lại bản ghi của mình ngay cạnh câu mẫu để tự điều chỉnh thanh điệu và trọng âm
                </p>
              </div>

              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  Dừng thu ({recordingSeconds}s)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  disabled={!recorderSupported}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Mic className="w-3.5 h-3.5 text-rose-600" />
                  {currentRecordedUrl ? 'Thu âm lại câu này' : 'Bắt đầu thu âm'}
                </button>
              )}
            </div>

            {!recorderSupported && (
              <p className="text-xs text-amber-800">
                Thiết bị hoặc trình duyệt hiện tại không hỗ trợ API ghi âm trực tiếp. Phương án thay thế: bật chế độ lặp lại 3x–5x và nói đuổi (shadow) đồng thời theo nhịp câu mẫu.
              </p>
            )}

            {micError && <p className="text-xs text-rose-700">{micError}</p>}

            {currentRecordedUrl && (
              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <p className="text-xs font-medium text-slate-700">
                  Bản thu của bạn cho Câu {activeSentenceIdx + 1}:
                </p>
                <audio controls src={currentRecordedUrl} className="w-full h-10" />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handlePlaySingleSentence(activeSentenceIdx)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Nghe lại câu mẫu để so sánh
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Control & Sentence List Deck (5 cols) */}
        <section className="lg:col-span-5 space-y-5">
          {/* Speed, Repeat & Voice Engine Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Thiết lập phát âm
            </h2>

            {/* Speed Slider with Explicit Numeric Unit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="shadow-speed-slider" className="font-semibold text-slate-700">
                  Tốc độ phát âm
                </label>
                <span className="font-mono tabular-nums font-semibold text-sky-700">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                id="shadow-speed-slider"
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-sky-700"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>0.5x (Chậm rõ)</span>
                <span>1.0x (Tự nhiên)</span>
                <span>1.5x (Nhanh)</span>
              </div>
            </div>

            {/* Repeat Loop Count */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 block">
                Số lần lặp lại mỗi câu
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 5].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setRepeatCount(cnt)}
                    className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors font-mono tabular-nums ${
                      repeatCount === cnt
                        ? 'bg-sky-700 text-white border-sky-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cnt} lần
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Engine Selector */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 block">
                Nguồn giọng đọc
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVoiceEngine('browser')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    voiceEngine === 'browser'
                      ? 'bg-sky-700 text-white border-sky-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Web Speech (Nhanh)
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceEngine('gemini')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    voiceEngine === 'gemini'
                      ? 'bg-sky-700 text-white border-sky-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  AI TTS (Tự nhiên)
                </button>
              </div>
            </div>
          </div>

          {/* All Sentences Queue */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Danh sách câu trong bài ({sentences.length})
            </h2>
            <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
              {sentences.map((s, idx) => {
                const isSelected = idx === activeSentenceIdx;
                const hasRec = Boolean(recordingsBySentence[`${activeLesson.id}_${idx}`]);
                return (
                  <button
                    key={`queue_${idx}`}
                    type="button"
                    onClick={() => {
                      setActiveSentenceIdx(idx);
                      if (playingMode === 'single') handleStopPlayback();
                    }}
                    className={`w-full text-left py-3 px-2.5 first:pt-2 rounded-lg transition-colors space-y-1 ${
                      isSelected ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums font-semibold text-slate-700">
                        Câu {idx + 1}
                      </span>
                      {hasRec && <span className="text-emerald-700 font-medium">✓ Đã thu âm</span>}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 line-clamp-2">{s.target}</p>
                    {s.pronunciation && (
                      <p className="text-xs font-mono text-sky-700 truncate">{s.pronunciation}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
