import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore, type SceneSlot, type EffectType, type SubtitleScene } from '@/lib/store';
import { callGemini, PROMPTS, type ProgressCallbacks } from '@/lib/api';
import { Loader2, Search, Sparkles, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface Step4Props {
  tabId: string;
}

type AssetRow = {
  fileName: string;
  fileUrl: string | null;
  mimeType: string | null;
  label?: string | null;
};

const TEXT_CONTEXT_MAX_PER_FILE = 10_000;
const TEXT_CONTEXT_MAX_TOTAL = 18_000;

function isLikelyTextAsset(asset: AssetRow): boolean {
  const mime = (asset.mimeType || '').toLowerCase();
  const name = (asset.fileName || '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json' || mime === 'application/xml') return true;
  if (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.json')) return true;
  return false;
}

/** STEP3에서 연 서버 프로젝트의 기획서·지식자료(텍스트)를 장면 분석용 컨텍스트로 모읍니다. */
async function buildServerProjectTextContext(
  fetchList: (input: { projectId: number; category: string }) => Promise<AssetRow[]>,
  projectId: number
): Promise<string> {
  const [plans, knowledge] = await Promise.all([
    fetchList({ projectId, category: 'document_plan' }),
    fetchList({ projectId, category: 'document_knowledge' }),
  ]);
  const combined = [...(plans || []), ...(knowledge || [])];
  const chunks: string[] = [];
  let totalLen = 0;

  for (const asset of combined) {
    if (!asset.fileUrl) continue;
    const title = asset.label || asset.fileName || '문서';
    if (!isLikelyTextAsset(asset)) {
      chunks.push(`[${title}] (형식: ${asset.mimeType || 'unknown'} — 장면 분석에는 텍스트·md·csv·json만 자동 포함됩니다.)`);
      continue;
    }
    try {
      const res = await fetch(asset.fileUrl);
      if (!res.ok) continue;
      const raw = await res.text();
      const slice = raw.slice(0, TEXT_CONTEXT_MAX_PER_FILE);
      if (totalLen + slice.length > TEXT_CONTEXT_MAX_TOTAL) {
        const rest = TEXT_CONTEXT_MAX_TOTAL - totalLen;
        if (rest < 200) break;
        chunks.push(`--- ${title} (일부) ---\n${slice.slice(0, rest)}`);
        break;
      }
      chunks.push(`--- ${title} ---\n${slice}`);
      totalLen += slice.length;
    } catch {
      chunks.push(`[${title}] (파일을 불러오지 못했습니다. 저장소 CORS 또는 네트워크를 확인해주세요.)`);
    }
  }

  return chunks.filter(Boolean).join('\n\n');
}

export default function Step4Analyze({ tabId }: Step4Props) {
  const { tabs, updateTab, setScenes, settings } = useAppStore();
  const { isAuthenticated } = useAuth();
  const trpcUtils = trpc.useUtils();
  const tab = tabs.find((t) => t.id === tabId)!;
  const abortControllerRef = useRef<AbortController | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState('');

  const optimizeAnalyzeInput = (script: string): string => {
    const cleaned = script
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => Boolean(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return cleaned;
  };

  const countEmbeddedSceneHints = (script: string): number => {
    const text = script || '';

    // 장면 번호 패턴: "장면 1", "Scene 1", "#1"
    const sceneLabelMatches = text.match(/(?:장면|scene)\s*[:#-]?\s*\d+/gi) || [];
    // 메타 프롬프트 패턴: "Image Prompt:"
    const imagePromptMatches = text.match(/image\s*prompt\s*[:：]/gi) || [];

    // 장면 수는 이미지 프롬프트 개수를 가장 신뢰하고,
    // 없을 때만 장면 라벨을 사용합니다. (TTS 태그는 장면 수 산정에서 제외)
    if (imagePromptMatches.length > 0) return imagePromptMatches.length;
    if (sceneLabelMatches.length > 0) return sceneLabelMatches.length;
    return 0;
  };

  const estimateTargetSceneCount = (script: string): number => {
    const embeddedSceneCount = countEmbeddedSceneHints(script);
    if (embeddedSceneCount > 0) {
      // 대본에 이미 장면/프롬프트 구조가 있으면 해당 개수를 우선 사용
      return Math.min(150, Math.max(10, embeddedSceneCount));
    }

    const cleaned = optimizeAnalyzeInput(script);
    const charCount = cleaned.replace(/\s+/g, '').length;
    const paragraphCount = cleaned
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean).length;
    const sentenceCount = cleaned
      .split(/[.!?。！？]\s+|\n+/)
      .map((part) => part.trim())
      .filter(Boolean).length;

    // 문단/문장/문자 수를 함께 반영해 목표 장면 수를 계산합니다.
    const byChars = Math.ceil(charCount / 260);
    const byParagraphs = Math.ceil(paragraphCount * 1.2);
    const bySentences = Math.ceil(sentenceCount * 0.75);
    const estimated = Math.max(byChars, byParagraphs, bySentences);

    return Math.min(150, Math.max(10, estimated));
  };

  const normalizeSubtitleScenes = (subtitleText: string): SubtitleScene[] => {
    const cleaned = (subtitleText || '').trim();
    if (!cleaned) return [];
    const byMarkers = cleaned.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map((s) => s.trim()).filter(Boolean);
    if (byMarkers.length > 0) {
      return byMarkers.map((text, idx) => ({ id: idx + 1, text }));
    }
    return cleaned
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((text, idx) => ({ id: idx + 1, text }));
  };

  const pickEffectFromFx = (fxText: string): EffectType => {
    const t = (fxText || '').toLowerCase();
    if (!t) return 'zoom-in';
    if (t.includes('shake') || t.includes('충격') || t.includes('긴장')) return 'shake';
    if (t.includes('fade-out') || t.includes('마무리') || t.includes('끝')) return 'fade-out';
    if (t.includes('fade-in-hold')) return 'fade-in-hold';
    if (t.includes('fade-in') || t.includes('도입')) return 'fade-in';
    if (t.includes('zoom-in-slow') || t.includes('천천히')) return 'zoom-in-slow';
    if (t.includes('zoom-out') || t.includes('줌아웃')) return 'zoom-out';
    if (t.includes('hold') || t.includes('고정')) return 'hold';
    if (t.includes('pan-right-to-left') || t.includes('우→좌')) return 'pan-right-to-left';
    if (t.includes('pan-left-to-right') || t.includes('좌→우')) return 'pan-left-to-right';
    return 'zoom-in';
  };

  const extractStructuredScenes = (script: string): SceneSlot[] => {
    type Parsed = {
      sceneNo?: number;
      promptRaw?: string;
      tts?: string;
      subtitle?: string;
      motion?: string;
      fx?: string;
    };

    const lines = (script || '')
      .split('\n')
      .map((line) => line.replace(/\uF000/g, ' ').trim())
      .filter(Boolean);

    const parsed: Parsed[] = [];
    let current: Parsed | null = null;
    let activeField: 'promptRaw' | 'tts' | 'subtitle' | 'motion' | 'fx' | null = null;

    const pushCurrentIfValid = () => {
      if (!current) return;
      if (current.promptRaw || current.tts || current.subtitle || current.motion || current.fx) {
        parsed.push(current);
      }
      current = null;
      activeField = null;
    };

    const ensureCurrent = () => {
      if (!current) current = {};
    };

    for (const line of lines) {
      const sceneMatch = line.match(/(?:장면|scene)\s*[:#-]?\s*(\d+)/i);
      if (sceneMatch) {
        pushCurrentIfValid();
        current = { sceneNo: Number(sceneMatch[1]) };
        activeField = null;
        continue;
      }

      const imagePromptMatch = line.match(/image\s*prompt\s*[:：]\s*(.*)$/i);
      if (imagePromptMatch) {
        // Image Prompt가 새로 나오면 이전 장면을 닫고 새 장면으로 시작
        if (current?.promptRaw) pushCurrentIfValid();
        ensureCurrent();
        current!.promptRaw = (imagePromptMatch[1] || '').trim();
        activeField = 'promptRaw';
        continue;
      }

      const ttsMatch = line.match(/en\s*tts\s*script\s*[:：]\s*(.*)$/i);
      if (ttsMatch) {
        ensureCurrent();
        current!.tts = (ttsMatch[1] || '').trim();
        activeField = 'tts';
        continue;
      }

      const subMatch = line.match(/en\s*subtitle\s*[:：]\s*(.*)$/i);
      if (subMatch) {
        ensureCurrent();
        current!.subtitle = (subMatch[1] || '').trim();
        activeField = 'subtitle';
        continue;
      }

      const motionMatch = line.match(/video\s*motion\s*prompt\s*[:：]\s*(.*)$/i);
      if (motionMatch) {
        ensureCurrent();
        current!.motion = (motionMatch[1] || '').trim();
        activeField = 'motion';
        continue;
      }

      const fxMatch = line.match(/fx\s*tag\s*[:：]\s*(.*)$/i);
      if (fxMatch) {
        ensureCurrent();
        current!.fx = (fxMatch[1] || '').trim();
        activeField = 'fx';
        continue;
      }

      // 이전 필드의 줄바꿈 연장 텍스트로 취급
      if (current && activeField) {
        current[activeField] = `${current[activeField] || ''} ${line}`.trim();
      }
    }
    pushCurrentIfValid();

    return parsed
      .filter((s) => Boolean(s.promptRaw))
      .map((s, idx) => {
        const promptRaw = (s.promptRaw || '').trim();
        const [promptEnRaw, promptKoRaw] = promptRaw.split(/\s*\/\s*/);
        const promptEn = (promptEnRaw || '').trim();
        const promptKo = (promptKoRaw || promptEnRaw || '').trim();
        const subtitleScenes = normalizeSubtitleScenes(s.subtitle || '');
        const ttsScript = (s.tts || subtitleScenes.map((x) => x.text).join(' ') || '').trim();
        const effectType = pickEffectFromFx(s.fx || '');
        const duration =
          ttsScript.length < 50 ? 2.5 : ttsScript.length < 100 ? 3.5 : 4.5;

        return {
          id: s.sceneNo || idx + 1,
          promptEn,
          promptKo,
          effectType,
          effectDuration: duration,
          videoMotionPrompt: (s.motion || '').trim(),
          imageUrl: null,
          videoUrl: null,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          ttsScript: ttsScript || `Scene ${idx + 1} narration`,
          subtitleScenes: subtitleScenes.length > 0 ? subtitleScenes : [{ id: 1, text: ttsScript || `장면 ${idx + 1}` }],
          audioUrl: null,
          audioDuration: 0,
          isGeneratingAudio: false,
          voiceId: 'default',
          speechRate: 1.0,
          subtitleLines: 2,
          subtitleSize: 48,
          subtitlePosition: 90,
          subtitleFont: 'Pretendard',
          subtitleColor: '#FFFFFF',
          subtitleOutline: true,
          subtitleOutlineWidth: 2,
          subtitleBg: 'none' as const,
        };
      })
      .sort((a, b) => a.id - b.id)
      .map((scene, i) => ({ ...scene, id: i + 1 }));
  };

  const buildFallbackScenes = (script: string): SceneSlot[] => {
    const chunks = script
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);

    const targetSceneCount = estimateTargetSceneCount(script);
    const picked = (chunks.length > 0 ? chunks : [script.trim()])
      .filter(Boolean)
      .slice(0, targetSceneCount);

    return picked.map((chunk, i) => {
      const short = chunk.replace(/\s+/g, ' ').slice(0, 140).trim();
      const subtitleScenes: SubtitleScene[] = short
        .split(/(?<=[.!?。！？])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((text, idx) => ({ id: idx + 1, text }));

      return {
        id: i + 1,
        promptEn: `Cinematic scene ${i + 1}, psychology documentary style, moody lighting, detailed composition`,
        promptKo: `장면 ${i + 1}: ${short || '심리학 설명 장면'}`,
        effectType: 'zoom-in',
        effectDuration: 2.5,
        videoMotionPrompt: 'Slow zoom in with gentle camera motion',
        imageUrl: null,
        videoUrl: null,
        isGeneratingImage: false,
        isGeneratingVideo: false,
        ttsScript: short || `Scene ${i + 1} narration`,
        subtitleScenes: subtitleScenes.length > 0 ? subtitleScenes : [{ id: 1, text: short || `장면 ${i + 1}` }],
        audioUrl: null,
        audioDuration: 0,
        isGeneratingAudio: false,
        voiceId: 'default',
        speechRate: 1.0,
        subtitleLines: 2,
        subtitleSize: 48,
        subtitlePosition: 90,
        subtitleFont: 'Pretendard',
        subtitleColor: '#FFFFFF',
        subtitleOutline: true,
        subtitleOutlineWidth: 2,
        subtitleBg: 'none',
      };
    });
  };

  const parseGeminiScenes = (resultText: string): SceneSlot[] => {
    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI 응답이 너무 길어서 잘렸습니다. 대본을 더 짧게 줄이거나 다시 시도해주세요.');
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('AI 응답 형식 오류입니다. 다시 시도해주세요.');
    }

    const VALID_EFFECTS: EffectType[] = [
      'fade-in', 'fade-out', 'fade-in-hold', 'zoom-in', 'zoom-in-slow',
      'zoom-out', 'hold', 'pan-left-to-right', 'pan-right-to-left', 'shake'
    ];

    return parsed.map((scene: any, i: number) => {
      const rawEffect = scene.effectType || 'zoom-in';
      const effectType: EffectType = VALID_EFFECTS.includes(rawEffect as EffectType)
        ? (rawEffect as EffectType)
        : 'zoom-in';

      const subtitleText = scene.subtitleEn || '';
      const subtitleScenes: SubtitleScene[] = [];
      if (subtitleText) {
        const parts = subtitleText.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).filter((s: string) => s.trim());
        parts.forEach((part: string, idx: number) => {
          subtitleScenes.push({ id: idx + 1, text: part.trim() });
        });
        if (subtitleScenes.length === 0) {
          subtitleScenes.push({ id: 1, text: subtitleText.trim() });
        }
      }

      return {
        id: i + 1,
        promptEn: scene.promptEn || '',
        promptKo: scene.promptKo || '',
        effectType,
        effectDuration: scene.effectDuration || 2.5,
        videoMotionPrompt: scene.videoMotionPrompt || '',
        imageUrl: null,
        videoUrl: null,
        isGeneratingImage: false,
        isGeneratingVideo: false,
        ttsScript: scene.ttsScript || '',
        subtitleScenes,
        audioUrl: null,
        audioDuration: 0,
        isGeneratingAudio: false,
        voiceId: 'default',
        speechRate: 1.0,
        subtitleLines: 2,
        subtitleSize: 48,
        subtitlePosition: 90,
        subtitleFont: 'Pretendard',
        subtitleColor: '#FFFFFF',
        subtitleOutline: true,
        subtitleOutlineWidth: 2,
        subtitleBg: 'none' as const,
      };
    });
  };

  // 컴포넌트 마운트 시 isAnalyzing이 true로 잔류해 있으면 리셋합니다.
  useEffect(() => {
    if (tab.isAnalyzing) {
      updateTab(tabId, { isAnalyzing: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 분석 중지 핸들러
  const handleStopAnalyze = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    updateTab(tabId, { isAnalyzing: false });
    setRetryMessage(null);
    setProgress(0);
    setProgressPhase('');
    toast.info('장면 분석이 중지되었습니다.');
  };

  const handleAnalyze = async () => {
    if (!tab.script) {
      toast.error('먼저 STEP 1에서 대본을 분리해주세요.');
      return;
    }

    // AbortController 생성
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    updateTab(tabId, { isAnalyzing: true });
    setRetryMessage(null);
    setProgress(0);
    setProgressPhase('준비 중...');
    const analyzeInput = optimizeAnalyzeInput(tab.script);
    const targetSceneCount = estimateTargetSceneCount(tab.script);

    try {
      // 중지 확인 헬퍼
      const checkAborted = () => {
        if (abortController.signal.aborted) {
          throw new DOMException('장면 분석이 사용자에 의해 중지되었습니다.', 'AbortError');
        }
      };

      const progressCallbacks: ProgressCallbacks = {
        onProgress: (percent, phase) => {
          checkAborted();
          setProgress(percent);
          setProgressPhase(phase);
        },
        onRetry: (attempt, max, delaySec) => {
          const msg = `Gemini 서버가 혼잡합니다. ${delaySec}초 후 재시도합니다... (${attempt}/${max})`;
          setRetryMessage(msg);
          toast.warning(`Gemini 서버 혼잡 - ${delaySec}초 후 재시도 (${attempt}/${max})`, { id: 'gemini-retry-analyze', duration: delaySec * 1000 + 1000 });
        },
        onGiveUp: () => {
          setRetryMessage(null);
          setProgress(0);
          setProgressPhase('');
        },
      };

      checkAborted();

      const structuredScenes = extractStructuredScenes(tab.script);
      if (structuredScenes.length > 0) {
        setScenes(tabId, structuredScenes);
        updateTab(tabId, { currentStep: Math.max(tab.currentStep, 5) });
        setRetryMessage(null);
        setProgress(100);
        setProgressPhase('완료!');
        toast.success(`대본 메타데이터에서 ${structuredScenes.length}개 장면을 추출했습니다.`);
        setTimeout(() => {
          setProgress(0);
          setProgressPhase('');
        }, 2000);
        return;
      }

      let userPromptBody = `대본:\n${analyzeInput}`;
      if (
        tab.serverReferenceMode === 'server' &&
        tab.serverProjectId &&
        isAuthenticated
      ) {
        try {
          const ctx = await buildServerProjectTextContext(
            (input) => trpcUtils.asset.list.fetch(input),
            tab.serverProjectId
          );
          if (ctx.trim()) {
            userPromptBody += `\n\n[프로젝트 참고 자료 — 기획서·지식자료]\n다음은 동일 프로젝트에 업로드된 참고 문서입니다. 대본과 모순되지 않게 톤·사실·용어를 맞추고 장면을 설계하세요.\n\n${ctx}`;
          }
        } catch {
          toast.warning('프로젝트 문서를 불러오지 못했습니다. 대본만으로 분석합니다.');
        }
      }

      const result = await callGemini(
        settings.geminiApiKey, '',
        userPromptBody,
        PROMPTS.analyzeScenes(
          tab.selectedAspectRatio || tab.aspectRatio,
          tab.imageStyle || 'natural',
          targetSceneCount
        ),
        progressCallbacks,
        abortController.signal
      );

      checkAborted();
      let scenes: SceneSlot[] = [];
      try {
        scenes = parseGeminiScenes(result);
      } catch (parseErr) {
        // 1차 분석이 타임아웃/파싱 실패한 경우, 입력과 장면 수를 줄여 2차 경량 재시도
        const lightInput = analyzeInput.slice(0, 7000);
        const reducedSceneCount = Math.max(10, Math.min(24, Math.ceil(targetSceneCount * 0.55)));
        toast.warning(`분석 응답이 길어 경량 모드(${reducedSceneCount}장면)로 재시도합니다.`);
        const retryResult = await callGemini(
          settings.geminiApiKey,
          '',
          `대본(요약 분석용):\n${lightInput}`,
          PROMPTS.analyzeScenes(
            tab.selectedAspectRatio || tab.aspectRatio,
            tab.imageStyle || 'natural',
            reducedSceneCount
          ),
          progressCallbacks,
          abortController.signal
        );
        checkAborted();
        scenes = parseGeminiScenes(retryResult);
        if (parseErr instanceof Error) {
          console.warn('[Step4Analyze] Primary parse failed, fallback succeeded:', parseErr.message);
        }
      }

      if (scenes.length < Math.max(5, Math.floor(targetSceneCount * 0.5))) {
        toast.warning(`목표 ${targetSceneCount}개 대비 ${scenes.length}개만 생성되었습니다. 다시 시도하면 더 많이 생성될 수 있습니다.`);
      }
      setScenes(tabId, scenes);
      updateTab(tabId, { currentStep: Math.max(tab.currentStep, 5) });
      setRetryMessage(null);
      setProgress(100);
      setProgressPhase('완료!');
      toast.success(`${scenes.length}개의 장면이 분석되었습니다.`);

      setTimeout(() => {
        setProgress(0);
        setProgressPhase('');
      }, 2000);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 이미 handleStopAnalyze에서 처리됨
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeoutLike =
        errMsg.includes('요청 시간이 초과되었습니다') ||
        errMsg.toLowerCase().includes('timeout') ||
        errMsg.includes('503');

      if (isTimeoutLike) {
        try {
          const lightInput = analyzeInput.slice(0, 7000);
          const reducedSceneCount = Math.max(10, Math.min(24, Math.ceil(targetSceneCount * 0.5)));
          toast.warning(`네트워크/시간 제한으로 경량 모드(${reducedSceneCount}장면) 재시도 중입니다.`);
          const retryResult = await callGemini(
            settings.geminiApiKey,
            '',
            `대본(요약 분석용):\n${lightInput}`,
            PROMPTS.analyzeScenes(
              tab.selectedAspectRatio || tab.aspectRatio,
              tab.imageStyle || 'natural',
              reducedSceneCount
            ),
            undefined,
            abortController.signal
          );
          const retryScenes = parseGeminiScenes(retryResult);
          if (retryScenes.length > 0) {
            setScenes(tabId, retryScenes);
            updateTab(tabId, { currentStep: Math.max(tab.currentStep, 5) });
            setRetryMessage(null);
            setProgress(100);
            setProgressPhase('완료!');
            toast.success(`경량 재시도로 ${retryScenes.length}개 장면 분석을 완료했습니다.`);
            setTimeout(() => {
              setProgress(0);
              setProgressPhase('');
            }, 2000);
            return;
          }
        } catch (retryErr) {
          console.warn('[Step4Analyze] timeout fallback retry failed:', retryErr);
        }
      }
      const fallbackScenes = buildFallbackScenes(tab.script);
      if (fallbackScenes.length > 0) {
        setScenes(tabId, fallbackScenes);
        updateTab(tabId, { currentStep: Math.max(tab.currentStep, 5) });
        setRetryMessage(null);
        setProgress(100);
        setProgressPhase('완료!');
        toast.warning(`AI 분석 실패로 기본 장면 ${fallbackScenes.length}개를 생성했습니다: ${errMsg}`);
        setTimeout(() => {
          setProgress(0);
          setProgressPhase('');
        }, 2000);
      } else {
        setRetryMessage(null);
        setProgress(0);
        setProgressPhase('');
        toast.error(`장면 분석 실패: ${err.message}`);
      }
    } finally {
      updateTab(tabId, { isAnalyzing: false });
      abortControllerRef.current = null;
      setRetryMessage(null);
    }
  };

  const selectedRatio = tab.selectedAspectRatio || tab.aspectRatio;
  const ratioLabel: Record<string, string> = {
    '16:9': '가로형 (16:9)',
    '9:16': '세로형 (9:16)',
    '1:1': '정사각형 (1:1)',
    '4:3': '클래식 가로 (4:3)',
    '3:4': '클래식 세로 (3:4)',
  };

  const showProgress = tab.isAnalyzing || (progress > 0 && progress <= 100);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        대본을 분석하여 장면별 이미지 프롬프트, EN TTS Script, EN Subtitle, 동영상 모션 프롬프트를 자동 생성합니다.
      </p>

      <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">분석 설정</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-primary/10 text-primary">
            {ratioLabel[selectedRatio] || selectedRatio}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded bg-secondary border border-border">
            스타일: {tab.imageStyle || 'natural'}
          </span>
          <span className="px-2 py-0.5 rounded bg-secondary border border-border">
            모델: {tab.imageModel || 'nano-banana-2'}
          </span>
          <span className="px-2 py-0.5 rounded bg-secondary border border-border">
            효과: {settings.videoGenerationMode === 'static_effect' ? '정지 이미지 + 기본 효과' : settings.videoGenerationMode}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          분석 결과: 이미지 프롬프트(EN/KO) + TTS Script(EN) + Subtitle(EN, ①②③) + 모션 프롬프트
        </p>
        {tab.serverReferenceMode === 'server' && tab.serverProjectId && isAuthenticated && (
          <p className="text-[11px] text-primary/90 mt-2 leading-relaxed">
            STEP 3에서 이 탭에 연결한 서버 프로젝트의 기획서·지식자료(텍스트·md·csv·json)가 있으면, 장면 분석 시 대본과 함께 AI에 전달됩니다.
          </p>
        )}
      </div>

      {/* Analyze Button with Stop */}
      <div className="space-y-2">
        {tab.isAnalyzing ? (
          <div className="flex gap-2">
            <Button disabled className="flex-1 bg-primary/80 h-11">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 분석 중... {progress > 0 && `${progress}%`}
            </Button>
            <Button onClick={handleStopAnalyze} variant="destructive" className="h-11 px-4">
              <StopCircle className="w-4 h-4 mr-1.5" /> 중지
            </Button>
          </div>
        ) : (
          <Button onClick={handleAnalyze} disabled={!tab.script} className="w-full bg-primary hover:bg-primary/90 h-11">
            <Search className="w-4 h-4 mr-2" /> 장면 분석하기
          </Button>
        )}

        {/* Progress Bar */}
        {(tab.isAnalyzing || (progress > 0 && progress < 100)) && (
          <div className="space-y-1.5">
            <div className="relative">
              <Progress value={progress} className="h-3 bg-muted/50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white drop-shadow-sm">{progress}%</span>
              </div>
            </div>
            {progressPhase && <p className="text-xs text-muted-foreground text-center">{progressPhase}</p>}
          </div>
        )}
        {progress === 100 && !tab.isAnalyzing && progressPhase && (
          <div className="space-y-1.5">
            <div className="relative">
              <Progress value={100} className="h-3 bg-muted/50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white drop-shadow-sm">100%</span>
              </div>
            </div>
            <p className="text-xs text-green-400 text-center font-medium">{progressPhase}</p>
          </div>
        )}
      </div>

      {retryMessage && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {retryMessage}
        </div>
      )}

      {tab.scenes.length > 0 && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm text-center text-muted-foreground">
            총 <span className="text-primary font-semibold">{tab.scenes.length}</span>개의 장면이 생성되었습니다.
            아래 STEP 5에서 이미지/오디오/영상 작업을 진행하세요.
          </p>
        </div>
      )}
    </div>
  );
}
