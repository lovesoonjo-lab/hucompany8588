import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/lib/store';
import { validateGeminiKey, validateGcsSettings } from '@/lib/api';
import { trpc } from '@/lib/trpc';
import {
  Eye, EyeOff, Check, Loader2, Key, Brain, ImageIcon,
  Mic, Cloud, Film, RotateCcw, ChevronDown, ChevronUp, FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function ApiKeySection({
  icon: Icon,
  iconColor,
  title,
  description,
  value,
  onChange,
  placeholder,
  onSave,
  saveLabel,
  saveBtnClass,
  isValidating,
  validateLabel,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSave: () => void;
  saveLabel: string;
  saveBtnClass?: string;
  isValidating?: boolean;
  validateLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
      <div className="flex items-center gap-2">
        <Icon className={cn('w-4 h-4', iconColor)} />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <Button
        onClick={onSave}
        disabled={isValidating}
        size="sm"
        className={cn('w-full', saveBtnClass || 'bg-primary hover:bg-primary/90')}
      >
        {isValidating ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {validateLabel || '검증 중...'}</>
        ) : (
          <><Check className="w-4 h-4 mr-2" /> {saveLabel}</>
        )}
      </Button>
    </div>
  );
}

function CollapsibleSection({
  icon: Icon,
  iconColor,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', iconColor)} />
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-4 bg-secondary/10">{children}</div>}
    </div>
  );
}

