import { create } from 'zustand';
import { nanoid } from 'nanoid';

// ===== Types =====
export type ImageModelId = 'nano-banana-2' | 'nano-banana-pro' | 'seedream-4.5' | 'flux-2/pro-text-to-image';

export interface ImageModelInfo {
  id: ImageModelId;
  label: string;
  description: string;
  maxReferenceImages: number;
}

export const IMAGE_MODELS: ImageModelInfo[] = [
  { id: 'nano-banana-2', label: 'Nano Banana 2', description: '기본 추천 모델 · 최대 14장 참조', maxReferenceImages: 14 },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro', description: '고화질 · 최대 8장 참조', maxReferenceImages: 8 },
  { id: 'seedream-4.5', label: 'Seedream 4.5', description: '캐릭터 일관성 최강 · 최대 10장 참조', maxReferenceImages: 10 },
  { id: 'flux-2/pro-text-to-image', label: 'Flux 2 Pro', description: '최고 품질 · 최대 8장 참조', maxReferenceImages: 8 },
];

export const getMaxReferenceImages = (modelId: string): number => {
  const model = IMAGE_MODELS.find(m => m.id === modelId);
  return model?.maxReferenceImages ?? 14;
};

export type ImageEffectMode = 'basic' | 'video';
export type EffectType = 'fade-in' | 'fade-out' | 'fade-in-hold' | 'zoom-in' | 'zoom-in-slow' | 'zoom-out' | 'hold' | 'pan-left-to-right' | 'pan-right-to-left' | 'shake';
export type VideoGenerationMode = 'static_effect' | 'kling_standard' | 'kling_pro' | 'veo3_fast' | 'veo3_quality' | 'runway_gen4';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export type ImageStyle =
  | 'reference' | 'rich-portrait' | 'natural' | 'editorial' | 'illustration'
  | 'character-real-bg'
  | '3d-character' | 'risograph' | 'pixel-art' | 'oil-painting' | 'korean-traditional'
  | 'cartoon' | 'pop-surreal' | 'vibrant-film' | 'fashion-photo' | 'glitch-collage'
  | 'retro-film' | 'cross-process' | 'wild-landscape' | 'bold-line' | 'watercolor';

export const IMAGE_STYLE_LABELS: Record<ImageStyle, string> = {
  'reference': '레퍼런스 이미지',
  'rich-portrait': '인물 풍성',
  'natural': '내추럴',
  'editorial': '에디토리얼',
  'illustration': '일러스트',
  'character-real-bg': '캐릭터+실사배경',
  '3d-character': '3D 캐릭터',
  'risograph': '리소그래프',
  'pixel-art': '픽셀아트',
  'oil-painting': '유화',
  'korean-traditional': '한국 전통화',
  'cartoon': '카툰',
  'pop-surreal': '팝 초현실',
  'vibrant-film': '비브런트 필름',
  'fashion-photo': '패션 포토',
  'glitch-collage': '글리치 콜라주',
  'retro-film': '레트로 필름',
  'cross-process': '크로스프로세스',
  'wild-landscape': '와일드 풍경',
  'bold-line': '볼드 라인',
  'watercolor': '수채화',
};

export interface SubtitleScene {
  id: number;
  text: string;
}

export interface SceneSlot {
  id: number;
  promptEn: string;
  promptKo: string;
  effectType: EffectType | string;
  effectDuration: number;
  videoMotionPrompt: string;
  imageUrl: string | null;
  videoUrl: string | null;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  imageTaskId?: string | null;
  imageTaskState?: 'idle' | 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  imageError?: string | null;
  videoTaskId?: string | null;
  videoTaskState?: 'idle' | 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  videoError?: string | null;
  // TTS & Subtitle (v3)
  ttsScript: string;
  subtitleScenes: SubtitleScene[];
  audioUrl: string | null;
  audioDuration: number;
  isGeneratingAudio: boolean;
  voiceId: string;
  speechRate: number;
  // Subtitle style per scene
  subtitleLines: number;
  subtitleSize: number;
  subtitlePosition: number;
  subtitleFont: string;
  subtitleColor: string;
  subtitleOutline: boolean;
  subtitleOutlineWidth: number;
  subtitleBg: string; // 'none' | 'light' | 'heavy' | 'rgba(...)' 커스텀 색상
}

export interface SeoScore {
  total: number;
  titleKeyword: number;
  searchIntent: number;
  clickRate: number;
  scriptKeywordDensity: number;
  viewerPotential: number;
}

