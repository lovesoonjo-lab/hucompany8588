import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore, type SceneSlot, type EffectType } from '@/lib/store';
import { generateImageKie, generateVideoKie } from '@/lib/api';
import { Loader2, ImageIcon, Video, Play, Square, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

interface SceneSlotCardProps {
  tabId: string;
  scene: SceneSlot;
  showEffects: boolean;
  aspectRatio: string;
  referenceImageUrls?: string[];
  imageModel?: string;
  promptUsageLabel?: string;
  selectedPromptLang?: 'en' | 'ko';
}

const effectLabels: Record<EffectType, string> = {
  'fade-in': '페이드인',
  'fade-out': '페이드아웃',
  'fade-in-hold': '페이드인 홀드',
  'zoom-in': '줌인',
  'zoom-in-slow': '슬로우 줌인',
  'zoom-out': '줌아웃',
  'hold': '홀드 (정지)',
  'pan-left-to-right': '패닝 →',
  'pan-right-to-left': '패닝 ←',
  'shake': '쉐이크',
};

const effectColors: Record<string, string> = {
  'fade-in': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'fade-out': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'fade-in-hold': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'zoom-in': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'zoom-in-slow': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'zoom-out': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'hold': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'pan-left-to-right': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'pan-right-to-left': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'shake': 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function SceneSlotCard({
  tabId,
  scene,
  showEffects,
  aspectRatio,
  referenceImageUrls,
  imageModel,
  promptUsageLabel,
  selectedPromptLang = 'en',
}: SceneSlotCardProps) {
  const { settings, updateScene } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const imageAbortRef = useRef<AbortController | null>(null);
  const imageProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (imageProgressTimerRef.current) clearInterval(imageProgressTimerRef.current);
      if (imageTimeoutRef.current) clearTimeout(imageTimeoutRef.current);
      imageAbortRef.current?.abort();
    };
  }, []);

  const startImageProgress = () => {
    setImageProgress(0);
    if (imageProgressTimerRef.current) clearInterval(imageProgressTimerRef.current);
    imageProgressTimerRef.current = setInterval(() => {
      setImageProgress((prev) => {
        if (prev >= 95) return 95;
        const next = prev + Math.floor(Math.random() * 6) + 2;
        return Math.min(next, 95);
      });
    }, 900);
  };

  const stopImageProgress = () => {
    if (imageProgressTimerRef.current) {
      clearInterval(imageProgressTimerRef.current);
      imageProgressTimerRef.current = null;
    }
  };

  const handleGenerateImage = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H1',location:'SceneSlotCard.tsx:88',message:'image generation clicked',data:{tabId,sceneId:scene.id,hasPrompt:!!scene.promptEn},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }
    updateScene(tabId, scene.id, {
      isGeneratingImage: true,
      imageError: null,
      imageTaskState: 'waiting',
      imageTaskId: null,
    });
    const abortController = new AbortController();
    imageAbortRef.current = abortController;
    startImageProgress();
    if (imageTimeoutRef.current) clearTimeout(imageTimeoutRef.current);
    imageTimeoutRef.current = setTimeout(() => {
      abortController.abort();
    }, 120000); // 2분 초과 시 자동 중지
    try {
      const result = await generateImageKie(
        settings.kieApiKey,
        scene.promptEn,
        aspectRatio,
        referenceImageUrls && referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        imageModel || 'nano-banana-2',
        { signal: abortController.signal }
      );
      // #region agent log
      fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H2',location:'SceneSlotCard.tsx:115',message:'image generation result received',data:{sceneId:scene.id,taskId:result.taskId,state:result.state,hasResultUrl:!!result.resultUrl,failMsg:result.failMsg||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!result.resultUrl) {
        throw new Error(result.failMsg || '이미지 URL이 반환되지 않았습니다.');
      }
      stopImageProgress();
      setImageProgress(100);
      updateScene(tabId, scene.id, {
        imageUrl: result.resultUrl,
        isGeneratingImage: false,
        imageTaskId: result.taskId,
        imageTaskState: result.state,
        imageError: null,
      });
      toast.success(`장면 ${scene.id} 이미지 생성 완료`);
      setTimeout(() => setImageProgress(0), 600);
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H5',location:'SceneSlotCard.tsx:129',message:'image generation catch',data:{sceneId:scene.id,errorName:err?.name||null,errorMessage:err?.message||String(err)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      stopImageProgress();
      const isAborted = err?.name === 'AbortError';
      updateScene(tabId, scene.id, {
        isGeneratingImage: false,
        imageTaskState: isAborted ? 'idle' : 'fail',
        imageError: isAborted ? '생성이 중지되었거나 시간이 초과되었습니다.' : (err.message || '이미지 생성 실패'),
      });
      setImageProgress(0);
      if (isAborted) {
        toast.info(`장면 ${scene.id} 이미지 생성을 중지했습니다. (또는 시간 초과)`);
      } else {
        toast.error(`장면 ${scene.id} 이미지 생성 실패: ${err.message}`);
      }
    } finally {
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
        imageTimeoutRef.current = null;
      }
      imageAbortRef.current = null;
    }
  };

  const handleCancelImageGeneration = () => {
    // #region agent log
    fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H4',location:'SceneSlotCard.tsx:152',message:'image generation cancelled by user',data:{sceneId:scene.id},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!scene.isGeneratingImage) return;
    updateScene(tabId, scene.id, {
      isGeneratingImage: false,
      imageTaskState: 'idle',
      imageError: '사용자가 생성을 중지했습니다.',
    });
    stopImageProgress();
    setImageProgress(0);
    if (imageTimeoutRef.current) {
      clearTimeout(imageTimeoutRef.current);
      imageTimeoutRef.current = null;
    }
    imageAbortRef.current?.abort();
  };

  const handleGenerateVideo = async () => {
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }
    if (!scene.imageUrl) {
      toast.error('먼저 이미지를 생성해주세요.');
      return;
    }

    const videoMode = settings.videoGenerationMode;
    if (videoMode === 'static_effect') {
      toast.info('정지 이미지 + 기본 효과 모드에서는 렌더링 탭에서 영상을 생성합니다.');
      return;
    }

    updateScene(tabId, scene.id, {
      isGeneratingVideo: true,
      videoError: null,
      videoTaskState: 'waiting',
      videoTaskId: null,
    });
    try {
      const result = await generateVideoKie(
        settings.kieApiKey,
        scene.imageUrl,
        scene.videoMotionPrompt,
        videoMode as any,
        aspectRatio
      );
      if (!result.resultUrl) {
        throw new Error(result.failMsg || '동영상 URL이 반환되지 않았습니다.');
      }
      updateScene(tabId, scene.id, {
        videoUrl: result.resultUrl,
        isGeneratingVideo: false,
        videoTaskId: result.taskId,
        videoTaskState: result.state,
        videoError: null,
      });
      toast.success(`장면 ${scene.id} 동영상 생성 완료`);
    } catch (err: any) {
      updateScene(tabId, scene.id, {
        isGeneratingVideo: false,
        videoTaskState: 'fail',
        videoError: err.message || '동영상 생성 실패',
      });
      toast.error(`장면 ${scene.id} 동영상 생성 실패: ${err.message}`);
    }
  };

  const handleResetGeneratedImage = () => {
    updateScene(tabId, scene.id, {
      imageUrl: null,
      isGeneratingImage: false,
      imageTaskId: null,
      imageTaskState: 'idle',
      imageError: null,
      // 이미지 기반으로 생성된 동영상도 함께 초기화
      videoUrl: null,
      isGeneratingVideo: false,
      videoTaskId: null,
      videoTaskState: 'idle',
      videoError: null,
    });
    stopImageProgress();
    setImageProgress(0);
    imageAbortRef.current?.abort();
    if (imageTimeoutRef.current) {
      clearTimeout(imageTimeoutRef.current);
      imageTimeoutRef.current = null;
    }
    toast.success(`장면 ${scene.id} 이미지가 초기화되었습니다.`);
  };

  const currentEffect = (scene.effectType || 'zoom-in') as EffectType;
  const effectLabel = effectLabels[currentEffect] || currentEffect;
  const effectColor = effectColors[currentEffect] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden transition-all hover:border-primary/30">
      {/* Header with effect badge */}
      <div className="px-3 py-2 bg-secondary/50 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary">#{scene.id}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', effectColor)}>
            {effectLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {scene.audioUrl && (
            <span className="w-2 h-2 rounded-full bg-yellow-500" title="TTS 생성됨" />
          )}
          {scene.imageUrl && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="이미지 생성됨" />
          )}
          {scene.videoUrl && (
            <span className="w-2 h-2 rounded-full bg-blue-500" title="동영상 생성됨" />
          )}
        </div>
      </div>

      {/* Preview */}
      <div
        className={cn(
          'relative bg-secondary/30 flex items-center justify-center overflow-hidden',
          aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16] max-h-48'
        )}
      >
        {scene.videoUrl ? (
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              src={scene.videoUrl}
              className="w-full h-full object-cover"
              loop
              playsInline
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
            />
            {!isVideoPlaying && (
              <button
                onClick={() => videoRef.current?.play()}
                className="absolute inset-0 flex items-center justify-center bg-black/30"
              >
                <Play className="w-8 h-8 text-white" />
              </button>
            )}
          </div>
        ) : scene.imageUrl ? (
          <img src={scene.imageUrl} alt={`장면 ${scene.id}`} className="w-full h-full object-cover" />
        ) : scene.isGeneratingImage ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">생성 중... {imageProgress}%</span>
            <div className="w-40 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(imageProgress, 100))}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
            <ImageIcon className="w-8 h-8" />
            <span className="text-[10px]">미리보기</span>
          </div>
        )}
      </div>

      {/* Prompts */}
      <div className="p-3 space-y-2">
        <div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Image Prompt (EN)
            </label>
            {selectedPromptLang === 'en' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary whitespace-nowrap">
                {promptUsageLabel || '[선택]'}
              </span>
            )}
          </div>
          <textarea
            value={scene.promptEn}
            onChange={(e) => updateScene(tabId, scene.id, { promptEn: e.target.value })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Image Prompt (KO)
            </label>
            {selectedPromptLang === 'ko' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary whitespace-nowrap">
                {promptUsageLabel || '[선택]'}
              </span>
            )}
          </div>
          <textarea
            value={scene.promptKo}
            onChange={(e) => updateScene(tabId, scene.id, { promptKo: e.target.value })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Effect settings (for basic mode) */}
        {showEffects && !scene.videoUrl && (
          <div className="flex items-center gap-2">
            <Select
              value={currentEffect}
              onValueChange={(v) => updateScene(tabId, scene.id, { effectType: v as EffectType })}
            >
              <SelectTrigger className="h-7 text-xs bg-background border-border flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {Object.entries(effectLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="number"
              value={scene.effectDuration > 0 ? scene.effectDuration : ''}
              onChange={(e) =>
                updateScene(tabId, scene.id, { effectDuration: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })
              }
              min={1}
              max={10}
              step={0.5}
              placeholder="-"
              className="w-16 h-7 bg-background border border-border rounded px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">초</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={scene.isGeneratingImage ? handleCancelImageGeneration : handleGenerateImage}
            disabled={!scene.isGeneratingImage && !scene.promptEn}
            size="sm"
            variant="outline"
            className={cn(
              'flex-1 h-8 text-xs border-border',
              scene.isGeneratingImage && 'border-destructive/40 text-destructive hover:bg-destructive/10'
            )}
          >
            {scene.isGeneratingImage ? (
              <><Square className="w-3 h-3 mr-1" /> 중지</>
            ) : (
              <><ImageIcon className="w-3 h-3 mr-1" /> 이미지 생성</>
            )}
          </Button>
          {settings.videoGenerationMode !== 'static_effect' && (
            <Button
              onClick={handleGenerateVideo}
              disabled={scene.isGeneratingVideo || !scene.imageUrl}
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-border"
            >
              {scene.isGeneratingVideo ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <><Video className="w-3 h-3 mr-1" /> 동영상</>
              )}
            </Button>
          )}
          <Button
            onClick={handleResetGeneratedImage}
            disabled={!scene.imageUrl && !scene.videoUrl && !scene.isGeneratingImage}
            size="sm"
            variant="outline"
            className="h-8 text-xs border-border"
          >
            <RotateCcw className="w-3 h-3 mr-1" /> 초기화
          </Button>
        </div>
        {(scene.imageTaskId || scene.videoTaskId || scene.imageError || scene.videoError) && (
          <div className="space-y-1 pt-1">
            {scene.imageTaskId && (
              <p className="text-[10px] text-muted-foreground">
                이미지 Task: {scene.imageTaskId} ({scene.imageTaskState || 'waiting'})
              </p>
            )}
            {scene.videoTaskId && (
              <p className="text-[10px] text-muted-foreground">
                동영상 Task: {scene.videoTaskId} ({scene.videoTaskState || 'waiting'})
              </p>
            )}
            {scene.imageError && (
              <p className="text-[10px] text-destructive">이미지 오류: {scene.imageError}</p>
            )}
            {scene.videoError && (
              <p className="text-[10px] text-destructive">동영상 오류: {scene.videoError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
