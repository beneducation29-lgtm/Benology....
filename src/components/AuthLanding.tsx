import React, { useState } from 'react';
import { BookOpen, Layers, Mic, Repeat, LogIn, AlertCircle } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';
import heroWorkspaceImg from '../assets/images/hero_language_workspace_1793681139557.jpg';

export function AuthLanding() {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đăng nhập lúc này.';
      if (!msg.includes('popup-closed-by-user')) {
        setError('Đăng nhập chưa hoàn tất. Vui lòng thử lại và cho phép cửa sổ đăng nhập Google.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Clean 3-zone Top Bar Contract */}
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            Smart Translation Learning
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#quy-trinh" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Quy trình học
            </a>
            <a href="#flashcard" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Flashcard chuẩn hóa
            </a>
            <a href="#shadowing" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Luyện nói Shadowing
            </a>
            <a href="#on-tap" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Ôn tập ngắt quãng
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleLogin}
              disabled={signingIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4" />
              {signingIn ? 'Đang kết nối...' : 'Đăng nhập Google'}
            </button>
          </div>
        </div>
      </header>

      {/* Balanced 2-Column Hero Split */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-16 space-y-16">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-semibold text-sky-700 tracking-wide">
              Học tiếng Anh & tiếng Trung từ nhu cầu thực tế
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold text-slate-900 leading-[1.15] font-display max-w-xl">
              Biến mọi nội dung bạn tra trên Google Dịch thành bài học có hệ thống
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Thay vì dịch xong rồi quên, hệ thống tự động giữ nguyên bản dịch gốc của bạn, phân tích ngữ pháp tiếng Việt dễ hiểu, tạo flashcard không trùng lặp và lên lịch ôn tập thông minh mỗi ngày.
            </p>

            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleLogin}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                {signingIn ? 'Đang xác thực tài khoản...' : 'Bắt đầu học với tài khoản Google'}
              </button>
              <span className="text-xs text-slate-500">
                Dữ liệu cá nhân đồng bộ thời gian thực & bảo mật riêng tư
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
              {!imgFailed ? (
                <img
                  src={heroWorkspaceImg}
                  alt="Không gian học ngoại ngữ với sổ tay ghi chú phiên âm tiếng Anh và chữ Hán"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full min-h-[280px] bg-gradient-to-br from-slate-100 to-sky-50 flex flex-col items-center justify-center p-8 text-center">
                  <BookOpen className="w-10 h-10 text-sky-700 mb-3" />
                  <p className="text-sm font-semibold text-slate-800">
                    Không gian học tập song ngữ Việt – Anh – Trung
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Full-Width 4-Column Feature Row Below Hero */}
        <section id="quy-trinh" className="pt-8 border-t border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <BookOpen className="w-5 h-5 text-sky-700" />
              <h2 className="text-base font-semibold text-slate-900 font-display">
                01. Bài học theo chủ đề
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                AI phân tích câu dịch, giải thích cấu trúc ngữ pháp bằng tiếng Việt và tự động gộp vào bài học cùng chủ đề.
              </p>
            </div>

            <div id="flashcard" className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <Layers className="w-5 h-5 text-sky-700" />
              <h2 className="text-base font-semibold text-slate-900 font-display">
                02. Flashcard không trùng lặp
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Nhận diện từ gốc (lemma), gộp nhiều nghĩa vào một thẻ duy nhất, phân biệt từ đồng âm và chữ giản thể/phồn thể.
              </p>
            </div>

            <div id="shadowing" className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <Mic className="w-5 h-5 text-sky-700" />
              <h2 className="text-base font-semibold text-slate-900 font-display">
                03. Luyện nói Shadowing
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Nghe từng câu hoặc cả đoạn với IPA & Pinyin có dấu thanh điệu, tùy chỉnh tốc độ, lặp câu và thu âm đối chiếu.
              </p>
            </div>

            <div id="on-tap" className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <Repeat className="w-5 h-5 text-sky-700" />
              <h2 className="text-base font-semibold text-slate-900 font-display">
                04. Ôn tập ngắt quãng
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Tự động tính chu kỳ lặp lại theo 4 mức tự đánh giá (Quên, Khó, Đã nhớ, Rất dễ) và theo dõi chuỗi ngày học.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>Smart Translation Learning · Hệ thống học ngoại ngữ cá nhân hóa từ bản dịch</span>
          <span>Tiếng Việt · English · 中文</span>
        </div>
      </footer>
    </div>
  );
}