export interface TabData {
  id: string;
  label: string;
  aspectRatio: AspectRatio;
  rawScript: string;
  title: string;
  script: string;
  seoScore: SeoScore | null;
  // STEP 3 (v3)
  imageStyle: ImageStyle;
  selectedAspectRatio: AspectRatio;
  imageModel: string;
  imageEffectMode: ImageEffectMode;
  // Scenes & generation
  scenes: SceneSlot[];
  consistencyImageUrl: string | null;
  consistencyImageFile: File | null;
  // 다중 참조 이미지 (최대 14장)
  referenceImages: { url: string; file: File | null; name: string }[];
  // 서버 프로젝트 에셋 기반 참조 이미지
  serverProjectId: number | null;
  serverReferenceMode: 'local' | 'server';
  isAnalyzing: boolean;
  isSplitting: boolean;
  isOptimizingSeo: boolean;
  isBatchGeneratingImages: boolean;
  isBatchGeneratingVideos: boolean;
  isBatchGeneratingAudios: boolean;
  isGeneratingFinalVideo: boolean;
  finalVideoUrl: string | null;
  thumbnailPrompt: string;
  thumbnailCandidates: string[];
  selectedThumbnailUrl: string | null;
  isGeneratingThumbnails: boolean;
  thumbnailAspectRatio: AspectRatio;
  thumbnailPhraseCount: 3 | 4 | 5;
  thumbnailPhraseCandidates: string[];
  selectedThumbnailPhrase: string | null;
  thumbnailSceneCandidates: number[];
  selectedThumbnailSceneId: number | null;
  thumbnailProgress: number;
  thumbnailStatus: string;
  thumbnailError: string | null;
  analyzeImagePromptLang: 'en' | 'ko';
  analyzeTtsLang: 'en' | 'ko';
  analyzeSubtitleLang: 'en' | 'ko';
  analyzeMotionPromptLang: 'en' | 'ko';
  currentStep: number;
  // STEP 5 sub-tab
  step5Tab: 'images' | 'audio' | 'render' | 'thumbnail';
}

export interface Project {
  id: string;
  channelName: string;
  logoUrl: string | null;
  createdAt: string;
  tabs: TabData[];
  activeTab: string;
}

export interface GcsSettings {
  projectId: string;
  bucketName: string;
  folderName: string;
  clientEmail: string;
  privateKey: string;
}

export interface SettingsState {
  geminiApiKey: string;
  geminiModel: string;
  kieApiKey: string;
  // v3 additions
  supertoneApiKey: string;
  videoGenerationMode: VideoGenerationMode;
  defaultEffectType: EffectType;
  gcs: GcsSettings;
  frameRate: '24' | '30' | '60';
}

export interface AppState {
  // Settings
  settings: SettingsState;
  setSettings: (settings: Partial<SettingsState>) => void;
  setGcsSettings: (gcs: Partial<GcsSettings>) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  resetAllSettings: () => void;

  // Projects
  projects: Project[];
  activeProjectId: string | null;
  createProject: (
    channelName: string,
    logoUrl?: string | null,
    options?: { activate?: boolean }
  ) => void;
  updateProject: (projectId: string, data: Partial<Pick<Project, 'channelName' | 'logoUrl'>>) => void;
  deleteProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Tabs (scoped to active project)
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: TabData[];
  updateTab: (tabId: string, data: Partial<TabData>) => void;
  updateScene: (tabId: string, sceneId: number, data: Partial<SceneSlot>) => void;
  setScenes: (tabId: string, scenes: SceneSlot[]) => void;
}

const defaultAspectForTab = (id: string): AspectRatio =>
  id === 'main' ? '16:9' : '9:16';

