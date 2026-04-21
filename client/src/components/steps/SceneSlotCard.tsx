import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore, type SceneSlot, type EffectType } from '@/lib/store';
import { generateImageKie, generateVideoKie } from '@/lib/api';
import { Loader2, ImageIcon, Video, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useState, useRef } from 'react';

interface SceneSlotCardProps {
  tabId: string;
  scene: SceneSlot;
  showEffects: boolean;
  aspectRatio: string;
  referenceImageUrls?: string[];
  imageModel?: string;
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
}: SceneSlotCardProps) {
  const { settings, updateScene } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const handleGenerateImage = async () => {
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }
    updateScene(tabId, scene.id, { isGeneratingImage: true });
    try {
      const imageUrl = await generateImageKie(
        settings.kieApiKey,
        scene.promptEn,
        aspectRatio,
        referenceImageUrls && referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        imageModel || 'nano-banana-2'
      );
      updateScene(tabId, scene.id, { imageUrl, isGeneratingImage: false });
      toast.success(`장면 ${scene.id} 이미지 생성 완료`);
    } catch (err: any) {
      updateScene(tabId, scene.id, { isGeneratingImage: false });
      toast.error(`장면 ${scene.id} 이미지 생성 실패: ${err.message}`);
    }
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

    updateScene(tabId, scene.id, { isGeneratingVideo: true });
    try {
      const videoUrl = await generateVideoKie(
        settings.kieApiKey,
        scene.imageUrl,
        scene.videoMotionPrompt,
        videoMode as any,
        aspectRatio
      );
      updateScene(tabId, scene.id, { videoUrl, isGeneratingVideo: false });
      toast.success(`장면 ${scene.id} 동영상 생성 완료`);
    } catch (err: any) {
      updateScene(tabId, scene.id, { isGeneratingVideo: false });
      toast.error(`장면 ${scene.id} 동영상 생성 실패: ${err.message}`);
    }
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
            <span className="text-xs text-muted-foreground">생성 중...</span>
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
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Prompt (EN)
          </label>
          <textarea
            value={scene.promptEn}
            onChange={(e) => updateScene(tabId, scene.id, { promptEn: e.target.value })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            프롬프트 (KO)
          </label>
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
              value={scene.effectDuration}
              onChange={(e) =>
                updateScene(tabId, scene.id, { effectDuration: parseFloat(e.target.value) || 2.5 })
              }
              min={1}
              max={10}
              step={0.5}
              className="w-16 h-7 bg-background border border-border rounded px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">초</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleGenerateImage}
            disabled={scene.isGeneratingImage || !scene.promptEn}
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs border-border"
          >
            {scene.isGeneratingImage ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <><ImageIcon className="w-3 h-3 mr-1" /> 이미지</>
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
        </div>
      </div>
    </div>
  );
}
