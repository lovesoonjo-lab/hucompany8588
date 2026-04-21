import { useAppStore, type SceneSlot } from '@/lib/store';
import { callGemini, PROMPTS } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Mic, Play, Download, Loader2, Type, AlignLeft,
  Palette, Sparkles, Users, Volume2,
  Paintbrush, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface Step5AudioProps {
  tabId: string;
}

interface CharacterInfo {
  role: string;
  description: string;
  voiceId: string;
}

const FONT_OPTIONS = [
  'Pretendard', 'Noto Sans KR', 'Nanum Gothic', 'Nanum Myeongjo',
  'Black Han Sans', 'Do Hyeon', 'Jua', 'Gothic A1',
];

const COLOR_PRESETS = [
  { label: '흰색', value: '#FFFFFF' },
  { label: '노란색', value: '#FFD700' },
  { label: '하늘색', value: '#87CEEB' },
  { label: '연두색', value: '#90EE90' },
  { label: '분홍색', value: '#FFB6C1' },
  { label: '주황색', value: '#FFA500' },
  { label: '검정', value: '#000000' },
];

const BG_PRESETS = [
  { label: '없음', value: 'none' },
  { label: '반투명 검정', value: 'rgba(0,0,0,0.5)' },
  { label: '반투명 흰색', value: 'rgba(255,255,255,0.3)' },
  { label: '진한 검정', value: 'rgba(0,0,0,0.8)' },
  { label: '반투명 파랑', value: 'rgba(0,0,100,0.5)' },
];

// 영어 카테고리 → 한국어 번역 맵
const CATEGORY_KO: Record<string, string> = {
  acting: '연기',
  advertisement: '광고',
  announcement: '안내방송',
  audiobook: '오디오북',
  business: '비즈니스',
  conversational: '대화',
  documentary: '다큐멘터리',
  education: '교육',
  entertainment: '엔터테인먼트',
  game: '게임',
  horror: '공포',
  humor: '유머',
  meme: '밈',
  narration: '나레이션',
  news: '뉴스',
  office: '사무',
  parody: '패러디',
  review: '리뷰',
  'short-form': '숏폼',
  storytelling: '스토리텔링',
};

function translateCategory(cat: string): string {
  return CATEGORY_KO[cat.toLowerCase()] || cat;
}

