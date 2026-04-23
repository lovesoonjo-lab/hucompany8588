import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/lib/store';
import { callGemini, generateImageKie } from '@/lib/api';
import { ImageIcon, Loader2, CheckCircle2, RefreshCw, Search, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Step5ThumbnailProps {
  tabId: string;
}

const THUMBNAIL_VARIATIONS = [
  'high contrast cinematic YouTube thumbnail, dramatic lighting, eye-catching composition, bold headline area',
  'bold emotional close-up, high detail, vivid colors, clean focus, dynamic storytelling frame',
  'professional thumbnail style, strong depth, cinematic framing, crisp subject, editorial visual hierarchy',
];

export default function Step5Thumbnail({ tabId }: Step5ThumbnailProps) {
  const { tabs, updateTab, settings } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const [localPrompt, setLocalPrompt] = useState(tab.thumbnailPrompt || '');
  const [isAnalyzingPhrases, setIsAnalyzingPhrases] = useState(false);
  const [isAnalyzingScenes, setIsAnalyzingScenes] = useState(false);
  const generationAbortRef = useRef<AbortController | null>(null);

  const basePromptSuggestion = useMemo(() => {
    const scene = tab.scenes.find((s) => s.promptEn?.trim())?.promptEn;
    if (scene) return scene;
    if (tab.title?.trim()) return `${tab.title.trim()}, YouTube thumbnail, cinematic composition`;
    if (tab.script?.trim()) return `${tab.script.slice(0, 140)}, YouTube thumbnail, strong visual impact`;
    return 'Korean YouTube psychology thumbnail, emotional character expression, cinematic mood, high contrast';
  }, [tab.scenes, tab.title, tab.script]);

  useEffect(() => {
    if (!tab.thumbnailPrompt?.trim()) {
      setLocalPrompt(basePromptSuggestion);
      updateTab(tabId, { thumbnailPrompt: basePromptSuggestion });
      return;
    }
    setLocalPrompt(tab.thumbnailPrompt);
  }, [basePromptSuggestion, tab.thumbnailPrompt, tabId, updateTab]);

  const activeCandidate = tab.selectedThumbnailUrl || tab.thumbnailCandidates[0] || null;
  const sourceScript = (tab.rawScript || tab.script || '').trim();
  const sceneCandidates = tab.thumbnailSceneCandidates
    .map((id) => tab.scenes.find((s) => s.id === id))
    .filter(Boolean);

  const handleAnalyzePhrases = async () => {
    if (!sourceScript) {
      toast.error('업로드한 대본이 없습니다. STEP1에서 대본을 먼저 준비해주세요.');
      return;
    }
    setIsAnalyzingPhrases(true);
    try {
      const prompt = [
        `다음 대본에서 썸네일에 들어갈 짧고 강한 문구 ${tab.thumbnailPhraseCount}개를 뽑아줘.`,
        '규칙:',
        '- 각 문구는 한국어 8~18자',
        '- 클릭 유도형, 감정 유도형으로 작성',
        '- 번호/괄호/이모지 없이 순수 문구만',
        '- 반드시 JSON 배열만 출력: ["문구1","문구2",...]',
        '',
        '[대본]',
        sourceScript.slice(0, 5000),
      ].join('\n');

      const raw = await callGemini(settings.geminiApiKey || '', settings.geminiModel, prompt);
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''));
      const candidates = Array.isArray(parsed)
        ? parsed.map((v) => String(v).trim()).filter(Boolean).slice(0, tab.thumbnailPhraseCount)
        : [];

      if (candidates.length === 0) {
        throw new Error('문구 분석 결과를 파싱하지 못했습니다.');
      }

      updateTab(tabId, {
        thumbnailPhraseCandidates: candidates,
        selectedThumbnailPhrase: candidates[0],
      });
      toast.success(`문구 ${candidates.length}개를 분석했습니다.`);
    } catch (err: any) {
      toast.error(err?.message || '문구 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzingPhrases(false);
    }
  };

  const handleAnalyzeScenes = async () => {
    const imageScenes = tab.scenes.filter((s) => !!s.imageUrl);
    if (imageScenes.length === 0) {
      toast.error('이미지 작업에서 생성된 장면 이미지가 없습니다.');
      return;
    }
    if (!tab.selectedThumbnailPhrase) {
      toast.error('먼저 썸네일 문구를 선택해주세요.');
      return;
    }

    setIsAnalyzingScenes(true);
    try {
      const scenePayload = imageScenes.map((s) => ({
        id: s.id,
        promptKo: s.promptKo,
        promptEn: s.promptEn,
      }));
      const prompt = [
        '아래 장면 목록에서 썸네일 문구와 가장 잘 맞는 장면 ID 5개를 추천해줘.',
        `썸네일 문구: ${tab.selectedThumbnailPhrase}`,
        '규칙:',
        '- 장면 id 숫자만 JSON 배열로 출력',
        '- 정확히 5개 추천 (부족하면 가능한 개수만)',
        '- 예시: [3,7,2,9,5]',
        '',
        JSON.stringify(scenePayload),
      ].join('\n');

      const raw = await callGemini(settings.geminiApiKey || '', settings.geminiModel, prompt);
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''));
      const recommended = Array.isArray(parsed)
        ? parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n))
        : [];

      const validIds = recommended.filter((id) => imageScenes.some((s) => s.id === id));
      const dedup = Array.from(new Set(validIds)).slice(0, 5);
      const fallback = imageScenes.slice(0, 5).map((s) => s.id);
      const finalIds = dedup.length > 0 ? dedup : fallback;

      updateTab(tabId, {
        thumbnailSceneCandidates: finalIds,
        selectedThumbnailSceneId: finalIds[0] ?? null,
      });
      toast.success(`썸네일 장면 ${finalIds.length}개를 추천했습니다.`);
    } catch (err: any) {
      toast.error(err?.message || '장면 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzingScenes(false);
    }
  };

  const handleGenerateThumbnails = async () => {
    const prompt = localPrompt.trim();
    if (!prompt) {
      toast.error('썸네일 프롬프트를 입력해주세요.');
      return;
    }
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }

    if (!tab.selectedThumbnailPhrase) {
      toast.error('썸네일 문구를 먼저 선택해주세요.');
      return;
    }

    const selectedScene = tab.scenes.find((s) => s.id === tab.selectedThumbnailSceneId);
    if (!selectedScene?.imageUrl) {
      toast.error('썸네일 장면을 먼저 선택해주세요.');
      return;
    }

    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    updateTab(tabId, {
      thumbnailPrompt: prompt,
      isGeneratingThumbnails: true,
      thumbnailCandidates: [],
      selectedThumbnailUrl: null,
      thumbnailProgress: 0,
      thumbnailStatus: '썸네일 생성 준비 중...',
      thumbnailError: null,
    });

    const candidates: string[] = [];
    let failCount = 0;

    for (const variation of THUMBNAIL_VARIATIONS) {
      try {
        const progressBase = Math.round((candidates.length / THUMBNAIL_VARIATIONS.length) * 100);
        updateTab(tabId, {
          thumbnailProgress: Math.max(progressBase, 5),
          thumbnailStatus: `썸네일 ${candidates.length + 1}/${THUMBNAIL_VARIATIONS.length} 생성 중...`,
        });
        const result = await generateImageKie(
          settings.kieApiKey,
          [
            `Thumbnail headline (Korean): ${tab.selectedThumbnailPhrase}`,
            `Base concept: ${prompt}`,
            `Scene context: ${selectedScene.promptEn || selectedScene.promptKo || ''}`,
            `Style guide: ${variation}`,
            'Design requirement: leave clear text-safe area, high readability, click-worthy YouTube thumbnail composition.',
          ].join('\n'),
          tab.thumbnailAspectRatio || '16:9',
          [selectedScene.imageUrl],
          tab.imageModel || 'nano-banana-2',
          { signal: abortController.signal }
        );
        if (result.resultUrl) candidates.push(result.resultUrl);
        else failCount += 1;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          updateTab(tabId, {
            isGeneratingThumbnails: false,
            thumbnailProgress: 0,
            thumbnailStatus: '',
            thumbnailError: '사용자가 썸네일 생성을 중지했습니다.',
          });
          toast.info('썸네일 생성을 중지했습니다.');
          generationAbortRef.current = null;
          return;
        }
        failCount += 1;
      }
    }

    if (candidates.length === 0) {
      updateTab(tabId, {
        isGeneratingThumbnails: false,
        thumbnailProgress: 0,
        thumbnailStatus: '',
        thumbnailError: '썸네일 생성에 실패했습니다.',
      });
      toast.error('썸네일 생성에 실패했습니다. 프롬프트를 수정 후 다시 시도해주세요.');
      generationAbortRef.current = null;
      return;
    }

    updateTab(tabId, {
      isGeneratingThumbnails: false,
      thumbnailCandidates: candidates,
      selectedThumbnailUrl: candidates[0],
      thumbnailProgress: 100,
      thumbnailStatus: '완료',
      thumbnailError: null,
    });
    toast.success(`썸네일 ${candidates.length}개 생성 완료${failCount > 0 ? ` (${failCount}개 실패)` : ''}`);
    generationAbortRef.current = null;
  };

  const handleCancelThumbnailGeneration = () => {
    if (!tab.isGeneratingThumbnails) return;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
  };

  const handleSelectCandidate = (url: string) => {
    updateTab(tabId, { selectedThumbnailUrl: url });
  };

  const handleResetCandidates = () => {
    updateTab(tabId, {
      thumbnailCandidates: [],
      selectedThumbnailUrl: null,
    });
    toast.success('썸네일 후보를 초기화했습니다.');
  };

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-secondary/20 border border-border space-y-2">
        <h4 className="text-sm font-semibold">업로드한 대본</h4>
        <Textarea
          value={sourceScript}
          readOnly
          placeholder="업로드한 대본이 없습니다."
          className="min-h-[90px] bg-background/60 text-xs"
        />

        <h4 className="text-sm font-semibold pt-1">썸네일 문구 개수 선택</h4>
        <div className="flex gap-2">
          {[3, 4, 5].map((count) => (
            <Button
              key={count}
              size="sm"
              variant={tab.thumbnailPhraseCount === count ? 'default' : 'outline'}
              onClick={() => updateTab(tabId, { thumbnailPhraseCount: count as 3 | 4 | 5 })}
            >
              {count}개
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleAnalyzePhrases}
            disabled={isAnalyzingPhrases}
          >
            {isAnalyzingPhrases ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 분석 중...</> : <><Search className="w-4 h-4 mr-1" /> 문구 분석하기</>}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyzeScenes}
            disabled={isAnalyzingScenes}
          >
            {isAnalyzingScenes ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 분석 중...</> : <><ImageIcon className="w-4 h-4 mr-1" /> 썸네일 이미지 분석하기</>}
          </Button>
        </div>
        {tab.thumbnailPhraseCandidates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tab.thumbnailPhraseCandidates.map((phrase, idx) => {
              const isSelected = tab.selectedThumbnailPhrase === phrase;
              return (
                <button
                  key={`${phrase}-${idx}`}
                  type="button"
                  onClick={() => updateTab(tabId, { selectedThumbnailPhrase: phrase })}
                  className={cn(
                    'text-left p-2 rounded border text-xs transition-all',
                    isSelected ? 'border-primary bg-primary/10' : 'border-border bg-background/60 hover:border-primary/40'
                  )}
                >
                  {phrase}
                </button>
              );
            })}
          </div>
        )}
        {sceneCandidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">추천 썸네일 장면 (최대 5개)</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {sceneCandidates.map((scene) => {
                if (!scene) return null;
                const isSelected = tab.selectedThumbnailSceneId === scene.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => updateTab(tabId, { selectedThumbnailSceneId: scene.id })}
                    className={cn(
                      'rounded-md overflow-hidden border transition-all',
                      isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40'
                    )}
                  >
                    <div className="aspect-video bg-black">
                      <img src={scene.imageUrl!} alt={`scene-${scene.id}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="px-1.5 py-1 text-[10px] text-muted-foreground bg-card">장면 #{scene.id}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <h4 className="text-sm font-semibold">썸네일 프롬프트</h4>
        <Textarea
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          placeholder="썸네일 분위기, 인물 표정, 핵심 메시지를 입력하세요."
          className="min-h-[110px] bg-background/80"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={tab.isGeneratingThumbnails ? handleCancelThumbnailGeneration : handleGenerateThumbnails}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {tab.isGeneratingThumbnails ? (
              <><Square className="w-4 h-4 mr-1" /> 중지</>
            ) : (
              <><ImageIcon className="w-4 h-4 mr-1" /> 썸네일 생성하기</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetCandidates}
            disabled={tab.isGeneratingThumbnails || tab.thumbnailCandidates.length === 0}
            className="border-border"
          >
            <RefreshCw className="w-4 h-4 mr-1" /> 후보 초기화
          </Button>
        </div>
        {(tab.thumbnailProgress > 0 || tab.thumbnailStatus || tab.thumbnailError) && (
          <div className="space-y-1.5">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(tab.thumbnailProgress, 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tab.thumbnailStatus || '대기 중'} ({tab.thumbnailProgress}%)
            </p>
            {tab.thumbnailError && (
              <p className="text-[11px] text-destructive">{tab.thumbnailError}</p>
            )}
          </div>
        )}
      </div>

      {activeCandidate && (
        <div className="p-3 rounded-lg bg-secondary/20 border border-primary/30 space-y-2">
          <h4 className="text-xs font-semibold">선택된 썸네일</h4>
          <div className="rounded-lg overflow-hidden border border-border bg-black aspect-video">
            <img src={activeCandidate} alt="선택된 썸네일" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {tab.thumbnailCandidates.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">썸네일 후보 ({tab.thumbnailCandidates.length}개)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tab.thumbnailCandidates.map((url, index) => {
              const isSelected = url === tab.selectedThumbnailUrl;
              return (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => handleSelectCandidate(url)}
                  className={cn(
                    'relative rounded-lg overflow-hidden border transition-all text-left',
                    isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="aspect-video bg-black">
                    <img src={url} alt={`썸네일 후보 ${index + 1}`} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-2 py-1.5 bg-card flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">후보 {index + 1}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
