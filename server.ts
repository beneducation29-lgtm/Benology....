import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  GenerateContentConfig,
  GenerateContentResponse,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGenAI(timeoutMs = 30000): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: Math.max(12000, timeoutMs),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateTextWithFallback(
  contents: string,
  config?: GenerateContentConfig
): Promise<GenerateContentResponse> {
  const fastClient = getGenAI(25000);
  try {
    return await fastClient.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config,
    });
  } catch (primaryErr) {
    console.warn('Primary model gemini-3.1-flash-lite failed, falling back to gemini-3.8-flash:', primaryErr);
    const fallbackClient = getGenAI(30000);
    return await fallbackClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        ...config,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
  }
}

function detectLanguageHeuristic(text: string): 'vi' | 'en' | 'zh' {
  const sample = text.trim();
  if (!sample) return 'vi';
  if (/[\u4e00-\u9fff]/.test(sample)) {
    return 'zh';
  }
  const viPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (viPattern.test(sample)) {
    return 'vi';
  }
  return 'en';
}

interface AnalyzeRequestBody {
  sourceText?: string;
  translatedText?: string;
  sourceLang?: 'vi' | 'en' | 'zh';
  targetLang?: 'vi' | 'en' | 'zh';
  preferredLearningLang?: 'en' | 'zh';
  existingLessons?: Array<{
    id: string;
    title: string;
    topic: string;
    learningLang: string;
  }>;
  existingVocabulary?: Array<{
    canonicalKey: string;
    word: string;
    lemma: string;
    learningLang: string;
    homonymSenseKey?: string;
    meanings: string[];
  }>;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Heuristic + AI language detection & optional helper translation
  app.post('/api/detect-language', async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập văn bản cần nhận diện.' });
        return;
      }
      const detected = detectLanguageHeuristic(text);
      res.json({ language: detected });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi nhận diện ngôn ngữ.',
      });
    }
  });

  app.post('/api/suggest-translation', async (req, res) => {
    try {
      const { sourceText, sourceLang, targetLang } = req.body as {
        sourceText?: string;
        sourceLang?: 'vi' | 'en' | 'zh';
        targetLang?: 'vi' | 'en' | 'zh';
      };

      if (!sourceText || !sourceText.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập văn bản nguồn trước khi dịch.' });
        return;
      }

      const langNames: Record<string, string> = {
        vi: 'Tiếng Việt',
        en: 'Tiếng Anh (English)',
        zh: 'Tiếng Trung Phổ thông (Simplified Chinese)',
      };

      const fromName = langNames[sourceLang || 'vi'] || 'Tiếng Việt';
      const toName = langNames[targetLang || 'en'] || 'Tiếng Anh';

      const response = await generateTextWithFallback(
        `Dịch chính xác, tự nhiên đoạn văn sau từ ${fromName} sang ${toName}. Chỉ trả về đúng nội dung bản dịch, không thêm lời giải thích:\n\n${sourceText.trim()}`
      );

      const translated = (response.text ?? '').trim();
      if (!translated) {
        res.status(502).json({ error: 'Không nhận được bản dịch từ AI.' });
        return;
      }
      res.json({ translatedText: translated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể tạo bản dịch gợi ý.';
      res.status(500).json({ error: msg });
    }
  });

  // 2. Core AI Lesson + Deduplicated Flashcard Analysis
  app.post('/api/analyze-translation', async (req, res) => {
    try {
      const body = req.body as AnalyzeRequestBody;
      const sourceText = (body.sourceText ?? '').trim();
      const translatedText = (body.translatedText ?? '').trim();
      const sourceLang = body.sourceLang ?? detectLanguageHeuristic(sourceText);
      const targetLang = body.targetLang ?? detectLanguageHeuristic(translatedText);

      if (!sourceText || !translatedText) {
        res.status(400).json({
          error: 'Vui lòng nhập đầy đủ cả văn bản nguồn và bản dịch.',
        });
        return;
      }

      if (sourceText.length > 5000 || translatedText.length > 5000) {
        res.status(400).json({
          error: 'Nội dung nhập vượt quá giới hạn 5.000 ký tự cho mỗi lần xử lý.',
        });
        return;
      }

      let learningLang: 'en' | 'zh' = body.preferredLearningLang === 'zh' ? 'zh' : 'en';
      if (targetLang === 'en' || targetLang === 'zh') {
        learningLang = targetLang;
      } else if (sourceLang === 'en' || sourceLang === 'zh') {
        learningLang = sourceLang;
      }

      const existingLessons = (body.existingLessons ?? [])
        .filter((l) => l.learningLang === learningLang)
        .slice(0, 30);

      const existingVocabulary = (body.existingVocabulary ?? [])
        .filter((v) => v.learningLang === learningLang)
        .slice(0, 80);

      const ai = getGenAI();

      const systemInstruction = `Bạn là chuyên gia giảng dạy ngoại ngữ (Tiếng Anh và Tiếng Trung) dành cho người Việt.
Nhiệm vụ của bạn là phân tích cặp văn bản gốc và bản dịch do người dùng nhập từ Google Dịch để tạo bài học có hệ thống.

QUY TẮC BẮT BUỘC:
1. GIỮ NGUYÊN ý nghĩa của văn bản gốc và bản dịch do người dùng cung cấp. Tuyệt đối không tự ý sửa đổi nghĩa bản dịch gốc của người dùng.
2. Mọi lời giải thích ngữ pháp, nghĩa từ vựng, tóm tắt, ghi chú phát âm và giải thích bài tập PHẢI viết bằng tiếng Việt rõ ràng, thân thiện, dễ hiểu cho người mới bắt đầu.
3. Ngôn ngữ ngoại ngữ đang học (learningLang) cho bài này là: "${learningLang}" (${learningLang === 'en' ? 'Tiếng Anh' : 'Tiếng Trung'}).
4. KIỂM TRA BÀI HỌC LIÊN QUAN:
   Dưới đây là danh sách bài học hiện có của người dùng:
   ${JSON.stringify(existingLessons)}
   Nếu nội dung mới cùng chủ đề trực tiếp với một bài học hiện có, hãy trả về "matchedLessonId" là đúng "id" của bài học đó để hệ thống bổ sung vào bài học hiện có. Nếu không có bài học nào thực sự phù hợp, trả về chuỗi rỗng "" cho "matchedLessonId".
5. HỆ THỐNG TỪ VỰNG & FLASHCARD KHÔNG TRÙNG LẶP:
   Dưới đây là danh sách từ vựng người dùng đã có trong kho:
   ${JSON.stringify(existingVocabulary)}
   - Luôn chuẩn hóa "lemma" về dạng từ điển gốc (ví dụ Tiếng Anh: "running" -> "run", "better" -> "good", viết thường; Tiếng Trung: giữ chữ Hán giản thể chuẩn như "银行", "学习").
   - "homonymSenseKey": Dùng nhãn ngắn tiếng Anh viết thường nối bằng gạch dưới (ví dụ: "finance_bank" khác với "river_bank"; hoặc với chữ đa âm/đồng âm Tiếng Trung như "hang_profession" khác với "xing_walk", "fa_develop" khác với "fa_hair").
   - Nếu từ vựng trùng ngữ căn (lemma) và cùng nhóm nghĩa gốc với một từ trong danh sách đã có (kể cả khi xuất hiện với sắc thái nghĩa phụ mới trong câu này), hãy GIỮ NGUYÊN "homonymSenseKey" khớp với từ đã có và đặt "alreadyInBank": true để hệ thống gộp nghĩa mới & ví dụ mới vào cùng 1 flashcard duy nhất.
   - Nếu là từ đồng âm nhưng KHÁC hẳn nguồn gốc/cách đọc (ví dụ bank ngân hàng vs bank bờ sông; hoặc chữ Hán đa âm 行 xíng vs 行 háng; hoặc giản thể trùng nhưng phồn thể khác như 发: 發 phát triển vs 髮 mái tóc), hãy đặt "homonymSenseKey" khác nhau và ghi rõ sự phân biệt trong "homonymNote".
6. YÊU CẦU CHI TIẾT THEO NGÔN NGỮ:
   - Nếu learningLang = "en" (Tiếng Anh):
     + Điền đầy đủ "ipa" (ví dụ "/ˈʃedjuːl/"), "partOfSpeech" (ví dụ "danh từ (n)", "động từ (v)"), "meaningVi", "exampleTarget" (câu tiếng Anh), "examplePronunciation" (IPA hoặc hướng dẫn nhấn âm), "exampleVi", "relatedForms" (các dạng danh/động/tính/trạng từ liên quan). Để trống "traditional" và "pinyin".
   - Nếu learningLang = "zh" (Tiếng Trung):
     + "word" là chữ Hán giản thể, "traditional" là chữ Hán phồn thể tương ứng (phân biệt chính xác giản thể/phồn thể).
     + "pinyin" PHẢI có dấu thanh điệu chuẩn (ví dụ "yínháng", "xuéxí").
     + "exampleTarget" viết bằng chữ Hán, "examplePronunciation" là Pinyin có dấu thanh điệu của toàn bộ câu ví dụ đó, "exampleVi" là dịch nghĩa tiếng Việt.
     + "relatedForms" liệt kê từ ghép thông dụng hoặc lượng từ đi kèm. Để trống "ipa".
7. Tách toàn bộ nội dung thành danh sách các câu ("sentences") phục vụ luyện nghe & Shadowing: giữ nguyên từng câu ngoại ngữ trong bản gốc/bản dịch của người dùng, kèm phiên âm (IPA cho tiếng Anh, Pinyin có dấu thanh điệu cho tiếng Trung), bản chữ Hán phồn thể nếu là tiếng Trung, và nghĩa tiếng Việt tương ứng.
8. Tạo 2-4 cấu trúc ngữ pháp ("grammarPoints") và 3-4 câu hỏi bài tập trắc nghiệm ("exercises") bám sát nội dung vừa dịch.`;

      const prompt = `Phân tích nội dung dịch thuật sau:
- Ngôn ngữ nguồn: ${sourceLang}
- Ngôn ngữ đích: ${targetLang}
- Văn bản gốc của người dùng:
"""
${sourceText}
"""
- Bản dịch của người dùng:
"""
${translatedText}
"""`;

      const response = await generateTextWithFallback(prompt, {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchedLessonId: {
                type: Type.STRING,
                description: 'ID of matching existing lesson if same topic, else empty string.',
              },
              lessonTitle: {
                type: Type.STRING,
                description: 'Clear Vietnamese lesson title.',
              },
              topic: {
                type: Type.STRING,
                description: 'Topic name in Vietnamese (e.g., Giao tiếp công sở, Du lịch, Ẩm thực).',
              },
              summary: {
                type: Type.STRING,
                description: 'Short Vietnamese summary of communicative context and takeaways.',
              },
              sentences: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    target: {
                      type: Type.STRING,
                      description: 'Sentence in target foreign language (English or Simplified Chinese).',
                    },
                    traditional: {
                      type: Type.STRING,
                      description: 'Traditional Chinese version of the sentence if learningLang is zh, else empty string.',
                    },
                    pronunciation: {
                      type: Type.STRING,
                      description: 'Tone-marked Pinyin for Chinese or IPA/stress guide for English.',
                    },
                    vietnamese: {
                      type: Type.STRING,
                      description: 'Corresponding Vietnamese meaning.',
                    },
                    note: {
                      type: Type.STRING,
                      description: 'Brief beginner-friendly pronunciation or usage tip in Vietnamese.',
                    },
                  },
                  required: ['target', 'traditional', 'pronunciation', 'vietnamese', 'note'],
                },
              },
              vocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    lemma: { type: Type.STRING },
                    traditional: { type: Type.STRING },
                    homonymSenseKey: { type: Type.STRING },
                    homonymNote: { type: Type.STRING },
                    alreadyInBank: { type: Type.BOOLEAN },
                    ipa: { type: Type.STRING },
                    pinyin: { type: Type.STRING },
                    partOfSpeech: { type: Type.STRING },
                    meaningVi: { type: Type.STRING },
                    exampleTarget: { type: Type.STRING },
                    examplePronunciation: { type: Type.STRING },
                    exampleVi: { type: Type.STRING },
                    relatedForms: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'word',
                    'lemma',
                    'traditional',
                    'homonymSenseKey',
                    'homonymNote',
                    'alreadyInBank',
                    'ipa',
                    'pinyin',
                    'partOfSpeech',
                    'meaningVi',
                    'exampleTarget',
                    'examplePronunciation',
                    'exampleVi',
                    'relatedForms',
                  ],
                },
              },
              grammarPoints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pattern: { type: Type.STRING },
                    explanationVi: { type: Type.STRING },
                    exampleTarget: { type: Type.STRING },
                    examplePronunciation: { type: Type.STRING },
                    exampleVi: { type: Type.STRING },
                  },
                  required: [
                    'pattern',
                    'explanationVi',
                    'exampleTarget',
                    'examplePronunciation',
                    'exampleVi',
                  ],
                },
              },
              exercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctIndex: { type: Type.INTEGER },
                    explanationVi: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctIndex', 'explanationVi'],
                },
              },
            },
            required: [
              'matchedLessonId',
              'lessonTitle',
              'topic',
              'summary',
              'sentences',
              'vocabulary',
              'grammarPoints',
              'exercises',
            ],
          },
        });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        res.status(502).json({ error: 'AI không trả về dữ liệu phân tích. Vui lòng thử lại.' });
        return;
      }

      const parsed = JSON.parse(rawJson);
      res.json({
        learningLang,
        analysis: parsed,
      });
    } catch (error) {
      console.error('Gemini analyze-translation error:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Không thể phân tích bản dịch lúc này. Vui lòng kiểm tra kết nối và thử lại.';
      res.status(500).json({ error: message });
    }
  });

  // 3. Natural AI Text-to-Speech via Gemini TTS (fallback / high-quality speech option)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, lang, voiceName } = req.body as {
        text?: string;
        lang?: 'en' | 'zh';
        voiceName?: string;
      };

      const cleanText = (text ?? '').trim();
      if (!cleanText) {
        res.status(400).json({ error: 'Không có văn bản để đọc.' });
        return;
      }
      if (cleanText.length > 1000) {
        res.status(400).json({ error: 'Đoạn văn phát âm tối đa 1.000 ký tự mỗi lượt.' });
        return;
      }

      const allowedVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
      const selectedVoice = allowedVoices.includes(voiceName || '') ? voiceName! : 'Kore';
      const styleInstruction =
        lang === 'zh'
          ? 'Clear, natural standard Mandarin Chinese pronunciation with accurate four tones for language learners'
          : 'Clear, natural native English pronunciation at an articulate pace for language shadowing';

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Không thể tạo âm thanh từ AI TTS.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error) {
      console.error('Gemini TTS error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi phát âm AI TTS.',
      });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Translation Learning server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
