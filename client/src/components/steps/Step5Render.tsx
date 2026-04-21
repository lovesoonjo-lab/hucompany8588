import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Film, Play, Download, Package, Loader2,
  ImageIcon, Mic, Video, ArrowRight, CheckCircle2, AlertCircle,
  Clapperboard, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

interface Step5RenderProps {
  tabId: string;
}

export default function Step5Render({ tabId }: Step5RenderProps) {
  const { tabs, updateTab, updateScene, settings } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderPhase, setRenderPhase] = useState('');

  // tRPC mutations
  const imageToStaticVideoMutation = trpc.video.imageToStaticVideo.useMutation();
  const renderFinalMutation = trpc.video.renderFinal.useMutation();

  const totalScenes = tab.scenes.length;
  const imagesReady = tab.scenes.filter((s) => s.imageUrl).length;
  const videosReady = tab.scenes.filter((s) => s.videoUrl).length;
  const audiosReady = tab.scenes.filter((s) => s.audioUrl).length;
  const allImagesReady = imagesReady === totalScenes;
  const allAudiosReady = audiosReady === totalScenes;

  const isStaticMode = settings.videoGenerationMode === 'static_effect';
  const isAIVideoMode = !isStaticMode;
  const allVideosReady = isAIVideoMode ? videosReady === totalScenes : true;

  // 정지 이미지 모드: 이미지 + 오디오 필요
  // AI 동영상 모드: 동영상 + 오디오 필요
  const canRender = isStaticMode
    ? allImagesReady && allAudiosReady
    : allImagesReady && allAudiosReady && allVideosReady;

  // 정지 이미지 → 정지 영상 변환 (서버 FFmpeg)
  const handleBatchStaticVideos = async () => {
    updateTab(tabId, { isBatchGeneratingVideos: true });
    let success = 0, fail = 0;

    for (const scene of tab.scenes) {
      if (scene.videoUrl || !scene.imageUrl) continue;
      updateScene(tabId, scene.id, { isGeneratingVideo: true });

      try {
        const duration = scene.audioDuration > 0 ? scene.audioDuration : (scene.effectDuration || 3);
        const result = await imageToStaticVideoMutation.mutateAsync({
          imageUrl: scene.imageUrl,
          effectType: scene.effectType || 'zoom-in',
          duration,
        });
        updateScene(tabId, scene.id, {
          videoUrl: result.videoUrl,
          isGeneratingVideo: false,
        });
        success++;
      } catch (err: any) {
        updateScene(tabId, scene.id, { isGeneratingVideo: false });
        fail++;
      }
    }

    updateTab(tabId, { isBatchGeneratingVideos: false });
    if (success > 0) toast.success(`정지 영상 변환 완료: ${success}개 성공${fail > 0 ? `, ${fail}개 실패` : ''}`);
    else if (fail > 0) toast.error(`정지 영상 변환 실패: ${fail}개`);
    else toast.info('변환할 장면이 없습니다.');
  };

  // 최종 영상 렌더링
  const handleRenderFinal = async () => {
    if (!canRender) {
      toast.error('모든 소스가 준비되어야 최종 영상을 생성할 수 있습니다.');
      return;
    }

    updateTab(tabId, { isGeneratingFinalVideo: true });
    setRenderProgress(0);
    setRenderPhase('렌더링 준비 중...');

    try {
      const scenesData = tab.scenes.map((s) => ({
        id: s.id,
        imageUrl: s.imageUrl!,
        videoUrl: s.videoUrl || undefined,
        audioUrl: s.audioUrl!,
        effectType: s.effectType,
        effectDuration: s.effectDuration,
        audioDuration: s.audioDuration,
        subtitleScenes: s.subtitleScenes,
        subtitleFont: s.subtitleFont || 'Pretendard',
        subtitleSize: s.subtitleSize || 48,
        subtitlePosition: s.subtitlePosition || 90,
        subtitleColor: s.subtitleColor || '#FFFFFF',
        subtitleOutline: s.subtitleOutline !== false,
        subtitleOutlineWidth: s.subtitleOutlineWidth || 2,
        subtitleBg: s.subtitleBg || 'none',
      }));

      setRenderPhase('서버에서 영상 합성 중...');
      setRenderProgress(30);

      const result = await renderFinalMutation.mutateAsync({
        scenes: scenesData.map(s => ({
          videoUrl: s.videoUrl,
          audioUrl: s.audioUrl,
          subtitleScenes: s.subtitleScenes,
          duration: s.audioDuration || s.effectDuration,
          subtitleFont: s.subtitleFont,
          subtitleSize: s.subtitleSize,
          subtitlePosition: s.subtitlePosition,
          subtitleColor: s.subtitleColor,
          subtitleOutline: s.subtitleOutline,
          subtitleOutlineWidth: s.subtitleOutlineWidth,
          subtitleBg: s.subtitleBg,
        })),
      });

      setRenderProgress(100);
      setRenderPhase('완료!');

      updateTab(tabId, {
        finalVideoUrl: result.videoUrl,
        isGeneratingFinalVideo: false,
      });

      toast.success('최종 영상이 생성되었습니다!');

      setTimeout(() => {
        setRenderProgress(0);
        setRenderPhase('');
      }, 3000);
    } catch (err: any) {
      setRenderProgress(0);
      setRenderPhase('');
      updateTab(tabId, { isGeneratingFinalVideo: false });
      toast.error(`렌더링 실패: ${err.message}`);
    }
  };

  const staticVideosReady = tab.scenes.filter((s) => s.videoUrl).length;

  return (
    <div className="space-y-4">
      {/* Readiness overview */}
      <div className="p-3 rounded-lg bg-secondary/20 border border-border space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          렌더링 준비 상태
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Images status */}
          <div className={cn(
            'p-2.5 rounded-lg border flex items-center gap-2',
            allImagesReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
          )}>
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              allImagesReady ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            )}>
              <ImageIcon className={cn('w-4 h-4', allImagesReady ? 'text-emerald-400' : 'text-amber-400')} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium">이미지</p>
              <p className="text-[10px] text-muted-foreground">{imagesReady}/{totalScenes}</p>
            </div>
            {allImagesReady ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
          </div>

          {/* Audio status */}
          <div className={cn(
            'p-2.5 rounded-lg border flex items-center gap-2',
            allAudiosReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
          )}>
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              allAudiosReady ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            )}>
              <Mic className={cn('w-4 h-4', allAudiosReady ? 'text-emerald-400' : 'text-amber-400')} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium">오디오</p>
              <p className="text-[10px] text-muted-foreground">{audiosReady}/{totalScenes}</p>
            </div>
            {allAudiosReady ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
          </div>

          {/* Video status */}
          <div className={cn(
            'p-2.5 rounded-lg border flex items-center gap-2',
            isStaticMode
              ? (staticVideosReady === totalScenes ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-secondary/10')
              : (allVideosReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')
          )}>
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              (isStaticMode ? staticVideosReady === totalScenes : allVideosReady) ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            )}>
              <Video className={cn('w-4 h-4', (isStaticMode ? staticVideosReady === totalScenes : allVideosReady) ? 'text-emerald-400' : 'text-amber-400')} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium">{isStaticMode ? '정지 영상' : 'AI 동영상'}</p>
              <p className="text-[10px] text-muted-foreground">{isStaticMode ? staticVideosReady : videosReady}/{totalScenes}</p>
            </div>
            {(isStaticMode ? staticVideosReady === totalScenes : allVideosReady) ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
        </div>
      </div>

      {/* 정지 이미지 → 영상 변환 버튼 (static_effect 모드) */}
      {isStaticMode && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-semibold">정지 이미지 → 영상 변환</p>
                <p className="text-[10px] text-muted-foreground">
                  이미지에 {settings.defaultEffectType || 'zoom-in'} 효과를 적용하여 TTS 길이에 맞는 영상 클립을 생성합니다.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleBatchStaticVideos}
              disabled={tab.isBatchGeneratingVideos || !allImagesReady}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs"
            >
              {tab.isBatchGeneratingVideos ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 변환 중...</>
              ) : (
                <><Zap className="w-3 h-3 mr-1" /> 일괄 변환 ({totalScenes - staticVideosReady}개)</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Scene timeline */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold">장면 타임라인</h4>
        <div className="space-y-1">
          {tab.scenes.map((scene) => {
            const hasImage = !!scene.imageUrl;
            const hasAudio = !!scene.audioUrl;
            const hasVideo = !!scene.videoUrl;
            return (
              <div
                key={scene.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border"
              >
                <span className="w-6 h-6 rounded bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                  {scene.id}
                </span>

                {/* Image thumbnail */}
                <div className={cn(
                  'w-12 h-8 rounded border shrink-0 flex items-center justify-center overflow-hidden',
                  hasImage ? 'border-emerald-500/30' : 'border-border bg-secondary/30'
                )}>
                  {hasImage ? (
                    <img src={scene.imageUrl!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>

                <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />

                {/* Audio indicator */}
                <div className={cn(
                  'w-8 h-8 rounded border flex items-center justify-center shrink-0',
                  hasAudio ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-secondary/30'
                )}>
                  <Mic className={cn('w-3 h-3', hasAudio ? 'text-emerald-400' : 'text-muted-foreground')} />
                </div>

                <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />

                {/* Video indicator */}
                <div className={cn(
                  'w-12 h-8 rounded border flex items-center justify-center shrink-0 overflow-hidden',
                  hasVideo ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-secondary/30'
                )}>
                  {hasVideo ? (
                    <Video className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Video className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>

                {/* Scene info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate">
                    {scene.promptKo || scene.promptEn || '(프롬프트 없음)'}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60">
                    {scene.effectType} · {scene.audioDuration > 0 ? `${scene.audioDuration.toFixed(1)}s` : `${scene.effectDuration}s`}
                  </p>
                </div>

                {/* Status dots */}
                <div className="flex gap-0.5 shrink-0">
                  {hasImage && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="이미지" />}
                  {hasAudio && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="오디오" />}
                  {hasVideo && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="영상" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Render progress */}
      {renderProgress > 0 && (
        <div className="space-y-1.5">
          <div className="relative">
            <Progress value={renderProgress} className="h-3 bg-muted/50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white drop-shadow-sm">{renderProgress}%</span>
            </div>
          </div>
          {renderPhase && (
            <p className={cn(
              "text-xs text-center",
              renderProgress === 100 ? "text-green-400 font-medium" : "text-muted-foreground"
            )}>
              {renderPhase}
            </p>
          )}
        </div>
      )}

      {/* Render actions */}
      <div className="p-3 rounded-lg bg-secondary/20 border border-border space-y-2">
        <h4 className="text-xs font-semibold">최종 영상 생성</h4>
        {!canRender && (
          <p className="text-[10px] text-amber-400">
            {isStaticMode
              ? '모든 이미지와 오디오가 준비되어야 최종 영상을 생성할 수 있습니다.'
              : '모든 이미지, 오디오, AI 동영상이 준비되어야 최종 영상을 생성할 수 있습니다.'}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!canRender || tab.isGeneratingFinalVideo}
            className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs"
            onClick={handleRenderFinal}
          >
            {tab.isGeneratingFinalVideo ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 렌더링 중...</>
            ) : (
              <><Play className="w-3 h-3 mr-1" /> 최종 영상 생성</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border h-8 text-xs"
            disabled={!tab.finalVideoUrl}
            onClick={() => {
              if (tab.finalVideoUrl) {
                const a = document.createElement('a');
                a.href = tab.finalVideoUrl;
                a.download = `final_video_${tab.id}.mp4`;
                a.click();
              }
            }}
          >
            <Package className="w-3 h-3 mr-1" /> ZIP 다운로드
          </Button>
        </div>
      </div>

      {/* Final video preview */}
      {tab.finalVideoUrl && (
        <div className="p-3 rounded-lg bg-secondary/20 border border-primary/30 space-y-2">
          <h4 className="text-xs font-semibold flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            최종 영상 미리보기
          </h4>
          <div className="rounded-lg overflow-hidden border border-border aspect-video bg-black">
            <video
              src={tab.finalVideoUrl}
              controls
              className="w-full h-full"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-border h-8 text-xs"
            onClick={() => {
              const a = document.createElement('a');
              a.href = tab.finalVideoUrl!;
              a.download = `final_video_${tab.id}.mp4`;
              a.click();
            }}
          >
            <Download className="w-3 h-3 mr-1" /> 최종 영상 다운로드
          </Button>
        </div>
      )}
    </div>
  );
}