const createDefaultTab = (id: string, label: string, aspectRatio: AspectRatio): TabData => ({
  id,
  label,
  aspectRatio,
  rawScript: '',
  title: '',
  script: '',
  seoScore: null,
  imageStyle: 'natural',
  selectedAspectRatio: aspectRatio,
  imageModel: 'nano-banana-2',
  imageEffectMode: 'basic',
  scenes: [],
  consistencyImageUrl: null,
  consistencyImageFile: null,
  referenceImages: [],
  serverProjectId: null,
  serverReferenceMode: 'local',
  isAnalyzing: false,
  isSplitting: false,
  isOptimizingSeo: false,
  isBatchGeneratingImages: false,
  isBatchGeneratingVideos: false,
  isBatchGeneratingAudios: false,
  isGeneratingFinalVideo: false,
  finalVideoUrl: null,
  thumbnailPrompt: '',
  thumbnailCandidates: [],
  selectedThumbnailUrl: null,
  isGeneratingThumbnails: false,
  thumbnailAspectRatio: '16:9',
  thumbnailPhraseCount: 3,
  thumbnailPhraseCandidates: [],
  selectedThumbnailPhrase: null,
  thumbnailSceneCandidates: [],
  selectedThumbnailSceneId: null,
  thumbnailProgress: 0,
  thumbnailStatus: '',
  thumbnailError: null,
  analyzeImagePromptLang: 'en',
  analyzeTtsLang: 'en',
  analyzeSubtitleLang: 'en',
  analyzeMotionPromptLang: 'en',
  currentStep: 1,
  step5Tab: 'images',
});

const createDefaultTabs = (): TabData[] => [
  createDefaultTab('main', '메인 영상', '16:9'),
  createDefaultTab('shorts1', '쇼츠 1', '9:16'),
  createDefaultTab('shorts2', '쇼츠 2', '9:16'),
  createDefaultTab('shorts3', '쇼츠 3', '9:16'),
  createDefaultTab('shorts4', '쇼츠 4', '9:16'),
  createDefaultTab('shorts5', '쇼츠 5', '9:16'),
  createDefaultTab('shorts6', '쇼츠 6', '9:16'),
  createDefaultTab('shorts7', '쇼츠 7', '9:16'),
];

const defaultGcs: GcsSettings = {
  projectId: '',
  bucketName: '',
  folderName: '',
  clientEmail: '',
  privateKey: '',
};

const defaultSettings: SettingsState = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  kieApiKey: '',
  supertoneApiKey: '',
  videoGenerationMode: 'static_effect',
  defaultEffectType: 'zoom-in',
  gcs: { ...defaultGcs },
  frameRate: '30',
};

// Load settings from localStorage
const loadSettings = (): SettingsState => {
  try {
    const saved = localStorage.getItem('psych-studio-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultSettings, ...parsed, gcs: { ...defaultGcs, ...parsed.gcs } };
    }
  } catch {}
  return { ...defaultSettings };
};

// Load projects from localStorage
const normalizeTabData = (tab: TabData): TabData => {
  const defaultTab = createDefaultTab(
    tab.id,
    tab.label || (tab.id === 'main' ? '메인 영상' : `쇼츠 ${tab.id.replace('shorts', '')}`),
    (tab.aspectRatio || defaultAspectForTab(tab.id)) as AspectRatio
  );
  const nextStep5Tab =
    tab.step5Tab === 'images' || tab.step5Tab === 'audio' || tab.step5Tab === 'render' || tab.step5Tab === 'thumbnail'
      ? tab.step5Tab
      : 'images';
  const nextPhraseCount =
    tab.thumbnailPhraseCount === 3 || tab.thumbnailPhraseCount === 4 || tab.thumbnailPhraseCount === 5
      ? tab.thumbnailPhraseCount
      : 3;
  const nextImagePromptLang = tab.analyzeImagePromptLang === 'ko' ? 'ko' : 'en';
  const nextTtsLang = tab.analyzeTtsLang === 'ko' ? 'ko' : 'en';
  const nextSubtitleLang = tab.analyzeSubtitleLang === 'ko' ? 'ko' : 'en';
  const nextMotionPromptLang = tab.analyzeMotionPromptLang === 'ko' ? 'ko' : 'en';

  return {
    ...defaultTab,
    ...tab,
    referenceImages: Array.isArray(tab.referenceImages) ? tab.referenceImages : [],
    thumbnailCandidates: Array.isArray((tab as any).thumbnailCandidates) ? (tab as any).thumbnailCandidates : [],
    thumbnailPhraseCount: nextPhraseCount,
    thumbnailPhraseCandidates: Array.isArray((tab as any).thumbnailPhraseCandidates) ? (tab as any).thumbnailPhraseCandidates : [],
    thumbnailSceneCandidates: Array.isArray((tab as any).thumbnailSceneCandidates) ? (tab as any).thumbnailSceneCandidates : [],
    thumbnailProgress: typeof (tab as any).thumbnailProgress === 'number' ? (tab as any).thumbnailProgress : 0,
    thumbnailStatus: typeof (tab as any).thumbnailStatus === 'string' ? (tab as any).thumbnailStatus : '',
    thumbnailError: typeof (tab as any).thumbnailError === 'string' ? (tab as any).thumbnailError : null,
    analyzeImagePromptLang: nextImagePromptLang,
    analyzeTtsLang: nextTtsLang,
    analyzeSubtitleLang: nextSubtitleLang,
    analyzeMotionPromptLang: nextMotionPromptLang,
    step5Tab: nextStep5Tab,
  };
};

