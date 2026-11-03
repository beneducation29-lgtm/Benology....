import React, { useMemo, useState } from 'react';
import {
  Edit3,
  Layers,
  Plus,
  Search,
  Star,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import { getEffectiveReviewState } from '../lib/dedupAndSrs';
import {
  deleteFlashcardAndRelated,
  toggleFlashcardFavorite,
  updateFlashcardManual,
} from '../lib/firestoreService';
import { speakText } from '../lib/speech';
import { Flashcard, FlashcardExample, LearningLanguage, ReviewState } from '../types';

const STATE_LABELS: Record<ReviewState, string> = {
  unlearned: 'Chưa học',
  learning: 'Đang học',
  remembered: 'Đã nhớ',
  needs_review: 'Cần ôn lại',
};

export function FlashcardsPage() {
  const {
    profile,
    flashcards,
    vocabulary,
    reviewProgressList,
    reviewProgressMap,
    setActiveTab,
  } = useLearning();

  const [langFilter, setLangFilter] = useState<'all' | LearningLanguage>('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'favorite' | ReviewState>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Edit modal state
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editTraditional, setEditTraditional] = useState('');
  const [editIpa, setEditIpa] = useState('');
  const [editPinyin, setEditPinyin] = useState('');
  const [editPos, setEditPos] = useState('');
  const [editHomonym, setEditHomonym] = useState('');
  const [editMeaningsText, setEditMeaningsText] = useState('');
  const [editRelatedText, setEditRelatedText] = useState('');
  const [editExamples, setEditExamples] = useState<FlashcardExample[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return flashcards.filter((fc) => {
      if (langFilter !== 'all' && fc.learningLang !== langFilter) return false;
      if (stateFilter === 'favorite' && !fc.isFavorite) return false;
      if (
        stateFilter !== 'all' &&
        stateFilter !== 'favorite' &&
        getEffectiveReviewState(reviewProgressMap.get(fc.id)) !== stateFilter
      ) {
        return false;
      }

      if (!q) return true;
      return (
        fc.word.toLowerCase().includes(q) ||
        fc.lemma.toLowerCase().includes(q) ||
        fc.traditional.toLowerCase().includes(q) ||
        fc.pinyin.toLowerCase().includes(q) ||
        fc.ipa.toLowerCase().includes(q) ||
        fc.meanings.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [flashcards, langFilter, stateFilter, searchQuery, reviewProgressMap]);

  const openEditModal = (card: Flashcard) => {
    setEditingCard(card);
    setEditWord(card.word);
    setEditTraditional(card.traditional);
    setEditIpa(card.ipa);
    setEditPinyin(card.pinyin);
    setEditPos(card.partOfSpeech);
    setEditHomonym(card.homonymNote);
    setEditMeaningsText(card.meanings.join('\n'));
    setEditRelatedText(card.relatedForms.join('\n'));
    setEditExamples(card.examples.map((ex) => ({ ...ex })));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    setSavingEdit(true);
    try {
      const meanings = editMeaningsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const relatedForms = editRelatedText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      await updateFlashcardManual(editingCard, {
        word: editWord,
        traditional: editTraditional,
        homonymNote: editHomonym,
        ipa: editIpa,
        pinyin: editPinyin,
        partOfSpeech: editPos,
        meanings: meanings.length > 0 ? meanings : editingCard.meanings,
        examples: editExamples.filter((ex) => ex.target.trim().length > 0),
        relatedForms,
        isFavorite: editingCard.isFavorite,
      });
      setEditingCard(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSpeak = async (text: string, lang: LearningLanguage, key: string) => {
    setSpeakingId(key);
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
      setSpeakingId(null);
    }
  };

  const handleDelete = async (card: Flashcard) => {
    await deleteFlashcardAndRelated(card, vocabulary, reviewProgressList);
    setConfirmDeleteId(null);
  };

  const formatHeadword = (fc: Flashcard) => {
    if (fc.learningLang !== 'zh') return fc.word;
    const script = profile?.chineseScript || 'both';
    if (script === 'traditional' && fc.traditional) return fc.traditional;
    if (script === 'both' && fc.traditional && fc.traditional !== fc.word) {
      return `${fc.word} · ${fc.traditional}`;
    }
    return fc.word;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Chuẩn hóa theo từ gốc (lemma) & ngữ cảnh đồng âm · Tự động gộp đa nghĩa và ví dụ mới
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">
            Kho Flashcard không trùng lặp ({flashcards.length})
          </h1>
        </div>

        {flashcards.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('review')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            Luyện ôn tập thẻ ngay
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {[
              { id: 'all', label: 'Mọi ngôn ngữ' },
              { id: 'en', label: 'Tiếng Anh' },
              { id: 'zh', label: 'Tiếng Trung' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLangFilter(t.id as 'all' | LearningLanguage)}
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

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="favorite">★ Từ yêu thích</option>
            <option value="unlearned">Chưa học</option>
            <option value="learning">Đang học</option>
            <option value="remembered">Đã nhớ</option>
            <option value="needs_review">Cần ôn lại</option>
          </select>
        </div>

        <div className="relative flex-1 lg:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm từ, chữ Hán, Pinyin, IPA, nghĩa..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Layers className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-base font-semibold text-slate-800">
            {flashcards.length === 0
              ? 'Kho từ vựng của bạn đang trống'
              : 'Không có flashcard nào khớp với tìm kiếm'}
          </p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Mỗi khi bạn tạo bài học từ bản dịch Google Dịch, từ mới sẽ được lưu vào đây và từ cũ sẽ tự động được bổ sung thêm nghĩa và câu ví dụ mới.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredCards.map((fc) => {
            const prog = reviewProgressMap.get(fc.id);
            const effectiveState = getEffectiveReviewState(prog);
            const speakKey = `card_${fc.id}`;

            return (
              <div
                key={fc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top Row: Headword + Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2.5">
                        <h2 className="text-xl font-bold text-slate-900 font-display">
                          {formatHeadword(fc)}
                        </h2>
                        <span className="text-sm font-mono text-sky-700">
                          {fc.learningLang === 'zh' ? fc.pinyin : fc.ipa}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fc.learningLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'} ·{' '}
                        {fc.partOfSpeech || 'Từ vựng'} · {STATE_LABELS[effectiveState]} · Gặp{' '}
                        <span className="font-mono tabular-nums">{fc.encounterCount}</span> lần
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSpeak(fc.word, fc.learningLang, speakKey)}
                        className={`p-2 rounded-lg border transition-colors ${
                          speakingId === speakKey
                            ? 'bg-sky-700 text-white border-sky-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Nghe phát âm"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
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
                        onClick={() => openEditModal(fc)}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                        title="Chỉnh sửa thẻ"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Meanings List (Polysemy consolidated in 1 card) */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">
                      Nghĩa tiếng Việt ({fc.meanings.length}):
                    </p>
                    <ul className="space-y-1">
                      {fc.meanings.map((m, idx) => (
                        <li key={`${fc.id}_m_${idx}`} className="text-sm font-medium text-slate-900">
                          {fc.meanings.length > 1 ? `${idx + 1}. ${m}` : m}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {fc.homonymNote && (
                    <p className="text-xs text-amber-800 bg-amber-50/70 border border-amber-200/80 rounded-lg px-3 py-2">
                      Phân biệt đồng âm / chữ Hán: {fc.homonymNote}
                    </p>
                  )}

                  {/* Contextual Examples */}
                  {fc.examples.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Ví dụ theo ngữ cảnh ({fc.examples.length}):
                      </p>
                      {fc.examples.slice(0, 2).map((ex, idx) => (
                        <div key={`${fc.id}_ex_${idx}`} className="text-xs space-y-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-800">{ex.target}</p>
                            <button
                              type="button"
                              onClick={() =>
                                handleSpeak(
                                  ex.target,
                                  fc.learningLang,
                                  `${fc.id}_ex_audio_${idx}`
                                )
                              }
                              className="text-sky-700 hover:text-sky-900 shrink-0"
                              title="Nghe câu ví dụ"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {ex.pronunciation && (
                            <p className="font-mono text-sky-700">{ex.pronunciation}</p>
                          )}
                          <p className="text-slate-600">{ex.vietnamese}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Related Word Forms / Compounds */}
                  {fc.relatedForms.length > 0 && (
                    <p className="text-xs text-slate-500 pt-1">
                      <span className="font-semibold text-slate-700">
                        {fc.learningLang === 'zh' ? 'Từ ghép liên quan: ' : 'Gia đình từ: '}
                      </span>
                      {fc.relatedForms.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Footer Canonical Key & Delete */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="font-mono truncate" title={`Khóa chuẩn hóa: ${fc.canonicalKey}`}>
                     gốc: {fc.lemma} · ngữ cảnh: {fc.contexts.join(', ') || 'Chung'}
                  </span>

                  {confirmDeleteId === fc.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDelete(fc)}
                        className="text-xs font-semibold text-rose-700 hover:underline"
                      >
                        Xóa vĩnh viễn
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(fc.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                      title="Xóa flashcard"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Flashcard Modal */}
      {editingCard && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 font-display">
                Chỉnh sửa Flashcard
              </h2>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {editingCard.learningLang === 'zh' ? 'Chữ Hán giản thể' : 'Từ vựng tiếng Anh'}
                  </label>
                  <input
                    type="text"
                    value={editWord}
                    onChange={(e) => setEditWord(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                {editingCard.learningLang === 'zh' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Chữ Hán phồn thể
                    </label>
                    <input
                      type="text"
                      value={editTraditional}
                      onChange={(e) => setEditTraditional(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Phiên âm IPA</label>
                    <input
                      type="text"
                      value={editIpa}
                      onChange={(e) => setEditIpa(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editingCard.learningLang === 'zh' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Pinyin (có dấu thanh điệu)
                    </label>
                    <input
                      type="text"
                      value={editPinyin}
                      onChange={(e) => setEditPinyin(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Từ loại</label>
                  <input
                    type="text"
                    value={editPos}
                    onChange={(e) => setEditPos(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Các nghĩa tiếng Việt (mỗi dòng 1 nghĩa)
                </label>
                <textarea
                  rows={3}
                  value={editMeaningsText}
                  onChange={(e) => setEditMeaningsText(e.target.value)}
                  required
                  className="w-full p-3 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Ghi chú phân biệt từ đồng âm (nếu có)
                </label>
                <input
                  type="text"
                  value={editHomonym}
                  onChange={(e) => setEditHomonym(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Câu ví dụ</label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditExamples((prev) => [
                        ...prev,
                        { target: '', pronunciation: '', vietnamese: '', contextTopic: 'Tự thêm' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm ví dụ
                  </button>
                </div>

                {editExamples.map((ex, i) => (
                  <div key={`edit_ex_${i}`} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <input
                      type="text"
                      value={ex.target}
                      onChange={(e) => {
                        const copy = [...editExamples];
                        copy[i] = { ...copy[i], target: e.target.value };
                        setEditExamples(copy);
                      }}
                      placeholder="Câu ví dụ ngoại ngữ"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                    <input
                      type="text"
                      value={ex.pronunciation}
                      onChange={(e) => {
                        const copy = [...editExamples];
                        copy[i] = { ...copy[i], pronunciation: e.target.value };
                        setEditExamples(copy);
                      }}
                      placeholder="Pinyin / Phiên âm câu ví dụ"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                    />
                    <input
                      type="text"
                      value={ex.vietnamese}
                      onChange={(e) => {
                        const copy = [...editExamples];
                        copy[i] = { ...copy[i], vietnamese: e.target.value };
                        setEditExamples(copy);
                      }}
                      placeholder="Nghĩa tiếng Việt của câu"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Các dạng từ liên quan / Từ ghép (mỗi dòng 1 mục)
                </label>
                <textarea
                  rows={2}
                  value={editRelatedText}
                  onChange={(e) => setEditRelatedText(e.target.value)}
                  className="w-full p-2.5 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCard(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg"
                >
                  {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