// TTS 스크립트의 언어를 자동 감지하는 헬퍼 함수
function detectLanguage(text: string): 'ko' | 'en' | 'ja' {
  // 한국어 문자가 30% 이상이면 한국어
  const koChars = (text.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
  // 일본어 문자 (히라가나/카타카나)
  const jaChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en';
  if (koChars / totalChars > 0.3) return 'ko';
  if (jaChars / totalChars > 0.3) return 'ja';
  return 'en';
}

function hasKoreanText(text: string): boolean {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

// 장면의 유효한 voiceId를 결정하는 헬퍼 함수
function getEffectiveVoiceId(scene: SceneSlot, characters: { role: string; voiceId: string }[], defaultVoiceId: string | null): string | null {
  // 장면에 직접 설정된 유효한 voiceId가 있으면 사용
  if (scene.voiceId && scene.voiceId !== 'default') return scene.voiceId;
  // 캐릭터 매핑에서 나레이터의 voiceId 사용
  const narrator = characters.find(c => c.role === '나레이터');
  if (narrator && narrator.voiceId && narrator.voiceId !== 'default') return narrator.voiceId;
  // 캐릭터 중 유효한 voiceId가 있는 첫 번째 것 사용
  const anyValid = characters.find(c => c.voiceId && c.voiceId !== 'default');
  if (anyValid) return anyValid.voiceId;
  // 기본 voiceId 사용
  return defaultVoiceId;
}

export default function Step5Audio({ tabId }: Step5AudioProps) {
  const { tabs, updateScene, updateTab, settings } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const { isAuthenticated } = useAuth();
  const [characters, setCharacters] = useState<CharacterInfo[]>([
    { role: '나레이터', description: '차분하고 전문적인 해설 목소리', voiceId: 'default' },
  ]);
  const [isAnalyzingCharacters, setIsAnalyzingCharacters] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // 자막 설정 state (제어 컴포넌트)
  const [subtitleFont, setSubtitleFont] = useState('Pretendard');
  const [subtitleSize, setSubtitleSize] = useState(48);
  const [subtitleLines, setSubtitleLines] = useState(2);
  const [subtitlePosition, setSubtitlePosition] = useState(90);
  const [subtitleColor, setSubtitleColor] = useState('#FFFFFF');
  const [subtitleBgColor, setSubtitleBgColor] = useState('none');
  const [bgOpacity, setBgOpacity] = useState(50);
  const [customBgColor, setCustomBgColor] = useState('#000000');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('');
  const [voiceCategoryFilter, setVoiceCategoryFilter] = useState<string>('all');
  const [voiceSelectTarget, setVoiceSelectTarget] = useState<{ type: 'character'; index: number } | { type: 'scene'; sceneId: number } | null>(null);
  const [ttsLanguageMode, setTtsLanguageMode] = useState<'auto' | 'ko' | 'en' | 'ja'>('auto');
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [detailTtsScript, setDetailTtsScript] = useState('');
  const [detailSubtitles, setDetailSubtitles] = useState<string[]>([]);
  const [detailNarrationKo, setDetailNarrationKo] = useState('');
  const [detailSubtitleKo, setDetailSubtitleKo] = useState('');
  const [isTranslatingDetailKo, setIsTranslatingDetailKo] = useState(false);

  // Supertone 음성 목록 조회
  const voicesQuery = trpc.supertone.getVoices.useQuery(
    { apiKey: settings.supertoneApiKey },
    { enabled: !!settings.supertoneApiKey, staleTime: 5 * 60 * 1000 }
  );

  // TTS 생성 mutation
  const generateTTSMutation = trpc.supertone.generateTTS.useMutation();

  // 음성 카테고리 목록 (동적 생성)
  const voiceCategories = useMemo(() => {
    if (!voicesQuery.data || voicesQuery.data.length === 0) return [];
    const cats = new Set<string>();
    voicesQuery.data.forEach((v: any) => {
      if (v.use_case) cats.add(v.use_case);
      if (v.use_cases) v.use_cases.forEach((uc: string) => cats.add(uc));
    });
    return Array.from(cats).sort();
  }, [voicesQuery.data]);

  // 필터링된 음성 목록
  const filteredVoices = useMemo(() => {
    if (!voicesQuery.data || voicesQuery.data.length === 0) return [];
    let voices = voicesQuery.data;

    // 카테고리 필터
    if (voiceCategoryFilter !== 'all') {
      voices = voices.filter((v: any) => {
        if (v.use_case === voiceCategoryFilter) return true;
        if (v.use_cases && v.use_cases.includes(voiceCategoryFilter)) return true;
        return false;
      });
    }

    // 검색 필터
    if (voiceSearchQuery.trim()) {
      const q = voiceSearchQuery.toLowerCase();
      voices = voices.filter((v: any) =>
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.description && v.description.toLowerCase().includes(q))
      );
    }

    return voices;
  }, [voicesQuery.data, voiceCategoryFilter, voiceSearchQuery]);

  // 음성 옵션 (Select 드롭다운용)
  const voiceOptions = useMemo(() => {
    if (voicesQuery.data && voicesQuery.data.length > 0) {
      return voicesQuery.data.map((v: any) => ({
        value: v.voice_id || v.id,
        label: `${v.name}${v.gender ? ` (${v.gender})` : ''}`,
      }));
    }
    return [
      { value: 'default', label: '기본 음성 (API 키 필요)' },
    ];
  }, [voicesQuery.data]);

  // 자막 설정이 변경될 때 모든 장면에 적용
  const applySubtitleSettingsToAllScenes = useCallback(() => {
    tab.scenes.forEach((scene) => {
      updateScene(tabId, scene.id, {
        subtitleFont,
        subtitleSize,
        subtitleLines,
        subtitlePosition,
        subtitleColor,
        subtitleBg: subtitleBgColor,
      });
    });
  }, [tabId, tab.scenes, subtitleFont, subtitleSize, subtitleLines, subtitlePosition, subtitleColor, subtitleBgColor, updateScene]);

  // 자막 설정 변경 시 자동 적용
  useEffect(() => {
    if (tab.scenes.length > 0) {
      applySubtitleSettingsToAllScenes();
    }
  }, [subtitleFont, subtitleSize, subtitleLines, subtitlePosition, subtitleColor, subtitleBgColor]);

  // 배경색 계산
  const computedBgColor = useMemo(() => {
    if (subtitleBgColor === 'none') return 'transparent';
    if (subtitleBgColor.startsWith('rgba')) return subtitleBgColor;
    // 커스텀 색상 + 투명도
    const hex = customBgColor;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${bgOpacity / 100})`;
  }, [subtitleBgColor, customBgColor, bgOpacity]);

  // 음성 선택 핸들러
  const handleVoiceSelect = (voiceId: string) => {
    if (!voiceSelectTarget) return;
    if (voiceSelectTarget.type === 'character') {
      const updated = [...characters];
      updated[voiceSelectTarget.index] = { ...updated[voiceSelectTarget.index], voiceId };
      setCharacters(updated);
    } else {
      updateScene(tabId, voiceSelectTarget.sceneId, { voiceId });
    }
    setShowVoiceModal(false);
    setVoiceSelectTarget(null);
  };

  // AI 캐릭터 분석
  const handleAnalyzeCharacters = async () => {
    if (!tab.script) {
      toast.error('먼저 대본을 입력해주세요.');
      return;
    }
    setIsAnalyzingCharacters(true);
    try {
      const systemPrompt = `당신은 영상 대본 분석 전문가입니다.
주어진 대본에서 등장하는 화자(캐릭터)를 분석해주세요.
나레이터(해설자)는 항상 포함합니다.
대본에서 직접 발화하는 캐릭터가 있으면 추가로 포함합니다.
반드시 아래 JSON 형식으로만 응답하세요:
{"characters": [{"role": "나레이터", "description": "차분하고 전문적인 해설 목소리"}, {"role": "캐릭터명", "description": "해당 캐릭터의 목소리 특성 설명"}]}`;

      const result = await callGemini(
        settings.geminiApiKey, systemPrompt,
        `대본:\n${tab.script}`,
        ''
      );

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON 파싱 실패');

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.characters && Array.isArray(parsed.characters)) {
        const newCharacters: CharacterInfo[] = parsed.characters.map((c: any) => ({
          role: c.role,
          description: c.description,
          voiceId: 'default',
        }));
        setCharacters(newCharacters);
        toast.success(`${newCharacters.length}명의 캐릭터가 분석되었습니다.`);
      }
    } catch (err: any) {
      toast.error(`캐릭터 분석 실패: ${err.message}`);
    } finally {
      setIsAnalyzingCharacters(false);
    }
  };

  // 개별 TTS 생성
  const handleGenerateAudio = async (sceneId: number) => {
    const scene = tab.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다. 먼저 로그인해주세요.');
      return;
    }
    if (!settings.supertoneApiKey) {
      toast.error('설정에서 Supertone TTS API 키를 먼저 입력해주세요.');
      return;
    }
    if (!scene.ttsScript) {
      toast.error('TTS 스크립트가 비어있습니다.');
      return;
    }

    // 유효한 voiceId 확인
    const effectiveVoiceId = getEffectiveVoiceId(scene, characters, null);
    if (!effectiveVoiceId) {
      toast.error('음성을 먼저 선택해주세요. 캐릭터 음성 매핑에서 음성을 선택하세요.');
      return;
    }

    // 언어 자동 감지
    const detectedLang = detectLanguage(scene.ttsScript);

    updateScene(tabId, sceneId, { isGeneratingAudio: true });
    try {
      const result = await generateTTSMutation.mutateAsync({
        text: scene.ttsScript,
        voiceId: effectiveVoiceId,
        speechRate: scene.speechRate || 1.0,
        language: detectedLang,
        apiKey: settings.supertoneApiKey,
      });

      updateScene(tabId, sceneId, {
        audioUrl: result.audioUrl,
        audioDuration: result.duration,
        effectDuration: result.duration,
        isGeneratingAudio: false,
      });
      toast.success(`장면 ${sceneId} TTS 생성 완료 (${result.duration.toFixed(1)}초)`);
    } catch (err: any) {
      updateScene(tabId, sceneId, { isGeneratingAudio: false });
      const errMsg = err.message || '알 수 없는 오류';
      toast.error(`장면 ${sceneId} TTS 생성 실패: ${errMsg}`);
    }
  };

  // 전체 일괄 TTS 생성
  const handleBatchGenerateAudio = async () => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다. 먼저 로그인해주세요.');
      return;
    }
    if (!settings.supertoneApiKey) {
      toast.error('설정에서 Supertone TTS API 키를 먼저 입력해주세요.');
      return;
    }

    // 유효한 voiceId가 있는지 사전 확인
    const hasValidVoice = characters.some(c => c.voiceId && c.voiceId !== 'default');
    if (!hasValidVoice) {
      toast.error('음성을 먼저 선택해주세요. 캐릭터 음성 매핑에서 음성을 선택한 후 다시 시도하세요.');
      return;
    }

    // 생성할 장면이 있는지 확인
    const scenesToGenerate = tab.scenes.filter(s => !s.audioUrl && s.ttsScript);
    if (scenesToGenerate.length === 0) {
      toast.info('생성할 오디오가 없습니다. 모든 장면에 이미 오디오가 있거나 TTS 스크립트가 비어있습니다.');
      return;
    }

    setIsBatchGenerating(true);
    updateTab(tabId, { isBatchGeneratingAudios: true });
    let success = 0, fail = 0;
    const errors: string[] = [];

    for (const scene of tab.scenes) {
      if (scene.audioUrl || !scene.ttsScript) continue;

      // 유효한 voiceId 결정
      const effectiveVoiceId = getEffectiveVoiceId(scene, characters, null);
      if (!effectiveVoiceId) {
        fail++;
        errors.push(`장면 ${scene.id}: 음성 미선택`);
        continue;
      }

      // 언어 자동 감지
      const detectedLang = detectLanguage(scene.ttsScript);

      updateScene(tabId, scene.id, { isGeneratingAudio: true });
      try {
        const result = await generateTTSMutation.mutateAsync({
          text: scene.ttsScript,
          voiceId: effectiveVoiceId,
          speechRate: scene.speechRate || 1.0,
          language: detectedLang,
          apiKey: settings.supertoneApiKey,
        });
        updateScene(tabId, scene.id, {
          audioUrl: result.audioUrl,
          audioDuration: result.duration,
          effectDuration: result.duration,
          isGeneratingAudio: false,
        });
        success++;
      } catch (err: any) {
        updateScene(tabId, scene.id, { isGeneratingAudio: false });
        fail++;
        const errMsg = err.message || '알 수 없는 오류';
        errors.push(`장면 ${scene.id}: ${errMsg}`);
      }
    }

    setIsBatchGenerating(false);
    updateTab(tabId, { isBatchGeneratingAudios: false });

    if (fail > 0 && errors.length > 0) {
      toast.error(`TTS 생성: ${success}개 성공, ${fail}개 실패\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...외 ${errors.length - 3}건` : ''}`);
    } else {
      toast.success(`TTS 생성 완료: ${success}개 성공`);
    }
  };

  const handleDownloadAudio = (sceneId: number) => {
    const scene = tab.scenes.find((s) => s.id === sceneId);
    if (scene?.audioUrl) {
      const a = document.createElement('a');
      a.href = scene.audioUrl;
      a.download = `scene_${sceneId}_audio.mp3`;
      a.click();
    }
  };

  const audioReadyCount = tab.scenes.filter((s) => s.audioUrl).length;
  const selectedScene = tab.scenes.find((s) => s.id === selectedSceneId) || null;

  const translateDetailToKorean = async (ttsScript: string, subtitleLines: string[]) => {
    if (!settings.geminiApiKey?.trim()) return;

    const subtitleInput = subtitleLines
      .map((line, idx) => `${idx + 1}. ${line}`)
      .join('\n');

    const needsNarrationTranslate = ttsScript.trim().length > 0 && !hasKoreanText(ttsScript);
    const needsSubtitleTranslate = subtitleInput.trim().length > 0 && !hasKoreanText(subtitleInput);
    if (!needsNarrationTranslate && !needsSubtitleTranslate) return;

    setIsTranslatingDetailKo(true);
    try {
      const systemInstruction = `당신은 영상 자막 번역가입니다.
영어 원문을 자연스럽고 간결한 한국어로 번역하세요.
반드시 아래 형식으로만 답하세요:
###NARRATION_KO###
(한국어 나레이션)
###SUBTITLE_KO###
1. (한국어 자막 1)
2. (한국어 자막 2)`;

      const prompt = `영어 나레이션:
${ttsScript || '(없음)'}

영어 자막:
${subtitleInput || '(없음)'}`;

      const result = await callGemini(
        settings.geminiApiKey,
        '',
        prompt,
        systemInstruction
      );

      const narrationMatch = result.match(/###NARRATION_KO###\s*([\s\S]*?)\s*###SUBTITLE_KO###/);
      const subtitleMatch = result.match(/###SUBTITLE_KO###\s*([\s\S]*)$/);

      if (narrationMatch?.[1]?.trim()) {
        setDetailNarrationKo(narrationMatch[1].trim());
      }
      if (subtitleMatch?.[1]?.trim()) {
        setDetailSubtitleKo(subtitleMatch[1].trim());
      }
    } catch {
      // 번역 실패 시 상세 편집 기능은 그대로 유지
    } finally {
      setIsTranslatingDetailKo(false);
    }
  };

  const openSceneDetail = (sceneId: number) => {
    const scene = tab.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    setSelectedSceneId(sceneId);
    setDetailTtsScript(scene.ttsScript || '');
    const subtitleTexts = (scene.subtitleScenes || []).map((line) => line.text).filter(Boolean);
    setDetailSubtitles(subtitleTexts.length > 0 ? subtitleTexts : ['']);
    setDetailNarrationKo(scene.ttsScript || '');
    setDetailSubtitleKo(subtitleTexts.map((line, idx) => `${idx + 1}. ${line}`).join('\n'));
    void translateDetailToKorean(scene.ttsScript || '', subtitleTexts);
  };

  const closeSceneDetail = () => {
    setSelectedSceneId(null);
    setDetailTtsScript('');
    setDetailSubtitles([]);
    setDetailNarrationKo('');
    setDetailSubtitleKo('');
  };

  const saveSceneDetail = () => {
    if (!selectedScene) return;
    const cleanedSubtitles = detailSubtitles.map((line) => line.trim()).filter(Boolean);
    updateScene(tabId, selectedScene.id, {
      ttsScript: detailTtsScript,
      subtitleScenes: cleanedSubtitles.map((text, index) => ({ id: index + 1, text })),
    });
    toast.success(`장면 ${selectedScene.id} 자막/스크립트가 저장되었습니다.`);
  };

  const moveSceneDetail = (direction: 'prev' | 'next') => {
    if (!selectedScene) return;
    const idx = tab.scenes.findIndex((s) => s.id === selectedScene.id);
    if (idx === -1) return;
    const nextIdx = direction === 'prev' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= tab.scenes.length) return;
    saveSceneDetail();
    openSceneDetail(tab.scenes[nextIdx].id);
  };

  // 미리보기용 샘플 자막 텍스트
  const previewSubtitleText = useMemo(() => {
    const firstScene = tab.scenes.find(s => s.subtitleScenes && s.subtitleScenes.length > 0);
    if (firstScene && firstScene.subtitleScenes && firstScene.subtitleScenes.length > 0) {
      return firstScene.subtitleScenes.slice(0, subtitleLines).map(s => s.text).join('\n');
    }
    return subtitleLines >= 2
      ? 'Have you ever had this\nstrange experience?'
      : 'Have you ever had this strange experience?';
  }, [tab.scenes, subtitleLines]);

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg border border-border bg-card space-y-3">
        <h4 className="text-xs font-semibold flex items-center gap-2">
          <Type className="w-3.5 h-3.5 text-primary" />
          자막 기본 설정
        </h4>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-3">
          <div className="relative w-full rounded-lg overflow-hidden border border-border min-h-[400px]">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-700/50 to-slate-900 flex items-center justify-center">
              <span className="text-[10px] text-slate-400">미리보기 영상</span>
            </div>
            <div
              className="absolute left-0 right-0 flex justify-center px-4"
              style={{ top: `${subtitlePosition - 5}%`, transform: 'translateY(-50%)' }}
            >
              <div
                className="px-3 py-1.5 rounded text-center"
                style={{
                  fontFamily: subtitleFont,
                  fontSize: `${Math.max(11, subtitleSize / 3.8)}px`,
                  color: subtitleColor,
                  backgroundColor: computedBgColor,
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-line',
                  maxWidth: '90%',
                }}
              >
                {previewSubtitleText}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-secondary/10 p-3 h-full flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">글씨폰트</label>
                <Select value={subtitleFont} onValueChange={setSubtitleFont}>
                  <SelectTrigger className="h-7 text-[10px] bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">글씨크기</label>
                <Select value={String(subtitleSize)} onValueChange={(v) => setSubtitleSize(Number(v))}>
                  <SelectTrigger className="h-7 text-[10px] bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {[32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 90, 100, 110, 120, 130, 140, 150].map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">{s}px</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">줄 수</label>
                <Select value={String(subtitleLines)} onValueChange={(v) => setSubtitleLines(Number(v))}>
                  <SelectTrigger className="h-7 text-[10px] bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="1" className="text-xs">1줄</SelectItem>
                    <SelectItem value="2" className="text-xs">2줄</SelectItem>
                    <SelectItem value="3" className="text-xs">3줄</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">위치</label>
                <Select value={String(subtitlePosition)} onValueChange={(v) => setSubtitlePosition(Number(v))}>
                  <SelectTrigger className="h-7 text-[10px] bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {[70, 75, 80, 85, 90, 95].map((p) => (
                      <SelectItem key={p} value={String(p)} className="text-xs">하단 {p}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium flex items-center gap-1">
                  <Paintbrush className="w-3 h-3 text-primary" /> 글자색
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setSubtitleColor(c.value)}
                      className={cn(
                        'w-6 h-6 rounded border-2 transition-all flex items-center justify-center',
                        subtitleColor === c.value ? 'border-primary scale-110' : 'border-border/50 hover:border-border'
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    >
                      {subtitleColor === c.value && (
                        <span className="text-[8px] font-bold" style={{ color: c.value === '#000000' ? '#fff' : '#000' }}>✓</span>
                      )}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={subtitleColor}
                    onChange={(e) => setSubtitleColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-border"
                    title="커스텀 색상"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium flex items-center gap-1">
                  <Palette className="w-3 h-3 text-primary" /> 배경색
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BG_PRESETS.map((bg) => (
                    <button
                      key={bg.value}
                      onClick={() => setSubtitleBgColor(bg.value)}
                      className={cn(
                        'h-6 px-2 rounded border text-[9px] transition-all',
                        subtitleBgColor === bg.value ? 'border-primary' : 'border-border/50 hover:border-border'
                      )}
                      style={{
                        backgroundColor: bg.value === 'none' ? 'transparent' : bg.value,
                        color: bg.value === 'none' || bg.value.includes('255,255,255') ? 'inherit' : '#fff',
                      }}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={customBgColor}
                    onChange={(e) => {
                      setCustomBgColor(e.target.value);
                      const r = parseInt(e.target.value.slice(1, 3), 16);
                      const g = parseInt(e.target.value.slice(3, 5), 16);
                      const b = parseInt(e.target.value.slice(5, 7), 16);
                      setSubtitleBgColor(`rgba(${r},${g},${b},${bgOpacity / 100})`);
                    }}
                    className="w-6 h-6 rounded cursor-pointer border border-border"
                  />
                  <Slider
                    value={[bgOpacity]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={([v]) => {
                      setBgOpacity(v);
                      const r = parseInt(customBgColor.slice(1, 3), 16);
                      const g = parseInt(customBgColor.slice(3, 5), 16);
                      const b = parseInt(customBgColor.slice(5, 7), 16);
                      setSubtitleBgColor(`rgba(${r},${g},${b},${v / 100})`);
                    }}
                    className="flex-1 max-w-[150px]"
                  />
                  <span className="text-[9px] text-muted-foreground">{bgOpacity}%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">캐릭터 음성 매핑</label>
                <div className="flex items-center gap-1">
                  <Select
                    value={characters[0]?.voiceId || 'default'}
                    onValueChange={(v) => {
                      const updated = [...characters];
                      if (updated.length === 0) {
                        updated.push({ role: '나레이터', description: '기본 나레이션', voiceId: v });
                      } else {
                        updated[0] = { ...updated[0], voiceId: v };
                      }
                      setCharacters(updated);
                    }}
                  >
                    <SelectTrigger className="h-7 text-[10px] bg-background border-border flex-1">
                      <SelectValue placeholder="나레이터 음성 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border max-h-48">
                      {voiceOptions.map((v) => (
                        <SelectItem key={v.value} value={v.value} className="text-xs">
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] border-border"
                    onClick={() => {
                      setVoiceSelectTarget({ type: 'character', index: 0 });
                      setShowVoiceModal(true);
                    }}
                  >
                    <Volume2 className="w-3 h-3 mr-1" />
                    음성 선택
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">TTS 스크립트 언어 변환</label>
                <div className="flex items-center gap-1">
                  <Select value={ttsLanguageMode} onValueChange={(v) => setTtsLanguageMode(v as 'auto' | 'ko' | 'en' | 'ja')}>
                    <SelectTrigger className="h-7 text-[10px] bg-background border-border w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="auto" className="text-xs">자동</SelectItem>
                      <SelectItem value="ko" className="text-xs">한국어</SelectItem>
                      <SelectItem value="en" className="text-xs">영어</SelectItem>
                      <SelectItem value="ja" className="text-xs">일본어</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-7 text-[10px] bg-primary hover:bg-primary/90"
                    onClick={() => toast.info(`언어 모드: ${ttsLanguageMode === 'auto' ? '자동' : ttsLanguageMode.toUpperCase()} (생성 시 적용)`)}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    원문 번역
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAnalyzeCharacters}
              disabled={isAnalyzingCharacters}
              className="h-7 text-[11px] border-primary/40 text-primary hover:bg-primary/10"
            >
              {isAnalyzingCharacters ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 분석 중...</>
              ) : (
                <><Sparkles className="w-3 h-3 mr-1" /> 전체 AI 자막 자동 분할</>
              )}
            </Button>
            <span className="text-[11px] text-muted-foreground">스크립트의 내레이션 흐름에 맞게 문장 단위로 자막/TTS 블록을 자동 분할합니다.</span>
          </div>
        </div>

      </div>

      {/* Scene-by-scene audio & subtitle - card grid layout */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold flex items-center gap-2">
            <Mic className="w-3.5 h-3.5 text-primary" />
            장면별 오디오/자막 생성
          </h4>
          <span className="text-[10px] text-muted-foreground">
            총 {tab.scenes.length}개 장면
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {tab.scenes.map((scene) => {
            const voiceLabel =
              scene.voiceId && scene.voiceId !== 'default'
                ? voiceOptions.find(v => v.value === scene.voiceId)?.label || scene.voiceId
                : '기본(자동)';

            return (
              <div
                key={scene.id}
                className="rounded-lg border border-border/70 bg-secondary/10 p-2 space-y-1.5 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target.closest('button, [role="button"], [role="slider"], input, textarea, a')
                  ) {
                    return;
                  }
                  openSceneDetail(scene.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground">
                    장면 {scene.id}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded',
                      scene.audioUrl
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {scene.audioUrl ? '완료' : '미생성'}
                  </span>
                </div>

                <p className="text-[10px] text-muted-foreground line-clamp-8 min-h-[120px]">
                  {scene.ttsScript || scene.promptKo || '(TTS 스크립트 없음)'}
                </p>

                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all',
                        scene.audioUrl ? 'bg-emerald-500' : 'bg-primary/30'
                      )}
                      style={{ width: scene.audioUrl ? '100%' : '0%' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{scene.audioDuration > 0 ? `${scene.audioDuration.toFixed(1)}초` : '준비 전'}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">음성 / 속도</label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] border-border flex-1 justify-start"
                      onClick={() => {
                        setVoiceSelectTarget({ type: 'scene', sceneId: scene.id });
                        setShowVoiceModal(true);
                      }}
                    >
                      <Volume2 className="w-3 h-3 mr-1 shrink-0" />
                      <span className="truncate">{voiceLabel}</span>
                    </Button>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {scene.speechRate || 1.0}x
                    </span>
                  </div>
                  <Slider
                    value={[scene.speechRate || 1.0]}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    onValueChange={([v]) => updateScene(tabId, scene.id, { speechRate: v })}
                    className="py-0.5"
                  />
                </div>

                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleGenerateAudio(scene.id)}
                    disabled={scene.isGeneratingAudio}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[10px] flex-1"
                  >
                    {scene.isGeneratingAudio ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 생성 중</>
                    ) : (
                      <><Mic className="w-3 h-3 mr-1" /> TTS 생성</>
                    )}
                  </Button>
                  {scene.audioUrl && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-border h-7 text-[10px] px-2"
                        onClick={() => {
                          const audio = new Audio(scene.audioUrl!);
                          audio.play();
                        }}
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-border h-7 text-[10px] px-2"
                        onClick={() => handleDownloadAudio(scene.id)}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedScene && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <div className="w-[calc(100vw-24px)] h-[calc(100vh-24px)] max-w-none max-h-none rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">장면 {selectedScene.id} - 자막 편집</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  라인수 {detailSubtitles.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => moveSceneDetail('prev')}
                  disabled={tab.scenes.findIndex((s) => s.id === selectedScene.id) <= 0}
                >
                  <ChevronLeft className="w-3 h-3 mr-1" />
                  이전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => moveSceneDetail('next')}
                  disabled={tab.scenes.findIndex((s) => s.id === selectedScene.id) >= tab.scenes.length - 1}
                >
                  다음
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
                <Button size="sm" className="h-7 text-xs bg-primary hover:bg-primary/90" onClick={saveSceneDetail}>
                  저장
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={closeSceneDetail}>
                  <X className="w-3 h-3 mr-1" />
                  닫기
                </Button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-0 overflow-hidden">
              <div className="border-r border-border flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border">
                  <p className="text-[11px] text-muted-foreground mb-2">장면 미리보기</p>
                  <div className="w-full rounded-lg overflow-hidden border border-border bg-secondary/20 aspect-video flex items-center justify-center">
                    {selectedScene.imageUrl ? (
                      <img src={selectedScene.imageUrl} alt={`scene-${selectedScene.id}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground">이미지가 없습니다</span>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-2 overflow-auto">
                  <p className="text-[11px] text-muted-foreground">🎙 나레이션 스크립트</p>
                  <Textarea
                    value={detailTtsScript}
                    onChange={(e) => setDetailTtsScript(e.target.value)}
                    className="min-h-[180px] text-xs bg-background border-border"
                  />
                  <div className="mt-2 pt-2 border-t border-border/60">
                    <p className="text-[11px] text-muted-foreground mb-1">📝 한국어 나레이션 (검수용)</p>
                    <Textarea
                      value={detailNarrationKo}
                      onChange={(e) => setDetailNarrationKo(e.target.value)}
                      className="min-h-[110px] text-xs bg-background border-border"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border">
                  <p className="text-[11px] text-muted-foreground">💬 화면 자막</p>
                </div>
                <div className="flex-1 overflow-auto p-3 space-y-1.5">
                  {detailSubtitles.map((line, index) => (
                    <div key={`line-${index}`} className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">자막 {index + 1}</p>
                      <Textarea
                        value={line}
                        onChange={(e) => {
                          const next = [...detailSubtitles];
                          next[index] = e.target.value;
                          setDetailSubtitles(next);
                        }}
                        className="min-h-[52px] text-xs bg-background border-border resize-none"
                      />
                    </div>
                  ))}
                  <div className="mt-3 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-muted-foreground">📝 한국어 자막 (검수용)</p>
                      {isTranslatingDetailKo && (
                        <span className="text-[10px] text-primary flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          번역 중...
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={detailSubtitleKo}
                      onChange={(e) => setDetailSubtitleKo(e.target.value)}
                      className="min-h-[120px] text-xs bg-background border-border"
                      placeholder={'1. 첫 번째 한국어 자막\n2. 두 번째 한국어 자막\n3. 세 번째 한국어 자막'}
                    />
                  </div>
                </div>
                <div className="p-3 border-t border-border flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDetailSubtitles((prev) => [...prev, ''])}
                  >
                    자막 줄 추가
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDetailSubtitles((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
                  >
                    마지막 줄 삭제
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 음성 선택 모달 */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-[95vw] max-w-2xl max-h-[85vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  음성 선택
                  {voicesQuery.data && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      ({voicesQuery.data.length}개)
                    </span>
                  )}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => { setShowVoiceModal(false); setVoiceSelectTarget(null); }} className="h-7 text-xs">
                  닫기
                </Button>
              </div>
              {/* 검색 */}
              <input
                type="text"
                placeholder="음성 이름 검색..."
                value={voiceSearchQuery}
                onChange={(e) => setVoiceSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-border"
              />
              {/* 카테고리 필터 */}
              {voiceCategories.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  <button
                    onClick={() => setVoiceCategoryFilter('all')}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] border transition-colors',
                      voiceCategoryFilter === 'all'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/30 border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    전체
                  </button>
                  {voiceCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setVoiceCategoryFilter(cat)}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] border transition-colors',
                        voiceCategoryFilter === cat
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary/30 border-border text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {translateCategory(cat)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 음성 목록 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {voicesQuery.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground ml-2">음성 목록 로딩 중...</span>
                </div>
              )}
              {voicesQuery.isError && (
                <div className="text-center py-8">
                  <p className="text-xs text-destructive">음성 목록 로드 실패</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{voicesQuery.error?.message}</p>
                </div>
              )}
              {!voicesQuery.isLoading && filteredVoices.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-xs text-muted-foreground">
                    {voiceSearchQuery || voiceCategoryFilter !== 'all'
                      ? '검색 결과가 없습니다.'
                      : '사용 가능한 음성이 없습니다.'}
                  </p>
                </div>
              )}
              {filteredVoices.map((voice: any) => {
                const voiceId = voice.voice_id || voice.id;
                const sampleUrl = voice.samples?.[0]?.url;
                return (
                  <div
                    key={voiceId}
                    onClick={() => handleVoiceSelect(voiceId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleVoiceSelect(voiceId); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors text-left border border-transparent hover:border-border cursor-pointer"
                  >
                    {/* 썸네일 */}
                    {voice.thumbnail_image_url ? (
                      <img src={voice.thumbnail_image_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Volume2 className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{voice.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {voice.gender && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            {voice.gender}
                          </span>
                        )}
                        {voice.age && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            {voice.age}
                          </span>
                        )}
                        {voice.use_case && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {translateCategory(voice.use_case)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 미리듣기 */}
                    {sampleUrl && (
                      <button
                        className="h-8 w-8 p-0 shrink-0 rounded-md hover:bg-secondary/50 flex items-center justify-center transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const audio = new Audio(sampleUrl);
                          audio.play();
                        }}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