const migrateProjectTabs = (project: Project): Project => {
  const expectedTabs = [
    { id: 'main', label: '메인 영상', aspectRatio: '16:9' as AspectRatio },
    { id: 'shorts1', label: '쇼츠 1', aspectRatio: '9:16' as AspectRatio },
    { id: 'shorts2', label: '쇼츠 2', aspectRatio: '9:16' as AspectRatio },
    { id: 'shorts3', label: '쇼츠 3', aspectRatio: '9:16' as AspectRatio },
    { id: 'shorts4', label: '쇼츠 4', aspectRatio: '9:16' as AspectRatio },
    { id: 'shorts5', label: '쇼츠 5', aspectRatio: '9:16' as AspectRatio },
    { id: 'shorts6', label: '쇼츠 6', aspectRatio: '9:16' as AspectRatio },
    { id: 'shorts7', label: '쇼츠 7', aspectRatio: '9:16' as AspectRatio },
  ];
  if (project.tabs.length >= expectedTabs.length) {
    return { ...project, tabs: project.tabs.map(normalizeTabData) };
  }
  const existingIds = new Set(project.tabs.map((t) => t.id));
  const missingTabs = expectedTabs
    .filter((et) => !existingIds.has(et.id))
    .map((et) => createDefaultTab(et.id, et.label, et.aspectRatio));
  return { ...project, tabs: [...project.tabs.map(normalizeTabData), ...missingTabs] };
};

const loadProjects = (): Project[] => {
  try {
    const saved = localStorage.getItem('psych-studio-projects');
    if (saved) {
      const projects: Project[] = JSON.parse(saved);
      return projects.map(migrateProjectTabs);
    }
  } catch {}
  return [];
};

const loadActiveProjectId = (): string | null => {
  try {
    const saved = localStorage.getItem('psych-studio-active-project');
    if (saved) return saved;
  } catch {}
  return null;
};

// File 객체는 JSON 직렬화 불가 → 저장 전 제거
const sanitizeTabForStorage = (tab: TabData) => ({
  ...tab,
  consistencyImageFile: null,
  referenceImages: tab.referenceImages.map(img => ({ ...img, file: null })),
});

const sanitizeProjectForStorage = (project: Project) => ({
  ...project,
  tabs: project.tabs.map(sanitizeTabForStorage),
});

const saveProjects = (projects: Project[], activeId: string | null) => {
  try {
    const sanitized = projects.map(sanitizeProjectForStorage);
    localStorage.setItem('psych-studio-projects', JSON.stringify(sanitized));
    if (activeId) {
      localStorage.setItem('psych-studio-active-project', activeId);
    } else {
      localStorage.removeItem('psych-studio-active-project');
    }
  } catch (e) {
    console.error('[store] localStorage 저장 실패:', e);
  }
};

const initialProjects = loadProjects();
const initialActiveId = loadActiveProjectId();
const activeProject = initialProjects.find((p) => p.id === initialActiveId);

