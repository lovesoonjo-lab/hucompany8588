import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { generateImageKie, generateVideoKie } from '@/lib/api';
import {
  Loader2, ImageIcon, Upload, Wand2, Video, Mic, Film,
  Download, Package, Play
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRef, useMemo } from 'react';
import SceneSlotCard from './SceneSlotCard';
import Step5Audio from './Step5Audio';
import Step5Render from './Step5Render';
import Step5Thumbnail from './Step5Thumbnail';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface Step5Props {
  tabId: string;
}

export default function Step5Generate({ tabId }: Step5Props) {
  const { settings, tabs, updateTab, updateScene } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const promptUsageLabel = '[선택]';
  const selectedPromptLang: 'en' | 'ko' = tab.analyzeImagePromptLang === 'ko' ? 'ko' : 'en';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated } = useAuth();

  // 서버 프로젝트 모드일 때 캐릭터/배경 에셋 조회
  const serverCharacterAssets = trpc.asset.list.useQuery(
    { projectId: tab.serverProjectId!, category: 'character' },
    { enabled: tab.serverReferenceMode === 'server' && !!tab.serverProjectId && isAuthenticated }
  );

  // 이미지 생성용 캐릭터 참조 URL (로컬 vs 서버)
  const effectiveCharacterReferenceUrls = useMemo(() => {
    if (tab.serverReferenceMode === 'server' && tab.serverProjectId) {
      const charUrls = (serverCharacterAssets.data || []).map(a => a.fileUrl);
      return charUrls;
    }
    return tab.referenceImages && tab.referenceImages.length > 0
      ? tab.referenceImages.map(img => img.url)
      : undefined;
  }, [tab.serverReferenceMode, tab.serverProjectId, serverCharacterAssets.data, tab.referenceImages]);

  const buildCharacterLockedPrompt = (basePrompt: string) => {
    if (!effectiveCharacterReferenceUrls || effectiveCharacterReferenceUrls.length === 0) {
      return basePrompt;
    }
    return [
      basePrompt,
      '',
      'Character consistency requirements:',
      '- Keep the exact same character identity as the reference image(s).',
      '- Keep same face shape, hairstyle, glasses, hat, and hanbok silhouette.',
      '- Do not change character age, ethnicity, or core costume design.',
      '- Background and camera can vary, but character identity must remain locked.',
    ].join('\n');
  };

  const subTabs = [
    { id: 'images' as const, label: '이미지 작업', icon: ImageIcon },
    { id: 'audio' as const, label: '오디오 / 자막', icon: Mic },
    { id: 'render' as const, label: '영상 렌더링', icon: Film },
    { id: 'thumbnail' as const, label: '썸네일 만들기', icon: ImageIcon },
  ];

  // ===== Image Tab Actions =====
  const handleConsistencyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateTab(tabId, { consistencyImageUrl: url, consistencyImageFile: file });
    toast.success('캐릭터 참조 이미지가 업로드되었습니다.');
  };

  const handleBatchImages = async () => {
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }
    updateTab(tabId, { isBatchGeneratingImages: true });
    let success = 0, fail = 0;
    for (const scene of tab.scenes) {
      if (scene.imageUrl || !scene.promptEn) continue;
      updateScene(tabId, scene.id, { isGeneratingImage: true });
      try {
        const result = await generateImageKie(
          settings.kieApiKey,
          buildCharacterLockedPrompt(scene.promptEn),
          tab.selectedAspectRatio || tab.aspectRatio,
          effectiveCharacterReferenceUrls,
          tab.imageModel || 'nano-banana-2'
        );
        if (!result.resultUrl) throw new Error(result.failMsg || '이미지 생성 결과 URL이 없습니다.');
        updateScene(tabId, scene.id, {
          imageUrl: result.resultUrl,
          isGeneratingImage: false,
          imageTaskId: result.taskId,
          imageTaskState: result.state,
          imageError: null,
        });
        success++;
      } catch (err: any) {
        updateScene(tabId, scene.id, {
          isGeneratingImage: false,
          imageTaskState: 'fail',
          imageError: err?.message || '이미지 생성 실패',
        });
        fail++;
      }
    }
    updateTab(tabId, { isBatchGeneratingImages: false });
    toast.success(`이미지 생성 완료: ${success}개 성공, ${fail}개 실패`);
  };

  const handleBatchVideos = async () => {
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }
    const videoMode = settings.videoGenerationMode;
    if (videoMode === 'static_effect') {
      toast.info('정지 이미지 + 기본 효과 모드에서는 렌더링 탭에서 영상을 생성합니다.');
      return;
    }

    updateTab(tabId, { isBatchGeneratingVideos: true });
    let success = 0, fail = 0;
    for (const scene of tab.scenes) {
      if (scene.videoUrl || !scene.imageUrl) continue;
      updateScene(tabId, scene.id, { isGeneratingVideo: true });
      try {
        const result = await generateVideoKie(
          settings.kieApiKey,
          scene.imageUrl,
          scene.videoMotionPrompt,
          videoMode as any,
          tab.selectedAspectRatio || tab.aspectRatio
        );
        if (!result.resultUrl) throw new Error(result.failMsg || '동영상 생성 결과 URL이 없습니다.');
        updateScene(tabId, scene.id, {
          videoUrl: result.resultUrl,
          isGeneratingVideo: false,
          videoTaskId: result.taskId,
          videoTaskState: result.state,
          videoError: null,
        });
        success++;
      } catch (err: any) {
        updateScene(tabId, scene.id, {
          isGeneratingVideo: false,
          videoTaskState: 'fail',
          videoError: err?.message || '동영상 생성 실패',
        });
        fail++;
      }
    }
    updateTab(tabId, { isBatchGeneratingVideos: false });
    toast.success(`동영상 생성 완료: ${success}개 성공, ${fail}개 실패`);
  };

  if (tab.scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <ImageIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-2">장면이 없습니다</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          STEP 4에서 장면 분석을 먼저 실행해주세요. 분석이 완료되면 이미지, 오디오, 영상 작업을 진행할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 p-1 rounded-lg bg-secondary/30 border border-border">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => updateTab(tabId, { step5Tab: id })}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center',
              tab.step5Tab === id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Common action bar */}
      <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-secondary/20 border border-border">
        {/* Consistency image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleConsistencyUpload}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="border-border"
        >
          <Upload className="w-4 h-4 mr-1" /> 캐릭터 참조 이미지
        </Button>

        {tab.step5Tab === 'images' && (
          <>
            <Button
              size="sm"
              onClick={handleBatchImages}
              disabled={tab.isBatchGeneratingImages}
              className="bg-chart-4 hover:bg-chart-4/90 text-white"
            >
              {tab.isBatchGeneratingImages ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 생성 중...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-1" /> 일괄 이미지 생성</>
              )}
            </Button>
            {settings.videoGenerationMode !== 'static_effect' && (
              <Button
                size="sm"
                onClick={handleBatchVideos}
                disabled={tab.isBatchGeneratingVideos}
                className="bg-chart-5 hover:bg-chart-5/90 text-white"
              >
                {tab.isBatchGeneratingVideos ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 생성 중...</>
                ) : (
                  <><Video className="w-4 h-4 mr-1" /> 일괄 동영상 생성</>
                )}
              </Button>
            )}
          </>
        )}

        {tab.step5Tab === 'audio' && (
          <Button
            size="sm"
            disabled={tab.isBatchGeneratingAudios}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => toast.info('일괄 오디오 생성은 오디오 탭에서 실행해주세요.')}
          >
            {tab.isBatchGeneratingAudios ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 생성 중...</>
            ) : (
              <><Mic className="w-4 h-4 mr-1" /> 일괄 오디오 생성</>
            )}
          </Button>
        )}

        {tab.step5Tab === 'render' && (
          <>
            <Button
              size="sm"
              disabled={tab.isGeneratingFinalVideo}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => toast.info('최종 영상 생성은 렌더링 탭에서 실행해주세요.')}
            >
              {tab.isGeneratingFinalVideo ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 렌더링 중...</>
              ) : (
                <><Play className="w-4 h-4 mr-1" /> 최종 영상 생성</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-border"
              onClick={() => toast.info('ZIP 다운로드 기능은 영상 렌더링 완료 후 사용 가능합니다.')}
            >
              <Package className="w-4 h-4 mr-1" /> ZIP 다운로드
            </Button>
          </>
        )}

        {tab.step5Tab === 'thumbnail' && (
          <Button
            size="sm"
            variant="outline"
            className="border-border"
            onClick={() => toast.info('썸네일 생성은 썸네일 만들기 탭에서 실행해주세요.')}
          >
            <ImageIcon className="w-4 h-4 mr-1" /> 썸네일 생성
          </Button>
        )}
      </div>

      {/* Reference image preview */}
      {effectiveCharacterReferenceUrls && effectiveCharacterReferenceUrls.length > 0 && (
        <div className="p-3 rounded-lg bg-secondary/20 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            캐릭터 참조 이미지 ({effectiveCharacterReferenceUrls.length}장)
          </p>
          <div className="flex flex-wrap items-start gap-[15px] rounded-md">
            {effectiveCharacterReferenceUrls.slice(0, 10).map((url, idx) => (
              <div key={`${url}-${idx}`} className="w-16 h-16 overflow-hidden shrink-0">
                <img src={url} alt={`참조 ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          {effectiveCharacterReferenceUrls.length > 10 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              외 {effectiveCharacterReferenceUrls.length - 10}장도 이미지 생성 시 함께 참조됩니다.
            </p>
          )}
        </div>
      )}

      {/* Tab content */}
      {tab.step5Tab === 'images' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tab.scenes.map((scene) => (
            <SceneSlotCard
              key={scene.id}
              tabId={tabId}
              scene={scene}
              showEffects={settings.videoGenerationMode === 'static_effect'}
              aspectRatio={tab.selectedAspectRatio || tab.aspectRatio}
              referenceImageUrls={effectiveCharacterReferenceUrls}
              imageModel={tab.imageModel}
              promptUsageLabel={promptUsageLabel}
              selectedPromptLang={selectedPromptLang}
            />
          ))}
        </div>
      )}

      {tab.step5Tab === 'audio' && (
        <Step5Audio tabId={tabId} />
      )}

      {tab.step5Tab === 'render' && (
        <Step5Render tabId={tabId} />
      )}

      {tab.step5Tab === 'thumbnail' && (
        <Step5Thumbnail tabId={tabId} />
      )}
    </div>
  );
}
