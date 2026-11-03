import { LearningLanguage, VoiceEngineMode } from '../types';

const geminiAudioCache = new Map<string, string>();
let activeHtmlAudio: HTMLAudioElement | null = null;
let stopRequested = false;

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function getAvailableVoicesForLang(lang: LearningLanguage): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang === 'zh' ? 'zh' : 'en';
  return voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith(prefix) ||
      (lang === 'zh' && v.lang.toLowerCase().includes('cmn'))
  );
}

export function stopAllSpeech(): void {
  stopRequested = true;
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
  if (activeHtmlAudio) {
    activeHtmlAudio.pause();
    activeHtmlAudio.currentTime = 0;
    activeHtmlAudio = null;
  }
}

async function speakOnceGemini(
  text: string,
  lang: LearningLanguage,
  rate: number,
  voiceName = 'Kore'
): Promise<void> {
  const cacheKey = `${lang}::${voiceName}::${text.trim()}`;
  let base64 = geminiAudioCache.get(cacheKey);

  if (!base64) {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), lang, voiceName }),
    });
    const data = await res.json();
    if (!res.ok || !data.audioBase64) {
      throw new Error(data.error || 'Không thể tải giọng đọc AI.');
    }
    base64 = data.audioBase64 as string;
    geminiAudioCache.set(cacheKey, base64);
  }

  if (stopRequested) return;

  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    audio.playbackRate = Math.min(1.8, Math.max(0.5, rate));
    activeHtmlAudio = audio;

    audio.onended = () => {
      if (activeHtmlAudio === audio) activeHtmlAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (activeHtmlAudio === audio) activeHtmlAudio = null;
      reject(new Error('Không thể phát tệp âm thanh trên trình duyệt này.'));
    };
    audio.play().catch(reject);
  });
}

function speakOnceBrowser(
  text: string,
  lang: LearningLanguage,
  rate: number,
  preferredVoiceURI?: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!isSpeechSynthesisSupported()) {
      reject(new Error('Trình duyệt không hỗ trợ Web Speech API.'));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    utterance.rate = Math.min(1.8, Math.max(0.5, rate));

    const matchingVoices = getAvailableVoicesForLang(lang);
    if (preferredVoiceURI) {
      const exact = matchingVoices.find((v) => v.voiceURI === preferredVoiceURI);
      if (exact) utterance.voice = exact;
    }
    if (!utterance.voice && matchingVoices.length > 0) {
      // Prefer natural/Google/Microsoft online voices when available
      const natural = matchingVoices.find((v) =>
        /natural|google|siri|premium|xiaoxiao|us/i.test(v.name)
      );
      utterance.voice = natural || matchingVoices[0];
    }

    utterance.onend = () => resolve();
    utterance.onerror = (ev) => {
      if (ev.error === 'interrupted' || ev.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Lỗi phát âm trình duyệt: ${ev.error}`));
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

export interface SpeakOptions {
  text: string;
  lang: LearningLanguage;
  rate?: number;
  repeatCount?: number;
  engine?: VoiceEngineMode;
  preferredVoiceURI?: string;
  onRepeatTick?: (currentIteration: number, total: number) => void;
}

export async function speakText(options: SpeakOptions): Promise<void> {
  const {
    text,
    lang,
    rate = 1.0,
    repeatCount = 1,
    engine = 'browser',
    preferredVoiceURI,
    onRepeatTick,
  } = options;

  stopAllSpeech();
  stopRequested = false;

  const clean = text.trim();
  if (!clean) return;

  const total = Math.min(10, Math.max(1, repeatCount));

  for (let i = 1; i <= total; i++) {
    if (stopRequested) break;
    onRepeatTick?.(i, total);

    const browserVoices = getAvailableVoicesForLang(lang);
    const shouldUseGemini =
      engine === 'gemini' || !isSpeechSynthesisSupported() || browserVoices.length === 0;

    if (shouldUseGemini) {
      await speakOnceGemini(clean, lang, rate);
    } else {
      try {
        await speakOnceBrowser(clean, lang, rate, preferredVoiceURI);
      } catch {
        // Automatic fallback to Gemini AI TTS if browser synthesis fails
        await speakOnceGemini(clean, lang, rate);
      }
    }

    if (i < total && !stopRequested) {
      await new Promise((r) => setTimeout(r, 450));
    }
  }
}
