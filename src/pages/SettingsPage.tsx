import React, { useEffect, useState } from 'react';
import { CheckCircle2, LogOut, Save, Volume2 } from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import { signOutUser } from '../lib/firebase';
import { updateUserSettings } from '../lib/firestoreService';
import { getAvailableVoicesForLang, isSpeechSynthesisSupported, speakText } from '../lib/speech';
import { ChineseScriptMode, LearningLanguage, VoiceEngineMode } from '../types';

export function SettingsPage() {
  const { profile, firebaseUser } = useLearning();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [primaryLang, setPrimaryLang] = useState<LearningLanguage>(
    profile?.primaryLearningLang || 'en'
  );
  const [chineseScript, setChineseScript] = useState<ChineseScriptMode>(
    profile?.chineseScript || 'both'
  );
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineMode>(
    profile?.preferredVoiceEngine || 'browser'
  );
  const [voiceURI, setVoiceURI] = useState<string>(profile?.preferredVoiceURI || '');
  const [speechRate, setSpeechRate] = useState<number>(profile?.speechRate || 1.0);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(
    profile?.dailyGoalMinutes || 20
  );
  const [dailyNewCardsGoal, setDailyNewCardsGoal] = useState<number>(
    profile?.dailyNewCardsGoal || 15
  );

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setPrimaryLang(profile.primaryLearningLang);
    setChineseScript(profile.chineseScript);
    setVoiceEngine(profile.preferredVoiceEngine);
    setVoiceURI(profile.preferredVoiceURI);
    setSpeechRate(profile.speechRate);
    setDailyGoalMinutes(profile.dailyGoalMinutes);
    setDailyNewCardsGoal(profile.dailyNewCardsGoal);
  }, [profile]);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    const refresh = () => {
      setVoices(getAvailableVoicesForLang(primaryLang));
    };
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, [primaryLang]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSavedBanner(false);
    try {
      await updateUserSettings(profile, {
        displayName,
        primaryLearningLang: primaryLang,
        chineseScript,
        preferredVoiceEngine: voiceEngine,
        preferredVoiceURI: voiceURI,
        speechRate,
        dailyGoalMinutes,
        dailyNewCardsGoal,
      });
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestVoice = async () => {
    const sampleText =
      primaryLang === 'zh'
        ? '您好，欢迎使用智能翻译学习系统。'
        : 'Welcome! Consistent daily practice turns translations into fluent speech.';
    await speakText({
      text: sampleText,
      lang: primaryLang,
      rate: speechRate,
      engine: voiceEngine,
      preferredVoiceURI: voiceURI,
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">
          Cá nhân hóa ngôn ngữ mục tiêu, giọng đọc phát âm và định mức học tập hàng ngày
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
          Cài đặt học tập
        </h1>
      </div>

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        {/* Account & Display Name */}
        <div className="space-y-4 pb-6 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 font-display">
            Hồ sơ người học
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-name" className="text-xs font-semibold text-slate-700">
                Tên hiển thị
              </label>
              <input
                id="settings-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 block">
                Tài khoản đăng nhập
              </span>
              <p className="px-3 py-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg truncate">
                {firebaseUser?.email || 'Đã xác thực Google'}
              </p>
            </div>
          </div>
        </div>

        {/* Language & Chinese Script */}
        <div className="space-y-4 pb-6 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 font-display">
            Ngôn ngữ & Hiển thị chữ viết
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-lang" className="text-xs font-semibold text-slate-700">
                Ngôn ngữ ngoại ngữ ưu tiên
              </label>
              <select
                id="settings-lang"
                value={primaryLang}
                onChange={(e) => setPrimaryLang(e.target.value as LearningLanguage)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="en">Tiếng Anh (English)</option>
                <option value="zh">Tiếng Trung Phổ thông (中文)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-zh-script" className="text-xs font-semibold text-slate-700">
                Hiển thị chữ Hán (khi học Tiếng Trung)
              </label>
              <select
                id="settings-zh-script"
                value={chineseScript}
                onChange={(e) => setChineseScript(e.target.value as ChineseScriptMode)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="both">Hiển thị cả Giản thể & Phồn thể</option>
                <option value="simplified">Chỉ chữ Hán Giản thể (简体)</option>
                <option value="traditional">Chỉ chữ Hán Phồn thể (繁體)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Speech & TTS Configuration */}
        <div className="space-y-4 pb-6 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 font-display">
              Giọng đọc & Tốc độ phát âm
            </h2>
            <button
              type="button"
              onClick={handleTestVoice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Nghe thử giọng đọc
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-engine" className="text-xs font-semibold text-slate-700">
                Công nghệ phát âm (TTS)
              </label>
              <select
                id="settings-engine"
                value={voiceEngine}
                onChange={(e) => setVoiceEngine(e.target.value as VoiceEngineMode)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="browser">Web Speech API (Tức thì trên trình duyệt)</option>
                <option value="gemini">Gemini AI TTS (Giọng tự nhiên chất lượng cao)</option>
              </select>
            </div>

            {voiceEngine === 'browser' && (
              <div className="space-y-1.5">
                <label htmlFor="settings-voice-uri" className="text-xs font-semibold text-slate-700">
                  Giọng đọc trình duyệt ({primaryLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'})
                </label>
                <select
                  id="settings-voice-uri"
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  <option value="">Tự động chọn giọng tự nhiên nhất</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="settings-rate" className="font-semibold text-slate-700">
                Tốc độ đọc mặc định
              </label>
              <span className="font-mono tabular-nums font-semibold text-sky-700">
                {speechRate.toFixed(2)}x
              </span>
            </div>
            <input
              id="settings-rate"
              type="range"
              min={0.5}
              max={1.6}
              step={0.05}
              value={speechRate}
              onChange={(e) => setSpeechRate(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>
        </div>

        {/* Daily Learning Goals */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 font-display">
            Mục tiêu học tập mỗi ngày
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-goal-mins" className="text-xs font-semibold text-slate-700">
                Thời lượng học mục tiêu (phút / ngày)
              </label>
              <input
                id="settings-goal-mins"
                type="number"
                min={5}
                max={240}
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-goal-cards" className="text-xs font-semibold text-slate-700">
                Số thẻ từ mục tiêu mỗi ngày
              </label>
              <input
                id="settings-goal-cards"
                type="number"
                min={5}
                max={100}
                value={dailyNewCardsGoal}
                onChange={(e) => setDailyNewCardsGoal(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>
        </div>

        {savedBanner && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            Đã lưu cài đặt học tập thành công.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => signOutUser()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất tài khoản
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </form>
    </div>
  );
}
