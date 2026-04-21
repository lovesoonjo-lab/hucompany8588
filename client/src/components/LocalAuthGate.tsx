import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface LocalAuthGateProps {
  children: ReactNode;
}

const LOCAL_AUTH_KEY = 'local-auth-session';
const LOCAL_AUTH_ID = 'hucompany8588@gmail.com';
const LOCAL_AUTH_PASSWORD = 'govlgkdntm2908!';
const SAVED_ID_KEY = 'local-auth-saved-id';
const AUTO_LOGIN_KEY = 'local-auth-auto-login';
const LOCAL_AUTH_PASSWORD_KEY = 'local-auth-password';
const PASSWORD_RESET_ANSWER = '홍은찬엄유진홍지우';
const LOGIN_IMAGE_URL = '/images/login-family.png';

export function clearLocalAuthSession() {
  localStorage.removeItem(LOCAL_AUTH_KEY);
  localStorage.removeItem(AUTO_LOGIN_KEY);
  window.dispatchEvent(new CustomEvent('local-auth-changed'));
}

function getLocalAuthSession(): boolean {
  try {
    return localStorage.getItem(LOCAL_AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

/** 스튜디오 앱 로컬 로그인 여부 (프로젝트 관리 등에서 서버 세션과 함께 사용) */
export function isLocalAuthSession(): boolean {
  return getLocalAuthSession();
}

export default function LocalAuthGate({ children }: LocalAuthGateProps) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => getLocalAuthSession());
  const [id, setId] = useState(() => localStorage.getItem(SAVED_ID_KEY) ?? '');
  const [loginPassword, setLoginPassword] = useState(
    () => localStorage.getItem(LOCAL_AUTH_PASSWORD_KEY) ?? LOCAL_AUTH_PASSWORD
  );
  const [password, setPassword] = useState('');
  const [rememberId, setRememberId] = useState(() => Boolean(localStorage.getItem(SAVED_ID_KEY)));
  const [autoLogin, setAutoLogin] = useState(() => localStorage.getItem(AUTO_LOGIN_KEY) === '1');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<'verify' | 'reset'>('verify');
  const [resetAnswer, setResetAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const sync = () => setIsLoggedIn(getLocalAuthSession());
    window.addEventListener('local-auth-changed', sync);
    return () => window.removeEventListener('local-auth-changed', sync);
  }, []);

  useEffect(() => {
    if (!autoLogin) return;
    if (id !== LOCAL_AUTH_ID) return;
    localStorage.setItem(LOCAL_AUTH_KEY, '1');
    window.dispatchEvent(new CustomEvent('local-auth-changed'));
  }, [autoLogin, id]);

  const canSubmit = useMemo(() => id.trim().length > 0 && password.length > 0, [id, password]);

  const handleLogin = () => {
    if (id.trim() !== LOCAL_AUTH_ID || password !== loginPassword) {
      toast.error('아이디 또는 비밀번호가 올바르지 않습니다.');
      return;
    }

    if (rememberId) {
      localStorage.setItem(SAVED_ID_KEY, id.trim());
    } else {
      localStorage.removeItem(SAVED_ID_KEY);
    }
    if (autoLogin) {
      localStorage.setItem(AUTO_LOGIN_KEY, '1');
    } else {
      localStorage.removeItem(AUTO_LOGIN_KEY);
    }

    localStorage.setItem(LOCAL_AUTH_KEY, '1');
    window.dispatchEvent(new CustomEvent('local-auth-changed'));
    toast.success('로그인되었습니다.');
  };

  const openResetModal = () => {
    setIsResetOpen(true);
    setResetStep('verify');
    setResetAnswer('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const closeResetModal = () => {
    setIsResetOpen(false);
    setResetStep('verify');
    setResetAnswer('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleVerifyResetAnswer = () => {
    if (resetAnswer.trim() !== PASSWORD_RESET_ANSWER) {
      toast.error('확인 문구가 올바르지 않습니다.');
      return;
    }
    setResetStep('reset');
    toast.success('확인되었습니다. 새 비밀번호를 입력해주세요.');
  };

  const handleResetPassword = () => {
    const nextPassword = newPassword.trim();
    if (!nextPassword) {
      toast.error('새 비밀번호를 입력해주세요.');
      return;
    }
    if (nextPassword.length < 4) {
      toast.error('비밀번호는 4자 이상 입력해주세요.');
      return;
    }
    if (nextPassword !== confirmPassword.trim()) {
      toast.error('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    if (nextPassword === loginPassword) {
      toast.error('이전 비밀번호와 동일합니다. 다른 비밀번호를 입력해주세요.');
      return;
    }

    localStorage.setItem(LOCAL_AUTH_PASSWORD_KEY, nextPassword);
    setLoginPassword(nextPassword);
    setPassword('');
    closeResetModal();
    toast.success('비밀번호가 변경되었습니다.');
  };

  if (isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#c8cdd8' }}>
      <div className="w-full max-w-md space-y-3">
        <div className="flex flex-col items-center">
          <img src={LOGIN_IMAGE_URL} alt="HUCOMPANY" className="w-[28rem] h-[28rem] object-contain" />
          <h2 className="text-2xl font-bold -mt-2 text-black">HUCOMPANY AI 프로그램</h2>
        </div>
        <div className="rounded-xl border border-slate-300 p-4 space-y-3 shadow-xl bg-white">
          <div className="space-y-2">
            <label className="text-xs text-slate-600">아이디</label>
            <Input
              id="local-login-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="아이디"
              className="!bg-white !text-black placeholder:!text-slate-600 border-slate-300"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-600">암호</label>
            <Input
              id="local-login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="암호"
              className="!bg-white !text-black placeholder:!text-slate-600 border-slate-300"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) handleLogin();
              }}
            />
          </div>
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleLogin} disabled={!canSubmit}>
            로그인
          </Button>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberId}
                onChange={(e) => setRememberId(e.target.checked)}
              />
              아이디 저장
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLogin}
                onChange={(e) => setAutoLogin(e.target.checked)}
              />
              자동 로그인
            </label>
            <button
              type="button"
              onClick={openResetModal}
              className="hover:text-slate-900"
            >
              비밀번호 찾기
            </button>
          </div>
        </div>
        <p className="text-sm font-semibold text-center text-black">© 2026 HUCOMPANY AI 프로그램 연구 전용 버전.</p>
      </div>
      {isResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-300 bg-white p-4 shadow-2xl space-y-3">
            <h3 className="text-base font-bold text-black">
              {resetStep === 'verify' ? '비밀번호 찾기' : '비밀번호 재생성'}
            </h3>

            {resetStep === 'verify' ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">정해놓은 확인 문구를 입력해주세요.</p>
                <Input
                  value={resetAnswer}
                  onChange={(e) => setResetAnswer(e.target.value)}
                  placeholder="확인 문구 입력"
                  className="!bg-white !text-black placeholder:!text-slate-500 border-slate-300"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyResetAnswer();
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">새 비밀번호</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="새 비밀번호"
                    className="!bg-white !text-black placeholder:!text-slate-500 border-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">새 비밀번호 확인</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="새 비밀번호 확인"
                    className="!bg-white !text-black placeholder:!text-slate-500 border-slate-300"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleResetPassword();
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={closeResetModal}>
                취소
              </Button>
              {resetStep === 'verify' ? (
                <Button type="button" onClick={handleVerifyResetAnswer}>
                  확인
                </Button>
              ) : (
                <Button type="button" onClick={handleResetPassword}>
                  비밀번호 변경
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

