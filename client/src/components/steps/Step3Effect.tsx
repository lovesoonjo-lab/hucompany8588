import { useRef, useState } from 'react';
import { useAppStore, type ImageEffectMode, type ImageStyle, type AspectRatio, type VideoGenerationMode, type EffectType, IMAGE_STYLE_LABELS, IMAGE_MODELS, getMaxReferenceImages } from '@/lib/store';
import { ImageIcon, Video, Sparkles, RectangleHorizontal, RectangleVertical, Square, Palette, Monitor, Clapperboard, Upload, X, User, Plus, Images, FolderOpen, Loader2, Database, HardDrive, Wand2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { generateImageKie } from '@/lib/api';



interface Step3Props {
  tabId: string;
}

const imageStyles: ImageStyle[] = [
  'cartoon',
];

// 각 스타일을 대표하는 예시 이미지 URL
// Picsum 기반 안정적 이미지 URL (각 스타일 특성 반영)
const IMAGE_STYLE_PREVIEWS: Record<ImageStyle, string> = {
  // 레퍼런스 이미지: 인물 클로즈업 사진
  'reference': 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=160&h=120&fit=crop&auto=format&q=60',
  // 인물 풍성: 풍성한 헤어의 남성 인물
  'rich-portrait': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=160&h=120&fit=crop&auto=format&q=60',
  // 내추럴: 자연스러운 여성 포트레이트
  'natural': 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=160&h=120&fit=crop&auto=format&q=60',
  // 에디토리얼: 패션 에디토리얼
  'editorial': 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=160&h=120&fit=crop&auto=format&q=60',
  // 일러스트: 컬러풀한 디지털 아트
  'illustration': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&h=120&fit=crop&auto=format&q=60',
  // 캐릭터+실사배경: 실사 배경 위 캐릭터 합성 느낌
  'character-real-bg': 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=160&h=120&fit=crop&auto=format&q=60',
  // 3D 캐릭터: 3D 렌더링 (Picsum 안정적 ID)
  '3d-character': 'https://picsum.photos/seed/3dchar/160/120',
  // 리소그래프: 꽃 프린트 스타일
  'risograph': 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=160&h=120&fit=crop&auto=format&q=60',
  // 픽셀아트: 레트로 게임 스타일
  'pixel-art': 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=160&h=120&fit=crop&auto=format&q=60',
  // 유화: 고전 회화 스타일
  'oil-painting': 'https://images.unsplash.com/photo-1579783901586-d88db74b4fe4?w=160&h=120&fit=crop&auto=format&q=60',
  // 한국 전통화: 한국 전통 문화
  'korean-traditional': 'https://images.unsplash.com/photo-1583623025817-d180a2221d0a?w=160&h=120&fit=crop&auto=format&q=60',
  // 카툰: 만화 스타일
  'cartoon': 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=160&h=120&fit=crop&auto=format&q=60',
  // 팝 초현실: 초현실적 팝 아트 (Picsum)
  'pop-surreal': 'https://picsum.photos/seed/popsurreal/160/120',
  // 비브런트 필름: 선명한 색감 도시 야경
  'vibrant-film': 'https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=160&h=120&fit=crop&auto=format&q=60',
  // 패션 포토: 하이패션 포즈
  'fashion-photo': 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=160&h=120&fit=crop&auto=format&q=60',
  // 글리치 콜라주: 사이버펑크 네온 (Picsum)
  'glitch-collage': 'https://picsum.photos/seed/glitch/160/120',
  // 레트로 필름: 빈티지 카메라 필름
  'retro-film': 'https://images.unsplash.com/photo-1495121553079-4c61bcce1894?w=160&h=120&fit=crop&auto=format&q=60',
  // 크로스프로세스: 독특한 색조 자연
  'cross-process': 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=160&h=120&fit=crop&auto=format&q=60',
  // 와일드 풍경: 드라마틱 자연 풍경
  'wild-landscape': 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=160&h=120&fit=crop&auto=format&q=60',
  // 볼드 라인: 강렬한 라인 아트 (Picsum)
  'bold-line': 'https://picsum.photos/seed/boldline/160/120',
  // 수채화: 수채화 꽃 그림
  'watercolor': 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=160&h=120&fit=crop&auto=format&q=60',
};


const aspectRatios: { value: AspectRatio; label: string; icon: React.ElementType; desc: string }[] = [
  { value: '16:9', label: '16:9', icon: RectangleHorizontal, desc: '가로형 (유튜브)' },
  { value: '9:16', label: '9:16', icon: RectangleVertical, desc: '세로형 (쇼츠)' },
  { value: '1:1', label: '1:1', icon: Square, desc: '정사각형' },
  { value: '4:3', label: '4:3', icon: RectangleHorizontal, desc: '클래식 가로' },
  { value: '3:4', label: '3:4', icon: RectangleVertical, desc: '클래식 세로' },
];

// 6가지 영상 생성 방식 카드 데이터
const VIDEO_GENERATION_MODES: {
  id: VideoGenerationMode;
  name: string;
  tag: string;
  cost: string;
  description: string;
}[] = [
  {
    id: 'static_effect',
    name: '정지 이미지 + 기본 효과',
    tag: '심리학 / 교육 / 나레이션',
    cost: '무료',
    description: '이미지를 그대로 유지하면서 줌, 패닝, 페이드 등의 카메라 효과를 서버에서 직접 처리합니다. 추가 비용이 없습니다.',
  },
  {
    id: 'kling_standard',
    name: 'Kling 2.1 Standard',
    tag: '일반 / 자연스러운 움직임',
    cost: '5초당 약 $0.125 (약 180원)',
    description: 'AI가 이미지를 분석해서 자연스럽게 움직이는 영상을 생성합니다. 720p 해상도로 비용 효율이 높습니다.',
  },
  {
    id: 'kling_pro',
    name: 'Kling 2.1 Pro',
    tag: '캐릭터 / 만화 / 일관성',
    cost: '5초당 약 $0.25 (약 360원)',
    description: '1080p 고해상도로 캐릭터 움직임이 자연스럽습니다. 만화 스타일 캐릭터 콘텐츠에 적합합니다.',
  },
  {
    id: 'veo3_fast',
    name: 'Veo 3.1 Fast',
    tag: '심리학 고퀄 / 오디오 포함',
    cost: '8초당 약 $0.40 (약 580원)',
    description: 'Google DeepMind의 최신 모델로 영상과 오디오를 동시에 생성합니다. 심리학·교육 콘텐츠의 고퀄리티 제작에 적합합니다.',
  },
  {
    id: 'veo3_quality',
    name: 'Veo 3.1 Quality',
    tag: '실사 / 다큐멘터리 / 영화',
    cost: '8초당 약 $2.00 (약 2,900원)',
    description: '1080p 시네마틱 실사 품질. 실제 사람이나 자연 풍경을 실감나게 표현할 때 최적입니다.',
  },
  {
    id: 'runway_gen4',
    name: 'Runway Gen 4 Turbo',
    tag: '크리에이티브 / 예술적 연출',
    cost: '5~8초당 약 $0.50 (약 730원)',
    description: '창의적인 카메라 연출과 예술적 스타일 변환이 강점입니다. 독특한 분위기의 영상 콘텐츠에 적합합니다.',
  },
];

// 10가지 기본 효과 데이터
const DEFAULT_EFFECTS: { id: EffectType; label: string; description: string }[] = [
  { id: 'fade-in', label: '\ud83c\udf05 페이드인', description: '화면이 서서히 밝아짐' },
  { id: 'fade-out', label: '\ud83c\udf07 페이드아웃', description: '화면이 서서히 어두워짐' },
  { id: 'fade-in-hold', label: '\ud83c\udf04 페이드인 후 고정', description: '밝아진 뒤 정지 유지' },
  { id: 'zoom-in', label: '\ud83d\udd0d 줌인', description: '중앙으로 서서히 확대' },
  { id: 'zoom-in-slow', label: '\ud83d\udd0e 줌인 천천히', description: 'zoom-in보다 느리게 확대' },
  { id: 'zoom-out', label: '\ud83d\uddfa\ufe0f 줌아웃', description: '확대 상태에서 서서히 축소' },
  { id: 'hold', label: '\u23f8\ufe0f 고정', description: '움직임 없이 그대로 유지' },
  { id: 'pan-left-to-right', label: '\u27a1\ufe0f 좌→우 패닝', description: '화면이 왼쪽에서 오른쪽으로 이동' },
  { id: 'pan-right-to-left', label: '\u2b05\ufe0f 우→좌 패닝', description: '화면이 오른쪽에서 왼쪽으로 이동' },
  { id: 'shake', label: '\ud83d\udcf3 흔들림', description: '카메라가 흔들리는 효과' },
];

// Gemini 한국어 스타일명 → ImageStyle 키 매핑
const STYLE_LABEL_TO_KEY: Record<string, ImageStyle> = {
  '레퍼런스 이미지': 'reference',
  '인물 풍성': 'rich-portrait',
  '내추럴': 'natural',
  '에디토리얼': 'editorial',
  '일러스트': 'illustration',
  '캐릭터+실사배경': 'character-real-bg',
  '캐릭터 + 실사배경': 'character-real-bg',
  '캐릭터 실사배경': 'character-real-bg',
  '3D 캐릭터': '3d-character',
  '리소그래프': 'risograph',
  '꼭셀아트': 'pixel-art',
  '픽셀아트': 'pixel-art',
  '유화': 'oil-painting',
  '한국 전통화': 'korean-traditional',
  '카툰': 'cartoon',
  '랩 초현실': 'pop-surreal',
  '팝 초현실': 'pop-surreal',
  '비브런트 필름': 'vibrant-film',
  '패션 포토': 'fashion-photo',
  '글리지 클라주': 'glitch-collage',
  '글리치 콜라주': 'glitch-collage',
  '레트로 필름': 'retro-film',
  '크로스프로세스': 'cross-process',
  '와일드 풍경': 'wild-landscape',
  '볼드 라인': 'bold-line',
  '수채화': 'watercolor',
};

export default function Step3Effect({ tabId }: Step3Props) {
  const { tabs, updateTab, settings } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGeneratingKiePreview, setIsGeneratingKiePreview] = useState(false);
  const [stylePreviewOverrides, setStylePreviewOverrides] = useState<Partial<Record<ImageStyle, string>>>({});

  const analyzeImageMutation = trpc.gemini.analyzeImage.useMutation();

  // 서버 모드에서 캐릭터 이미지 목록 조회 (자동 추천 버튼에서 사용)
  const { isAuthenticated } = useAuth();
  const serverCharacterAssetsQuery = trpc.asset.list.useQuery(
    { projectId: tab.serverProjectId!, category: 'character' },
    { enabled: tab.serverReferenceMode === 'server' && !!tab.serverProjectId && isAuthenticated }
  );

  const currentModel = tab.imageModel || 'nano-banana-2';
  const MAX_REFERENCE_IMAGES = getMaxReferenceImages(currentModel);
  const referenceImages = tab.referenceImages || [];

  const canDetectFromLocal = referenceImages.some((img) => Boolean(img.file) || !img.url.startsWith('blob:'));
  // 자동 추천 버튼 활성화 조건: 로컬 모드면 분석 가능한 이미지 존재, 서버 모드면 프로젝트 선택 + 캐릭터 이미지 존재
  const hasImagesForDetection = tab.serverReferenceMode === 'server'
    ? (!!tab.serverProjectId && (serverCharacterAssetsQuery.data?.length ?? 0) > 0)
    : canDetectFromLocal;

  const handleAutoDetectStyle = async () => {
    // 서버 모드일 때는 characterAssetsQuery에서 첫 번째 이미지 URL 사용
    let imageUrl: string | null = null;
    let imageFile: File | null = null;

    if (tab.serverReferenceMode === 'server') {
      const firstAsset = serverCharacterAssetsQuery.data?.[0];
      if (!firstAsset) {
        toast.error('프로젝트에서 캐릭터 이미지를 먼저 선택하세요.');
        return;
      }
      imageUrl = firstAsset.fileUrl;
    } else {
      const firstImage = referenceImages[0];
      if (!firstImage) {
        toast.error('캐릭터 이미지를 먼저 업로드하세요.');
        return;
      }
      imageUrl = firstImage.url;
      imageFile = firstImage.file || null;
        if (!imageFile && imageUrl.startsWith('blob:')) {
          toast.error('저장된 로컬 이미지가 만료되었습니다. 캐릭터 이미지를 다시 업로드해주세요.');
          return;
        }
    }

    setIsDetecting(true);
    try {
      if (!imageUrl && !imageFile) {
        toast.error('분석할 이미지를 찾을 수 없습니다.');
        return;
      }

      let payload:
        | { imageBase64: string; mimeType: string; geminiApiKey?: string }
        | { imageUrl: string; mimeType: string; geminiApiKey?: string };

      if (imageFile) {
        const mimeType = imageFile.type || 'image/jpeg';
        const imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
        payload = {
          imageBase64,
          mimeType,
          geminiApiKey: settings.geminiApiKey || undefined,
        };
      } else {
        payload = {
          imageUrl: imageUrl!,
          mimeType: 'image/jpeg',
          geminiApiKey: settings.geminiApiKey || undefined,
        };
      }

      const result = await analyzeImageMutation.mutateAsync(payload);

      const styleKey = STYLE_LABEL_TO_KEY[result.style] || 'natural';
      updateTab(tabId, { imageStyle: styleKey });
      toast.success(`스타일 자동 추천 완료: ${result.style}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '스타일 분석 중 오류가 발생했습니다.';
      toast.error(msg);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleStyleSelect = (style: ImageStyle) => {
    updateTab(tabId, { imageStyle: style });
  };

  const handleGenerateCharacterRealBgPreview = async () => {
    if (!settings.kieApiKey) {
      toast.error('설정에서 Kie AI API 키를 먼저 입력해주세요.');
      return;
    }

    let referenceUrls: string[] | undefined;
    if (tab.serverReferenceMode === 'server') {
      const firstServerChar = serverCharacterAssetsQuery.data?.[0];
      if (firstServerChar?.fileUrl) {
        referenceUrls = [firstServerChar.fileUrl];
      }
    } else if (referenceImages.length > 0) {
      const first = referenceImages[0];
      // blob URL은 Kie에서 직접 접근 불가하므로 제외
      if (first?.url && !first.url.startsWith('blob:')) {
        referenceUrls = [first.url];
      }
    }

    if (!referenceUrls || referenceUrls.length === 0) {
      toast.info('참조 캐릭터 URL이 없어 기본 캐릭터 스타일로 생성합니다. (서버 이미지 또는 URL 이미지 권장)');
    }

    setIsGeneratingKiePreview(true);
    try {
      const prompt = [
        'Create a full-body Korean cartoon character composited naturally into a realistic photo background.',
        'The character must stay center-framed, sharp, and clearly separated from background.',
        'Use a photorealistic modern city campus/plaza background, cinematic golden-hour lighting, natural shadows.',
        'Preserve character identity from reference image, keep outfit details accurate, no extra characters.',
        'High quality, clean composition, realistic depth, editorial look.',
      ].join(' ');

      const result = await generateImageKie(
        settings.kieApiKey,
        prompt,
        '4:3',
        referenceUrls,
        'nano-banana-2'
      );

      if (!result.resultUrl) {
        throw new Error(result.failMsg || 'Kie 미리보기 생성 결과 URL이 없습니다.');
      }

      setStylePreviewOverrides((prev) => ({
        ...prev,
        'character-real-bg': result.resultUrl!,
      }));
      toast.success('Kie AI로 캐릭터+실사배경 미리보기를 생성했습니다.');
    } catch (err: any) {
      toast.error(err?.message || 'Kie 미리보기 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingKiePreview(false);
    }
  };

  const handleAspectSelect = (ratio: AspectRatio) => {
    updateTab(tabId, { selectedAspectRatio: ratio });
  };

  const handleEffectSelect = (mode: ImageEffectMode) => {
    updateTab(tabId, {
      imageEffectMode: mode,
      currentStep: Math.max(tab.currentStep, 4),
    });
  };

  const handleVideoModeSelect = (modeId: VideoGenerationMode) => {
    settings.videoGenerationMode = modeId; // direct set for immediate UI update
    const { setSettings } = useAppStore.getState();
    setSettings({ videoGenerationMode: modeId });
    // Also update imageEffectMode for backward compat
    updateTab(tabId, {
      imageEffectMode: modeId === 'static_effect' ? 'basic' : 'video',
      currentStep: Math.max(tab.currentStep, 4),
    });
  };

  const handleDefaultEffectSelect = (effectId: EffectType) => {
    const { setSettings } = useAppStore.getState();
    setSettings({ defaultEffectType: effectId });
  };

  const addReferenceImages = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    const remaining = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (remaining <= 0) {
      toast.error(`참조 이미지는 최대 ${MAX_REFERENCE_IMAGES}장까지 업로드할 수 있습니다.`);
      return;
    }

    const toAdd = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) {
      toast.warning(`최대 ${MAX_REFERENCE_IMAGES}장까지만 가능합니다. ${toAdd.length}장만 추가됩니다.`);
    }

    const newImages = toAdd.map(file => ({
      url: URL.createObjectURL(file),
      file,
      name: file.name,
    }));

    const updated = [...referenceImages, ...newImages];
    updateTab(tabId, { referenceImages: updated });

    // 기존 단일 참조 이미지도 호환성을 위해 첫 번째 이미지로 설정
    if (!tab.consistencyImageUrl && updated.length > 0) {
      updateTab(tabId, { consistencyImageUrl: updated[0].url, consistencyImageFile: updated[0].file });
    }

    toast.success(`참조 이미지 ${toAdd.length}장이 추가되었습니다. (총 ${updated.length}/${MAX_REFERENCE_IMAGES}장)`);
  };

  const removeReferenceImage = (index: number) => {
    const img = referenceImages[index];
    if (img.url.startsWith('blob:')) {
      URL.revokeObjectURL(img.url);
    }
    const updated = referenceImages.filter((_, i) => i !== index);
    updateTab(tabId, { referenceImages: updated });

    // 단일 참조 이미지 호환성 업데이트
    if (updated.length > 0) {
      updateTab(tabId, { consistencyImageUrl: updated[0].url, consistencyImageFile: updated[0].file });
    } else {
      updateTab(tabId, { consistencyImageUrl: null, consistencyImageFile: null });
    }

    toast.success('참조 이미지가 제거되었습니다.');
  };

  const clearAllReferenceImages = () => {
    referenceImages.forEach(img => {
      if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
    });
    updateTab(tabId, { referenceImages: [], consistencyImageUrl: null, consistencyImageFile: null });
    toast.success('모든 참조 이미지가 제거되었습니다.');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) addReferenceImages(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) addReferenceImages(files);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };

  return (
    <div className="space-y-6">
      {/* 0. 참조 이미지 소스 선택 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Images className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">참조 이미지</h4>
            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
              {tab.serverReferenceMode === 'server' ? '프로젝트' : `${referenceImages.length}/${MAX_REFERENCE_IMAGES}`}
            </span>
          </div>
          {tab.serverReferenceMode === 'local' && referenceImages.length > 0 && (
            <button
              onClick={clearAllReferenceImages}
              className="px-2 py-1 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              전체 삭제
            </button>
          )}
        </div>

        {/* 소스 선택 토글 */}
        <div className="flex gap-2">
          <button
            onClick={() => updateTab(tabId, { serverReferenceMode: 'local' })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              tab.serverReferenceMode === 'local'
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/40'
            )}
          >
            <HardDrive className="w-3.5 h-3.5" />
            로컬 업로드
          </button>
          <button
            onClick={() => updateTab(tabId, { serverReferenceMode: 'server' })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              tab.serverReferenceMode === 'server'
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/40'
            )}
          >
            <Database className="w-3.5 h-3.5" />
            프로젝트에서 선택
          </button>
        </div>

        {/* 서버 프로젝트 선택 모드 */}
        {tab.serverReferenceMode === 'server' && (
          <ServerProjectSelector
            tabId={tabId}
            selectedProjectId={tab.serverProjectId}
            onSelectProject={(projectId) => updateTab(tabId, { serverProjectId: projectId })}
            maxImages={MAX_REFERENCE_IMAGES}
          />
        )}

        {/* 로컬 업로드 모드 */}
        {tab.serverReferenceMode === 'local' && (
          <>
        <p className="text-xs text-muted-foreground">
          캐릭터 일관성을 위해 참조 이미지를 업로드하세요. 최대 {MAX_REFERENCE_IMAGES}장까지 가능하며, 이미지 생성 시 모두 참조됩니다.
        </p>

        {/* 업로드된 이미지 갤러리 */}
        {referenceImages.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-2">
            {referenceImages.map((img, index) => (
              <div key={`ref-${index}`} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-primary/20 bg-secondary/30">
                <img
                  src={img.url}
                  alt={img.name || `참조 이미지 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeReferenceImage(index)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center">
                  <span className="text-[9px] text-white/80 truncate block">{index + 1}</span>
                </div>
              </div>
            ))}

            {/* 추가 버튼 */}
            {referenceImages.length < MAX_REFERENCE_IMAGES && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/30 flex flex-col items-center justify-center gap-1 transition-all duration-200"
              >
                <Plus className="w-5 h-5 text-muted-foreground/50" />
                <span className="text-[10px] text-muted-foreground/50">추가</span>
              </button>
            )}
          </div>
        )}

        {/* 빈 상태 - 드래그앤드롭 영역 */}
        {referenceImages.length === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-all duration-200',
              isDragOver
                ? 'border-primary bg-primary/10 scale-[1.01]'
                : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'
            )}
          >
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center',
              isDragOver ? 'bg-primary/20' : 'bg-secondary/50'
            )}>
              <Images className={cn('w-6 h-6', isDragOver ? 'text-primary' : 'text-muted-foreground/50')} />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {isDragOver ? (
                  <span className="text-primary font-medium">이미지를 놓으세요</span>
                ) : (
                  <>클릭하거나 이미지를 드래그하여 업로드</>
                )}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                여러 장의 캐릭터 이미지를 업로드하면 이미지 생성 시 참조됩니다 (최대 {MAX_REFERENCE_IMAGES}장)
              </p>
            </div>
          </div>
        )}

        {/* 이미지가 있을 때 드래그앤드롭 추가 영역 */}
        {referenceImages.length > 0 && referenceImages.length < MAX_REFERENCE_IMAGES && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'flex items-center justify-center gap-2 border border-dashed rounded-lg px-3 py-2 transition-all duration-200',
              isDragOver
                ? 'border-primary bg-primary/10'
                : 'border-border/40 hover:border-primary/30'
            )}
          >
            <Upload className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/60">
              이미지를 드래그하여 추가 ({MAX_REFERENCE_IMAGES - referenceImages.length}장 더 가능)
            </span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
          </>
        )}
      </div>

      {/* 1. 이미지 스타일 선택 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Palette className="w-4 h-4 text-primary flex-shrink-0" />
          <h4 className="font-semibold text-sm">이미지 스타일 선택</h4>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAutoDetectStyle(); }}
            disabled={isDetecting}
            title={!hasImagesForDetection ? '캐릭터 이미지를 먼저 업로드하세요' : '업로드된 이미지를 AI가 분석하여 어울리는 스타일을 자동 추천합니다'}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
              !isDetecting
                ? 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary cursor-pointer'
                : 'border-border/40 bg-secondary/20 text-muted-foreground/40 cursor-not-allowed'
            )}
          >
            {isDetecting ? (
              <><Loader2 className="w-3 h-3 animate-spin" /><span>분석 중...</span></>
            ) : (
              <><Wand2 className="w-3 h-3" /><span>✨ 자동 추천</span></>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGenerateCharacterRealBgPreview(); }}
            disabled={isGeneratingKiePreview}
            title="Kie AI로 캐릭터+실사배경 미리보기를 생성합니다"
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
              !isGeneratingKiePreview
                ? 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 cursor-pointer'
                : 'border-border/40 bg-secondary/20 text-muted-foreground/40 cursor-not-allowed'
            )}
          >
            {isGeneratingKiePreview ? (
              <><Loader2 className="w-3 h-3 animate-spin" /><span>Kie 생성 중...</span></>
            ) : (
              <><Sparkles className="w-3 h-3" /><span>캐릭터+실사배경 미리보기 생성</span></>
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          생성할 이미지의 아트 스타일을 선택하세요. 선택한 스타일이 프롬프트에 자동 반영됩니다.
        </p>
        <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-10 gap-1.5">
          {imageStyles.map((style) => (
            <button
              key={style}
              onClick={() => handleStyleSelect(style)}
              className={cn(
                'flex flex-col rounded-md border overflow-hidden transition-all duration-200 text-center',
                tab.imageStyle === style
                  ? 'border-primary shadow-[0_0_6px_oklch(0.585_0.233_277/0.25)] ring-1 ring-primary/50'
                  : 'border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50'
              )}
            >
              {/* 예시 이미지 */}
              <div className="relative w-full aspect-[4/3] overflow-hidden bg-secondary/50">
                <img
                  src={stylePreviewOverrides[style] || IMAGE_STYLE_PREVIEWS[style]}
                  alt={IMAGE_STYLE_LABELS[style]}
                  className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/fallback/160/120';
                  }}
                />
                {style === 'character-real-bg' && (
                  <div className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5">
                    <span className="text-[9px] font-semibold text-white">캐릭터+실사배경</span>
                  </div>
                )}
                {tab.imageStyle === style && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
              {/* 스타일 이름 */}
              <div className={cn(
                'px-1 py-1 text-[9px] font-medium leading-tight',
                tab.imageStyle === style ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
              )}>
                {IMAGE_STYLE_LABELS[style]}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. 화면 비율 선택 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">화면 비율 선택</h4>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {aspectRatios.map(({ value, label, icon: Icon, desc }) => (
            <button
              key={value}
              onClick={() => handleAspectSelect(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-200',
                tab.selectedAspectRatio === value
                  ? 'border-primary bg-primary/15 shadow-[0_0_8px_oklch(0.585_0.233_277/0.2)]'
                  : 'border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50'
              )}
            >
              <Icon className={cn('w-5 h-5', tab.selectedAspectRatio === value ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-xs font-bold', tab.selectedAspectRatio === value ? 'text-primary' : 'text-foreground')}>{label}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. 이미지 모델 선택 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">이미지 모델 선택</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          이미지 생성에 사용할 AI 모델을 선택하세요. 모든 모델은 동일한 Kie AI API 키를 사용합니다.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {IMAGE_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                updateTab(tabId, { imageModel: model.id });
                // 모델 변경 시 참조 이미지 수가 초과되면 자동 트리밍
                const maxRef = model.maxReferenceImages;
                if (referenceImages.length > maxRef) {
                  const trimmed = referenceImages.slice(0, maxRef);
                  // 초과분 blob URL 해제
                  referenceImages.slice(maxRef).forEach(img => {
                    if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
                  });
                  updateTab(tabId, {
                    referenceImages: trimmed,
                    consistencyImageUrl: trimmed.length > 0 ? trimmed[0].url : null,
                    consistencyImageFile: trimmed.length > 0 ? trimmed[0].file : null,
                  });
                  toast.warning(`${model.label}은 최대 ${maxRef}장까지 참조 가능합니다. 초과분이 제거되었습니다.`);
                }
              }}
              className={cn(
                'flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all duration-200 text-left',
                currentModel === model.id
                  ? 'border-primary bg-primary/15 shadow-[0_0_8px_oklch(0.585_0.233_277/0.2)]'
                  : 'border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50'
              )}
            >
              <span className={cn(
                'text-xs font-bold',
                currentModel === model.id ? 'text-primary' : 'text-foreground'
              )}>
                {model.label}
                {model.id === 'nano-banana-2' && (
                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                    추천
                  </span>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">{model.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. 영상 생성 방식 선택 (6가지 카드) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">영상 생성 방식 선택</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          이미지를 영상으로 변환할 방식을 선택하세요. 선택에 따라 비용과 품질이 달라집니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {VIDEO_GENERATION_MODES.map((mode) => {
            const isSelected = settings.videoGenerationMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => handleVideoModeSelect(mode.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border-2 transition-all duration-200',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-[0_0_12px_oklch(0.585_0.233_277/0.15)]'
                    : 'border-border bg-secondary/30 hover:border-primary/30 hover:bg-secondary/50'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('text-xs font-bold', isSelected ? 'text-primary' : 'text-foreground')}>
                    {mode.name}
                  </span>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                    mode.cost === '무료'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  )}>
                    {mode.cost}
                  </span>
                </div>
                <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground mb-1.5">
                  {mode.tag}
                </span>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{mode.description}</p>
              </button>
            );
          })}
        </div>

        {/* 기본 효과는 장면 분석 시 AI가 각 씬 대본에 맞춰 자동 배정합니다 */}
      </div>
    </div>
  );
}