export const useAppStore = create<AppState>((set, get) => ({
  // Settings
  settings: loadSettings(),
  setSettings: (newSettings) =>
    set((state) => {
      const updated = { ...state.settings, ...newSettings };
      localStorage.setItem('psych-studio-settings', JSON.stringify(updated));
      return { settings: updated };
    }),
  setGcsSettings: (gcsUpdate) =>
    set((state) => {
      const updatedGcs = { ...state.settings.gcs, ...gcsUpdate };
      const updated = { ...state.settings, gcs: updatedGcs };
      localStorage.setItem('psych-studio-settings', JSON.stringify(updated));
      return { settings: updated };
    }),
  isSettingsOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  resetAllSettings: () =>
    set(() => {
      localStorage.removeItem('psych-studio-settings');
      localStorage.removeItem('psych-studio-projects');
      localStorage.removeItem('psych-studio-active-project');
      return {
        settings: { ...defaultSettings },
        projects: [],
        activeProjectId: null,
        tabs: createDefaultTabs(),
        activeTab: 'main',
      };
    }),

  // Projects
  projects: initialProjects,
  activeProjectId: initialActiveId,
  isSidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

  createProject: (channelName: string, logoUrl?: string | null, options?: { activate?: boolean }) =>
    set((state) => {
      const activate = options?.activate !== false;
      const newProject: Project = {
        id: nanoid(8),
        channelName,
        logoUrl: logoUrl || null,
        createdAt: new Date().toISOString(),
        tabs: createDefaultTabs(),
        activeTab: 'main',
      };
      const updatedProjects = [...state.projects, newProject];
      const nextActiveId = activate ? newProject.id : state.activeProjectId;
      saveProjects(updatedProjects, nextActiveId);
      const nextActiveProject = updatedProjects.find((p) => p.id === nextActiveId);
      return {
        projects: updatedProjects,
        activeProjectId: nextActiveId,
        tabs: nextActiveProject?.tabs ?? state.tabs,
        activeTab: nextActiveProject?.activeTab ?? state.activeTab,
      };
    }),

  updateProject: (projectId: string, data: Partial<Pick<Project, 'channelName' | 'logoUrl'>>) =>
    set((state) => {
      const updatedProjects = state.projects.map((p) =>
        p.id === projectId ? { ...p, ...data } : p
      );
      saveProjects(updatedProjects, state.activeProjectId);
      return { projects: updatedProjects };
    }),

  deleteProject: (projectId: string) =>
    set((state) => {
      const updatedProjects = state.projects.filter((p) => p.id !== projectId);
      const newActiveId =
        state.activeProjectId === projectId
          ? updatedProjects.length > 0
            ? updatedProjects[0].id
            : null
          : state.activeProjectId;
      const newActiveProject = updatedProjects.find((p) => p.id === newActiveId);
      saveProjects(updatedProjects, newActiveId);
      return {
        projects: updatedProjects,
        activeProjectId: newActiveId,
        tabs: newActiveProject?.tabs || createDefaultTabs(),
        activeTab: newActiveProject?.activeTab || 'main',
      };
    }),

  setActiveProject: (projectId: string) =>
    set((state) => {
      const updatedProjects = state.projects.map((p) =>
        p.id === state.activeProjectId
          ? { ...p, tabs: state.tabs, activeTab: state.activeTab }
          : p
      );
      const targetProject = updatedProjects.find((p) => p.id === projectId);
      if (!targetProject) return {};
      saveProjects(updatedProjects, projectId);
      return {
        projects: updatedProjects,
        activeProjectId: projectId,
        tabs: targetProject.tabs,
        activeTab: targetProject.activeTab,
      };
    }),

  // Tabs (scoped to active project)
  activeTab: activeProject?.activeTab || 'main',
  setActiveTab: (tab) =>
    set((state) => {
      const updatedProjects = state.projects.map((p) =>
        p.id === state.activeProjectId ? { ...p, activeTab: tab } : p
      );
      saveProjects(updatedProjects, state.activeProjectId);
      return { activeTab: tab, projects: updatedProjects };
    }),
  tabs: activeProject?.tabs || createDefaultTabs(),

  updateTab: (tabId, data) =>
    set((state) => {
      const newTabs = state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...data } : tab
      );
      const updatedProjects = state.projects.map((p) =>
        p.id === state.activeProjectId ? { ...p, tabs: newTabs } : p
      );
      saveProjects(updatedProjects, state.activeProjectId);
      return { tabs: newTabs, projects: updatedProjects };
    }),

  updateScene: (tabId, sceneId, data) =>
    set((state) => {
      const newTabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              scenes: tab.scenes.map((scene) =>
                scene.id === sceneId ? { ...scene, ...data } : scene
              ),
            }
          : tab
      );
      const updatedProjects = state.projects.map((p) =>
        p.id === state.activeProjectId ? { ...p, tabs: newTabs } : p
      );
      saveProjects(updatedProjects, state.activeProjectId);
      return { tabs: newTabs, projects: updatedProjects };
    }),

  setScenes: (tabId, scenes) =>
    set((state) => {
      const newTabs = state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, scenes } : tab
      );
      const updatedProjects = state.projects.map((p) =>
        p.id === state.activeProjectId ? { ...p, tabs: newTabs } : p
      );
      saveProjects(updatedProjects, state.activeProjectId);
      return { tabs: newTabs, projects: updatedProjects };
    }),
}));