export default function SettingsModal() {
  const { settings, setSettings, setGcsSettings, isSettingsOpen, setSettingsOpen, resetAllSettings } = useAppStore();
  const [isValidating, setIsValidating] = useState(false);
  const [isValidatingKie, setIsValidatingKie] = useState(false);
  const [isValidatingSupertone, setIsValidatingSupertone] = useState(false);
  const [isValidatingGcs, setIsValidatingGcs] = useState(false);
  const [tempGeminiKey, setTempGeminiKey] = useState(settings.geminiApiKey);
  const [tempKieKey, setTempKieKey] = useState(settings.kieApiKey);
  const [tempSupertoneKey, setTempSupertoneKey] = useState(settings.supertoneApiKey);

  // 서버 프록시를 통한 API 키 검증 mutations
  const validateSupertoneMut = trpc.validateApiKey.supertone.useMutation();
  const validateKieMut = trpc.validateApiKey.kie.useMutation();

  // 모달이 열릴 때마다 저장된 설정값으로 temp 상태 동기화
  useEffect(() => {
    if (isSettingsOpen) {
      setTempGeminiKey(settings.geminiApiKey);
      setTempKieKey(settings.kieApiKey);
      setTempSupertoneKey(settings.supertoneApiKey);
    }
  }, [isSettingsOpen, settings.geminiApiKey, settings.kieApiKey, settings.supertoneApiKey]);

  const handleValidateGemini = async () => {
    if (!tempGeminiKey.trim()) {
      toast.error('API 키를 입력해주세요.');
      return;
    }
    setIsValidating(true);
    try {
      const valid = await validateGeminiKey(tempGeminiKey);
      if (valid) {
        setSettings({ geminiApiKey: tempGeminiKey });
        toast.success('API 키가 유효합니다. 저장되었습니다.');
      } else {
        toast.error('API 키가 올바르지 않습니다. 다시 확인해주세요.');
      }
    } catch {
      toast.error('API 키 검증 중 오류가 발생했습니다.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleValidateKie = async () => {
    if (!tempKieKey.trim()) {
      toast.error('API 키를 입력해주세요.');
      return;
    }
    setIsValidatingKie(true);
    try {
      const result = await validateKieMut.mutateAsync({ apiKey: tempKieKey });
      if (result.valid) {
        setSettings({ kieApiKey: tempKieKey });
        toast.success('Kie AI API 키가 유효합니다. 저장되었습니다.');
      } else {
        toast.error(result.error || 'Kie AI API 키 검증 실패');
      }
    } catch (e: any) {
      toast.error(e.message || 'Kie AI API 키 검증 중 오류가 발생했습니다.');
    } finally {
      setIsValidatingKie(false);
    }
  };

  const handleValidateSupertone = async () => {
    if (!tempSupertoneKey.trim()) {
      toast.error('API 키를 입력해주세요.');
      return;
    }
    setIsValidatingSupertone(true);
    try {
      const result = await validateSupertoneMut.mutateAsync({ apiKey: tempSupertoneKey });
      if (result.valid) {
        setSettings({ supertoneApiKey: tempSupertoneKey });
        toast.success('Supertone TTS API 키가 유효합니다. 저장되었습니다.');
      } else {
        toast.error(result.error || 'Supertone API 키 검증 실패');
      }
    } catch (e: any) {
      toast.error(e.message || 'Supertone API 키 검증 중 오류가 발생했습니다.');
    } finally {
      setIsValidatingSupertone(false);
    }
  };

  const handleValidateGcs = async () => {
    const result = validateGcsSettings(settings.gcs);
    if (!result.valid) {
      toast.error(result.error || 'GCS 설정이 올바르지 않습니다.');
      return;
    }
    setIsValidatingGcs(true);
    await new Promise((r) => setTimeout(r, 600));
    setIsValidatingGcs(false);
    toast.success('GCS 설정이 저장되었습니다.');
  };

  const handleResetAll = () => {
    if (window.confirm('모든 설정과 프로젝트 데이터가 초기화됩니다. 계속하시겠습니까?')) {
      resetAllSettings();
      setTempGeminiKey('');
      setTempKieKey('');
      setTempSupertoneKey('');
      toast.success('모든 설정이 초기화되었습니다.');
      setSettingsOpen(false);
    }
  };

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            설정
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* ===== AI API Keys ===== */}
          <CollapsibleSection icon={Brain} iconColor="text-primary" title="AI API 키 설정" defaultOpen={true}>
            <ApiKeySection
              icon={Brain}
              iconColor="text-primary"
              title="AI 텍스트 분석 (Gemini)"
              description="대본 분리, SEO 분석, 장면 분석에 사용됩니다. Google AI Studio에서 발급받으세요."
              value={tempGeminiKey}
              onChange={setTempGeminiKey}
              placeholder="Gemini API 키를 입력하세요"
              onSave={handleValidateGemini}
              saveLabel="저장 및 검증"
              isValidating={isValidating}
              validateLabel="검증 중..."
              saveBtnClass="bg-primary hover:bg-primary/90 text-white"
            />

            <ApiKeySection
              icon={ImageIcon}
              iconColor="text-chart-4"
              title="Kie AI API 키"
              description="이미지 생성 및 AI 동영상 변환에 사용됩니다. kie.ai에서 발급받으세요."
              value={tempKieKey}
              onChange={setTempKieKey}
              placeholder="Kie AI API 키를 입력하세요"
              onSave={handleValidateKie}
              saveLabel="저장 및 검증"
              isValidating={isValidatingKie}
              validateLabel="검증 중..."
              saveBtnClass="bg-chart-4 hover:bg-chart-4/90 text-white"
            />

            <ApiKeySection
              icon={Mic}
              iconColor="text-emerald-400"
              title="Supertone TTS API 키"
              description="음성(TTS) 생성에 사용됩니다. Supertone에서 발급받으세요."
              value={tempSupertoneKey}
              onChange={setTempSupertoneKey}
              placeholder="Supertone API 키를 입력하세요"
              onSave={handleValidateSupertone}
              saveLabel="저장 및 검증"
              isValidating={isValidatingSupertone}
              validateLabel="검증 중..."
              saveBtnClass="bg-emerald-600 hover:bg-emerald-700 text-white"
            />
          </CollapsibleSection>

          {/* ===== GCS Settings ===== */}
          <CollapsibleSection icon={Cloud} iconColor="text-sky-400" title="Google Cloud Storage (GCS) 설정">
            <p className="text-xs text-muted-foreground mb-3">
              생성된 파일을 GCS에 자동 업로드합니다. 폴더 구조: reference/, scripts/, audio/, subtitles/, images/, videos/, final/
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Project ID</label>
                <input
                  type="text"
                  value={settings.gcs.projectId}
                  onChange={(e) => setGcsSettings({ projectId: e.target.value })}
                  placeholder="my-gcp-project"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bucket Name</label>
                <input
                  type="text"
                  value={settings.gcs.bucketName}
                  onChange={(e) => setGcsSettings({ bucketName: e.target.value })}
                  placeholder="my-bucket-name"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
                  Service Account Email
                </label>
                <input
                  type="text"
                  value={settings.gcs.clientEmail}
                  onChange={(e) => setGcsSettings({ clientEmail: e.target.value })}
                  placeholder="xxx@xxx.iam.gserviceaccount.com"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" /> Private Key (JSON)
                </label>
                <textarea
                  value={settings.gcs.privateKey}
                  onChange={(e) => setGcsSettings({ privateKey: e.target.value })}
                  placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                  rows={4}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs resize-none"
                />
              </div>
              <Button
                onClick={handleValidateGcs}
                disabled={isValidatingGcs}
                size="sm"
                className="w-full bg-sky-600 hover:bg-sky-700 text-white"
              >
                {isValidatingGcs ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 검증 중...</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" /> 저장 및 검증</>
                )}
              </Button>
            </div>
          </CollapsibleSection>

          {/* ===== Frame Rate ===== */}
          <CollapsibleSection icon={Film} iconColor="text-amber-400" title="영상 설정">
            <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-sm">프레임레이트</h3>
              </div>
              <Select
                value={String(settings.frameRate)}
                onValueChange={(value) => setSettings({ frameRate: value as '24' | '30' | '60' })}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="24">24 fps (영화)</SelectItem>
                  <SelectItem value="30">30 fps (표준)</SelectItem>
                  <SelectItem value="60">60 fps (고화질)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CollapsibleSection>

          {/* ===== Reset ===== */}
          <div className="pt-2 border-t border-border">
            <Button
              onClick={handleResetAll}
              variant="outline"
              size="sm"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              모든 설정 초기화
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