// ========== ServerProjectSelector 컴포넌트 ==========
function ServerProjectSelector({
  tabId,
  selectedProjectId,
  onSelectProject,
  maxImages,
}: {
  tabId: string;
  selectedProjectId: number | null;
  onSelectProject: (projectId: number | null) => void;
  maxImages: number;
}) {
  const { isAuthenticated } = useAuth();
  const projectsQuery = trpc.project.list.useQuery(undefined, { enabled: isAuthenticated });
  const characterAssetsQuery = trpc.asset.list.useQuery(
    { projectId: selectedProjectId!, category: 'character' },
    { enabled: !!selectedProjectId }
  );
  const backgroundAssetsQuery = trpc.asset.list.useQuery(
    { projectId: selectedProjectId!, category: 'background' },
    { enabled: !!selectedProjectId }
  );
  const documentPlanQuery = trpc.asset.list.useQuery(
    { projectId: selectedProjectId!, category: 'document_plan' },
    { enabled: !!selectedProjectId }
  );
  const documentKnowledgeQuery = trpc.asset.list.useQuery(
    { projectId: selectedProjectId!, category: 'document_knowledge' },
    { enabled: !!selectedProjectId }
  );

  if (!isAuthenticated) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
        로그인 후 프로젝트에서 참조 이미지를 선택할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 프로젝트 선택 드롭다운 */}
      <Select
        value={selectedProjectId?.toString() || ''}
        onValueChange={(val) => onSelectProject(val ? Number(val) : null)}
      >
        <SelectTrigger className="bg-secondary/30 border-border">
          <SelectValue placeholder="프로젝트를 선택하세요" />
        </SelectTrigger>
        <SelectContent>
          {projectsQuery.isLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          ) : projectsQuery.data && projectsQuery.data.length > 0 ? (
            projectsQuery.data.map((project) => (
              <SelectItem key={project.id} value={project.id.toString()}>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5 text-primary" />
                  {project.name}
                </div>
              </SelectItem>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              프로젝트가 없습니다. 프로젝트 관리에서 먼저 생성하세요.
            </div>
          )}
        </SelectContent>
      </Select>

      {/* 선택된 프로젝트의 에셋 표시 */}
      {selectedProjectId && (
        <div className="space-y-3">
          {/* 캐릭터 이미지 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <User className="w-3 h-3" /> 캐릭터 이미지
              {characterAssetsQuery.data && (
                <span className="text-primary">({characterAssetsQuery.data.length}장)</span>
              )}
            </p>
            {characterAssetsQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            ) : characterAssetsQuery.data && characterAssetsQuery.data.length > 0 ? (
              <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-9 gap-1.5">
                {characterAssetsQuery.data.map((asset) => (
                  <div
                    key={asset.id}
                    className="aspect-square rounded-md overflow-hidden border border-primary/20 bg-secondary/30"
                    title={asset.label || asset.fileName}
                  >
                    <img
                      src={asset.fileUrl}
                      alt={asset.label || asset.fileName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 py-2">캐릭터 이미지가 없습니다.</p>
            )}
          </div>

          {/* 배경 이미지 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" /> 배경 이미지
              {backgroundAssetsQuery.data && (
                <span className="text-primary">({backgroundAssetsQuery.data.length}장)</span>
              )}
            </p>
            {backgroundAssetsQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            ) : backgroundAssetsQuery.data && backgroundAssetsQuery.data.length > 0 ? (
              <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-9 gap-1.5">
                {backgroundAssetsQuery.data.map((asset) => (
                  <div
                    key={asset.id}
                    className="aspect-square rounded-md overflow-hidden border border-primary/20 bg-secondary/30"
                    title={asset.label || asset.fileName}
                  >
                    <img
                      src={asset.fileUrl}
                      alt={asset.label || asset.fileName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 py-2">배경 이미지가 없습니다.</p>
            )}
          </div>

          {/* 기획서 파일 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <FolderOpen className="w-3 h-3" /> 기획서
              {documentPlanQuery.data && (
                <span className="text-primary">({documentPlanQuery.data.length}개)</span>
              )}
            </p>
            {documentPlanQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            ) : documentPlanQuery.data && documentPlanQuery.data.length > 0 ? (
              <div className="space-y-1">
                {documentPlanQuery.data.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 border border-border/50"
                  >
                    <FolderOpen className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs truncate">{asset.label || asset.fileName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 py-2">기획서가 없습니다.</p>
            )}
          </div>

          {/* 지식자료 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" /> 지식자료
              {documentKnowledgeQuery.data && (
                <span className="text-primary">({documentKnowledgeQuery.data.length}개)</span>
              )}
            </p>
            {documentKnowledgeQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            ) : documentKnowledgeQuery.data && documentKnowledgeQuery.data.length > 0 ? (
              <div className="space-y-1">
                {documentKnowledgeQuery.data.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 border border-border/50"
                  >
                    <BookOpen className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs truncate">{asset.label || asset.fileName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 py-2">지식자료가 없습니다.</p>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            캐릭터·배경 이미지는 STEP 5 이미지 생성 시 자동 참조됩니다. 기획서·지식자료(텍스트·md 등)는 STEP 4 장면 분석 시 대본과 함께 AI에 전달됩니다. (이미지 참조 최대 {maxImages}장)
          </p>
        </div>
      )}
    </div>
  );
}
