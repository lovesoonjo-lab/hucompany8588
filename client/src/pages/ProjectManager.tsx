/**
 * 프로젝트 관리 페이지
 * - 서버 로그인: DB + 스토리지 에셋
 * - 로컬 전용: 사이드바와 동일한 Zustand 프로젝트 + 브라우저 localStorage 에셋
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, Upload, FolderOpen, ArrowLeft, User, Image, FileText, BookOpen, X, Tag, Home } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getLoginUrl } from '@/const';
import { useLocation } from 'wouter';
import Sidebar from '@/components/Sidebar';
import { isLocalAuthSession } from '@/components/LocalAuthGate';
import { useAppStore } from '@/lib/store';
import { nanoid } from 'nanoid';

type AssetCategory = 'character' | 'background' | 'document_plan' | 'document_knowledge';

const LOCAL_MANAGER_ASSETS_KEY = 'psych-studio-manager-assets-v1';

type LocalManagedAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  label: string;
  fileSize: number;
};

type LocalAssetRoot = Record<string, Partial<Record<AssetCategory, LocalManagedAsset[]>>>;

function readLocalManagerAssets(): LocalAssetRoot {
  try {
    const raw = localStorage.getItem(LOCAL_MANAGER_ASSETS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === 'object' && p !== null ? p : {};
  } catch {
    return {};
  }
}

function writeLocalManagerAssets(data: LocalAssetRoot) {
  try {
    localStorage.setItem(LOCAL_MANAGER_ASSETS_KEY, JSON.stringify(data));
  } catch {
    toast.error('로컬 저장에 실패했습니다. 용량을 줄이거나 브라우저 저장소를 확인해주세요.');
  }
}

function clearLocalProjectAssets(projectId: string) {
  const all = readLocalManagerAssets();
  delete all[projectId];
  writeLocalManagerAssets(all);
}

const CATEGORY_CONFIG: Record<AssetCategory, { label: string; icon: typeof User; max: number; accept: string; description: string }> = {
  character: { label: '캐릭터 이미지', icon: User, max: 20, accept: 'image/*', description: '영상에 등장하는 캐릭터 참조 이미지 (최대 20장)' },
  background: { label: '배경 이미지', icon: Image, max: 20, accept: 'image/*', description: '장면 배경으로 사용할 참조 이미지 (최대 20장)' },
  document_plan: { label: '기획서', icon: FileText, max: 5, accept: '.pdf,.doc,.docx,.txt,.md', description: '영상 기획서 및 시나리오 문서 (최대 5개)' },
  document_knowledge: { label: '지식자료', icon: BookOpen, max: 10, accept: '.pdf,.doc,.docx,.txt,.md,.csv,.xlsx', description: '참고 지식자료 및 데이터 (최대 10개)' },
};

const CATEGORIES: AssetCategory[] = ['character', 'background', 'document_plan', 'document_knowledge'];

export default function ProjectManager() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const cloudMode = isAuthenticated;
  const studioProjects = useAppStore((s) => s.projects);
  const createStudioProject = useAppStore((s) => s.createProject);
  const removeStudioProject = useAppStore((s) => s.deleteProject);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedLocalProjectId, setSelectedLocalProjectId] = useState<string | null>(null);
  const [localAssetsTick, setLocalAssetsTick] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('character');

  useEffect(() => {
    if (cloudMode && selectedLocalProjectId) setSelectedLocalProjectId(null);
    if (!cloudMode && selectedProjectId) setSelectedProjectId(null);
  }, [cloudMode, selectedLocalProjectId, selectedProjectId]);

  useEffect(() => {
    if (!cloudMode && selectedLocalProjectId && !studioProjects.some((p) => p.id === selectedLocalProjectId)) {
      setSelectedLocalProjectId(null);
    }
  }, [cloudMode, selectedLocalProjectId, studioProjects]);

  // tRPC queries
  const projectsQuery = trpc.project.list.useQuery(undefined, { enabled: cloudMode });
  const assetsQuery = trpc.asset.list.useQuery(
    { projectId: selectedProjectId!, category: activeCategory },
    { enabled: cloudMode && !!selectedProjectId }
  );

  // tRPC mutations
  const utils = trpc.useUtils();
  const createServerProject = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      setIsCreating(false);
      setNewName('');
      setNewDesc('');
      toast.success('프로젝트가 생성되었습니다.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteServerProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      setSelectedProjectId(null);
      toast.success('프로젝트가 삭제되었습니다.');
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadAsset = trpc.asset.upload.useMutation({
    onSuccess: () => {
      utils.asset.list.invalidate();
      toast.success('파일이 업로드되었습니다.');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteAsset = trpc.asset.delete.useMutation({
    onSuccess: () => {
      utils.asset.list.invalidate();
      toast.success('파일이 삭제되었습니다.');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateLabel = trpc.asset.updateLabel.useMutation({
    onSuccess: () => {
      utils.asset.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const localAssetsRoot = useMemo(() => {
    void localAssetsTick;
    return readLocalManagerAssets();
  }, [localAssetsTick]);

  const handleFileUpload = useCallback(async (files: FileList) => {
    if (!cloudMode || !selectedProjectId) return;
    const config = CATEGORY_CONFIG[activeCategory];
    const currentCount = assetsQuery.data?.length ?? 0;

    for (let i = 0; i < files.length; i++) {
      if (currentCount + i >= config.max) {
        toast.warning(`${config.label}은 최대 ${config.max}개까지 업로드 가능합니다.`);
        break;
      }
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: 파일 크기는 10MB 이하여야 합니다.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        await uploadAsset.mutateAsync({
          projectId: selectedProjectId,
          category: activeCategory,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileBase64: base64,
        });
      };
      reader.readAsDataURL(file);
    }
  }, [cloudMode, selectedProjectId, activeCategory, assetsQuery.data, uploadAsset]);

  const handleLocalFileUpload = useCallback(
    async (files: FileList, projectId: string) => {
      const config = CATEGORY_CONFIG[activeCategory];
      let added = 0;

      for (let i = 0; i < files.length; i++) {
        const allSoFar = readLocalManagerAssets();
        const currentList = allSoFar[projectId]?.[activeCategory] ?? [];
        const currentCount = currentList.length;
        if (currentCount >= config.max) {
          toast.warning(`${config.label}은 최대 ${config.max}개까지 업로드 가능합니다.`);
          break;
        }
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: 파일 크기는 10MB 이하여야 합니다.`);
          continue;
        }
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const all = readLocalManagerAssets();
        const row = all[projectId] ?? {};
        const list = row[activeCategory] ?? [];
        const next: LocalManagedAsset = {
          id: nanoid(10),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileUrl: dataUrl,
          label: file.name.replace(/\.[^/.]+$/, ''),
          fileSize: file.size,
        };
        all[projectId] = { ...row, [activeCategory]: [...list, next] };
        writeLocalManagerAssets(all);
        setLocalAssetsTick((t) => t + 1);
        added += 1;
      }
      if (added > 0) toast.success(`${added}개 파일이 이 브라우저(로컬)에 저장되었습니다.`);
    },
    [activeCategory]
  );

  const deleteLocalAsset = useCallback((projectId: string, assetId: string) => {
    const all = readLocalManagerAssets();
    const row = all[projectId];
    if (!row?.[activeCategory]) return;
    const filtered = row[activeCategory]!.filter((a) => a.id !== assetId);
    all[projectId] = { ...row, [activeCategory]: filtered };
    writeLocalManagerAssets(all);
    setLocalAssetsTick((t) => t + 1);
    toast.success('파일이 삭제되었습니다.');
  }, [activeCategory]);

  const updateLocalAssetLabel = useCallback((projectId: string, assetId: string, label: string) => {
    const all = readLocalManagerAssets();
    const row = all[projectId];
    if (!row?.[activeCategory]) return;
    const list = row[activeCategory]!.map((a) => (a.id === assetId ? { ...a, label } : a));
    all[projectId] = { ...row, [activeCategory]: list };
    writeLocalManagerAssets(all);
    setLocalAssetsTick((t) => t + 1);
  }, [activeCategory]);

  // Auth gate
  if (authLoading) {
    return (
      <div className="h-screen min-h-0 overflow-hidden bg-background flex">
        <Sidebar />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isLocalAuthSession()) {
    return (
      <div className="h-screen min-h-0 overflow-hidden bg-background flex">
        <Sidebar />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">로그인이 필요합니다.</p>
            <Button onClick={() => { window.location.href = getLoginUrl(); }}>로그인</Button>
          </div>
        </div>
      </div>
    );
  }

  const selectedProject = cloudMode ? projectsQuery.data?.find((p) => p.id === selectedProjectId) : undefined;
  const selectedLocalProject =
    !cloudMode && selectedLocalProjectId
      ? studioProjects.find((p) => p.id === selectedLocalProjectId)
      : undefined;
  const localAssetsForCategory =
    selectedLocalProjectId != null
      ? localAssetsRoot[selectedLocalProjectId]?.[activeCategory] ?? []
      : [];

  // ========== 프로젝트 상세 뷰 (서버) ==========
  if (cloudMode && selectedProjectId && selectedProject) {
    return (
      <div className="h-screen min-h-0 overflow-hidden bg-background flex">
        <Sidebar />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="text-muted-foreground hover:text-foreground p-2"
              title="스튜디오로"
            >
              <Home className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedProjectId(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 목록
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-bold">{selectedProject.name}</h2>
              {selectedProject.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedProject.description}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                if (confirm(`"${selectedProject.name}" 프로젝트를 삭제하시겠습니까?\n모든 에셋이 함께 삭제됩니다.`)) {
                  deleteServerProject.mutate({ id: selectedProjectId });
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
            </Button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="px-6 py-3 border-b border-border shrink-0">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => {
              const config = CATEGORY_CONFIG[cat];
              const Icon = config.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    activeCategory === cat
                      ? 'bg-primary text-primary-foreground shadow-[0_0_10px_oklch(0.585_0.233_277/0.25)]'
                      : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Asset Content — 뷰포트 높이에 맞춰 업로드 영역 확장 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 py-4 gap-3">
          <div className="shrink-0">
            <p className="text-xs text-muted-foreground">{CATEGORY_CONFIG[activeCategory].description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              현재: <span className="text-foreground font-medium">{assetsQuery.data?.length ?? 0}</span> / {CATEGORY_CONFIG[activeCategory].max}개
            </p>
          </div>

          {assetsQuery.isLoading ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
                }}
                className={cn(
                  'border-2 border-dashed rounded-lg text-center cursor-pointer transition-all flex flex-col items-center justify-center px-4 shrink-0 w-full max-w-md mx-auto h-[6.75rem] sm:h-28 py-2.5',
                  uploadAsset.isPending
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                {uploadAsset.isPending ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-xs text-primary">업로드 중...</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-5 h-5 mx-auto text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground leading-snug">
                      클릭하거나 파일을 드래그하여 업로드
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      최대 10MB · {CATEGORY_CONFIG[activeCategory].accept}
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CATEGORY_CONFIG[activeCategory].accept}
                  multiple
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
              </div>

              {(assetsQuery.data?.length ?? 0) > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
                  <div
                    className={cn(
                      'grid gap-3 pb-2',
                      activeCategory === 'character' || activeCategory === 'background'
                        ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                    )}
                  >
                    {assetsQuery.data!.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        category={activeCategory}
                        onDelete={() => deleteAsset.mutate({ id: asset.id })}
                        onUpdateLabel={(label) => updateLabel.mutate({ id: asset.id, label })}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <FolderOpen className="w-10 h-10 text-muted-foreground/20 mb-2" />
                  <p className="text-xs">아직 업로드된 파일이 없습니다.</p>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>
    );
  }

  // ========== 프로젝트 상세 뷰 (로컬 — Zustand 프로젝트 + localStorage 에셋) ==========
  if (!cloudMode && selectedLocalProjectId && selectedLocalProject) {
    const pid = selectedLocalProjectId;
    return (
      <div className="h-screen min-h-0 overflow-hidden bg-background flex">
        <Sidebar />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/')}
                className="text-muted-foreground hover:text-foreground p-2"
                title="스튜디오로"
              >
                <Home className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLocalProjectId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> 목록
              </Button>
              <div className="flex-1">
                <h2 className="text-lg font-bold">{selectedLocalProject.channelName}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  이 브라우저에만 저장됩니다. 서버 로그인 시 클라우드 프로젝트로 동기화할 수 있습니다.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  if (
                    confirm(
                      `"${selectedLocalProject.channelName}" 스튜디오 프로젝트를 삭제할까요?\n(사이드바 목록에서도 삭제되며, 여기에 올린 로컬 에셋도 함께 제거됩니다.)`
                    )
                  ) {
                    clearLocalProjectAssets(pid);
                    removeStudioProject(pid);
                    setSelectedLocalProjectId(null);
                    toast.success('프로젝트가 삭제되었습니다.');
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
              </Button>
            </div>
          </div>

          <div className="px-6 py-3 border-b border-border shrink-0">
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => {
                const config = CATEGORY_CONFIG[cat];
                const Icon = config.icon;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      activeCategory === cat
                        ? 'bg-primary text-primary-foreground shadow-[0_0_10px_oklch(0.585_0.233_277/0.25)]'
                        : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 py-4 gap-3">
            <div className="shrink-0">
              <p className="text-xs text-muted-foreground">{CATEGORY_CONFIG[activeCategory].description}</p>
              <p className="text-xs text-muted-foreground mt-1">
                현재:{' '}
                <span className="text-foreground font-medium">{localAssetsForCategory.length}</span> /{' '}
                {CATEGORY_CONFIG[activeCategory].max}개
              </p>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files.length > 0) void handleLocalFileUpload(e.dataTransfer.files, pid);
              }}
              className="border-2 border-dashed rounded-lg text-center cursor-pointer transition-all flex flex-col items-center justify-center px-4 shrink-0 w-full max-w-md mx-auto h-[6.75rem] sm:h-28 py-2.5 border-border hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="space-y-1">
                <Upload className="w-5 h-5 mx-auto text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground leading-snug">
                  클릭하거나 파일을 드래그하여 업로드
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  최대 10MB · {CATEGORY_CONFIG[activeCategory].accept}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={CATEGORY_CONFIG[activeCategory].accept}
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void handleLocalFileUpload(e.target.files, pid);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </div>

            {localAssetsForCategory.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
                <div
                  className={cn(
                    'grid gap-3 pb-2',
                    activeCategory === 'character' || activeCategory === 'background'
                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  )}
                >
                  {localAssetsForCategory.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      category={activeCategory}
                      onDelete={() => deleteLocalAsset(pid, asset.id)}
                      onUpdateLabel={(label) => updateLocalAssetLabel(pid, asset.id, label)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-10 text-muted-foreground">
                <FolderOpen className="w-10 h-10 text-muted-foreground/20 mb-2" />
                <p className="text-xs">아직 업로드된 파일이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== 프로젝트 목록 뷰 (상세 화면과 동일하게 뷰포트 높이·폭 활용) ==========
  return (
    <div className="h-screen min-h-0 overflow-hidden bg-background flex">
      <Sidebar />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-6 py-4 space-y-4">
          {!cloudMode && (
            <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
              로컬 전용 모드입니다. 아래 프로젝트는 사이드바와 동일하며, 에셋은 이 PC 브라우저에만 저장됩니다.{' '}
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  window.location.href = getLoginUrl();
                }}
              >
                서버 로그인
              </button>
              후에는 클라우드 프로젝트·STEP 3 「프로젝트에서 선택」과 연동할 수 있습니다.
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/')}
                className="text-muted-foreground hover:text-foreground p-2 shrink-0"
                title="스튜디오로"
              >
                <Home className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <h2 className="text-xl font-bold">프로젝트 관리</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  프로젝트별 캐릭터, 배경, 기획서, 지식자료를 관리합니다.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setIsCreating(true)}
              size="sm"
              className="bg-primary hover:bg-primary/90 shrink-0"
            >
              <Plus className="w-4 h-4 mr-1" /> 새 프로젝트
            </Button>
          </div>

          {isCreating && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6 space-y-3">
                <Input
                  placeholder="프로젝트 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-background"
                  autoFocus
                />
                {cloudMode && (
                  <Textarea
                    placeholder="프로젝트 설명 (선택)"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="bg-background resize-none"
                    rows={2}
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (!newName.trim()) {
                        toast.error('프로젝트 이름을 입력해주세요.');
                        return;
                      }
                      if (cloudMode) {
                        createServerProject.mutate({
                          name: newName.trim(),
                          description: newDesc.trim() || undefined,
                        });
                      } else {
                        createStudioProject(newName.trim(), undefined, { activate: false });
                        setIsCreating(false);
                        setNewName('');
                        setNewDesc('');
                        toast.success('스튜디오에 프로젝트가 추가되었습니다. 카드를 눌러 에셋을 올려주세요.');
                      }
                    }}
                    size="sm"
                    disabled={cloudMode && createServerProject.isPending}
                  >
                    {cloudMode && createServerProject.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : null}
                    생성
                  </Button>
                  <Button
                    onClick={() => {
                      setIsCreating(false);
                      setNewName('');
                      setNewDesc('');
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    취소
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          <div className="max-w-[1600px] mx-auto w-full min-h-full flex flex-col">
            {cloudMode ? (
              projectsQuery.isLoading ? (
                <div className="flex-1 min-h-[12rem] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : projectsQuery.data && projectsQuery.data.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 auto-rows-max">
                  {projectsQuery.data.map((project) => (
                    <Card
                      key={project.id}
                      onClick={() => {
                        setSelectedLocalProjectId(null);
                        setSelectedProjectId(project.id);
                      }}
                      className="cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all group"
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold group-hover:text-primary transition-colors">
                          {project.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60">
                          {new Date(project.createdAt).toLocaleDateString('ko-KR')} 생성
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-16 text-center px-4">
                  <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground/15 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground mb-2">프로젝트가 없습니다</h3>
                  <p className="text-sm text-muted-foreground/70 mb-4 max-w-md">
                    새 프로젝트를 생성하여 캐릭터, 배경, 기획서 등을 관리하세요.
                  </p>
                  <Button onClick={() => setIsCreating(true)} size="sm">
                    <Plus className="w-4 h-4 mr-1" /> 첫 프로젝트 만들기
                  </Button>
                </div>
              )
            ) : studioProjects.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 auto-rows-max">
                {studioProjects.map((project) => (
                  <Card
                    key={project.id}
                    onClick={() => {
                      setSelectedProjectId(null);
                      setSelectedLocalProjectId(project.id);
                    }}
                    className="cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all group"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold group-hover:text-primary transition-colors">
                        {project.channelName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-[10px] text-muted-foreground/60">
                        {new Date(project.createdAt).toLocaleDateString('ko-KR')} · 로컬 에셋 관리
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-16 text-center px-4">
                <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground/15 mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">프로젝트가 없습니다</h3>
                <p className="text-sm text-muted-foreground/70 mb-4 max-w-md">
                  사이드바에서 프로젝트를 만들거나, 위에서 새 프로젝트를 추가하세요.
                </p>
                <Button onClick={() => setIsCreating(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> 첫 프로젝트 만들기
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== AssetCard 컴포넌트 ==========
function AssetCard({
  asset,
  category,
  onDelete,
  onUpdateLabel,
}: {
  asset: any;
  category: AssetCategory;
  onDelete: () => void;
  onUpdateLabel: (label: string) => void;
}) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(asset.label || '');
  const isImage = category === 'character' || category === 'background';

  return (
    <div className="group relative rounded-lg border border-border bg-secondary/20 overflow-hidden hover:border-primary/30 transition-all">
      {isImage ? (
        <div className="aspect-square overflow-hidden bg-black/20">
          <img
            src={asset.fileUrl}
            alt={asset.fileName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-medium truncate">{asset.fileName}</p>
            <p className="text-[10px] text-muted-foreground">
              {asset.fileSize ? `${(asset.fileSize / 1024).toFixed(1)}KB` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Label */}
      <div className="px-2 py-1.5 border-t border-border">
        {isEditingLabel ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onUpdateLabel(labelValue);
                  setIsEditingLabel(false);
                }
                if (e.key === 'Escape') {
                  setIsEditingLabel(false);
                  setLabelValue(asset.label || '');
                }
              }}
              onBlur={() => {
                onUpdateLabel(labelValue);
                setIsEditingLabel(false);
              }}
              className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="라벨 입력"
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsEditingLabel(true)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors truncate"
              title="라벨 편집"
            >
              <Tag className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{asset.label || asset.fileName}</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white/70 hover:text-white hover:bg-destructive/80 opacity-0 group-hover:opacity-100 transition-all"
        title="삭제"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
