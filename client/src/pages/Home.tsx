/*
 * Design: "Mind Lab" — Clean Dark Professional Studio
 * Layout: Left sidebar (project list) + Right main content (tab workflow)
 */

import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import SettingsModal from '@/components/SettingsModal';
import Sidebar from '@/components/Sidebar';
import TabWorkflow from '@/components/TabWorkflow';
import { Settings, Film, Clapperboard, Tv, FolderOpen, Save, Upload, RotateCcw, LogOut } from 'lucide-react';
import { useRef } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { clearLocalAuthSession } from '@/components/LocalAuthGate';

const LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663497089734/KhDKm7HKpK55rujq9wNoP6/logo-icon-XZztfPizQax9mSWoPtmLcL.webp';

export default function Home() {
  const [, setLocation] = useLocation();
  const importInputRef = useRef<HTMLInputElement>(null);
  const { activeTab, setActiveTab, setSettingsOpen, tabs, activeProjectId, projects, updateTab } =
    useAppStore();
  const { logout } = useAuth();

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeTabData = tabs.find((t) => t.id === activeTab);

  const sanitizeFileName = (raw: string) =>
    raw
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

  const handleExportBackup = async () => {
    try {
      const state = useAppStore.getState();
      const mergedProjects = state.projects.map((project) =>
        project.id === state.activeProjectId
          ? { ...project, tabs: state.tabs, activeTab: state.activeTab }
          : project
      );

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          settings: state.settings,
          projects: mergedProjects,
          activeProjectId: state.activeProjectId,
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const baseName =
        sanitizeFileName(activeTabData?.title || '') ||
        sanitizeFileName(activeProject?.channelName || '') ||
        `psych-studio-backup-${new Date().toISOString().slice(0, 10)}`;
      const fileName = `${baseName}.json`;

      if ('showSaveFilePicker' in window) {
        try {
          const picker = (
            window as Window & {
              showSaveFilePicker: (options: {
                suggestedName: string;
                types: Array<{ description: string; accept: Record<string, string[]> }>;
              }) => Promise<{
                createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
              }>;
            }
          ).showSaveFilePicker;

          const handle = await picker({
            suggestedName: fileName,
            types: [
              {
                description: 'JSON Backup',
                accept: { 'application/json': ['.json'] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success('저장 위치를 선택해 백업 파일을 저장했습니다.');
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
          throw err;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('저장 파일을 다운로드했습니다.');
    } catch (error) {
      toast.error(`저장 실패: ${String(error)}`);
    }
  };

  const handleImportBackupClick = () => {
    importInputRef.current?.click();
  };

  const handleResetAllTabsInProject = () => {
    if (!activeProjectId || tabs.length === 0) return;
    const confirmed = window.confirm(
      '현재 프로젝트의 메인영상~쇼츠7 데이터를 모두 초기화할까요?\n(프로젝트 자체는 삭제되지 않습니다.)'
    );
    if (!confirmed) return;

    tabs.forEach((tab) => {
      updateTab(tab.id, {
        rawScript: '',
        title: '',
        script: '',
        seoScore: null,
        imageStyle: 'natural',
        selectedAspectRatio: tab.aspectRatio,
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
        currentStep: 1,
        step5Tab: 'images',
      });
    });
    setActiveTab('main');
    toast.success('현재 프로젝트의 메인영상~쇼츠7 탭이 모두 초기화되었습니다.');
  };

  const handleLogout = async () => {
    try {
      await logout();
      clearLocalAuthSession();
      toast.success('로그아웃되었습니다.');
      setLocation('/');
    } catch {
      toast.error('로그아웃 중 오류가 발생했습니다.');
    }
  };

  const handleImportBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const backupData = parsed?.data ?? parsed;

      const parseMaybeJsonString = <T,>(value: unknown): T | null => {
        if (value == null) return null;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value) as T;
          } catch {
            return null;
          }
        }
        return value as T;
      };

      const findProjectsArray = (source: any): any[] | null => {
        if (!source) return null;
        if (Array.isArray(source)) return source;

        const singleProjectCandidates = [
          source?.project,
          source?.data?.project,
          source?.currentProject,
        ];
        for (const candidate of singleProjectCandidates) {
          const parsedCandidate = parseMaybeJsonString<any>(candidate);
          if (
            parsedCandidate &&
            typeof parsedCandidate === 'object' &&
            ('tabs' in parsedCandidate || 'channelName' in parsedCandidate)
          ) {
            return [parsedCandidate];
          }
        }

        const directCandidates = [
          source?.projects,
          source?.projectList,
          source?.items,
          source?.data?.projects,
          source?.data?.projectList,
          source?.['psych-studio-projects'],
        ];

        for (const candidate of directCandidates) {
          const parsedCandidate = parseMaybeJsonString<any[]>(candidate);
          if (Array.isArray(parsedCandidate)) return parsedCandidate;
        }

        // 마지막 fallback: object 내부 값 중 프로젝트 배열처럼 보이는 첫 항목 사용
        if (typeof source === 'object') {
          for (const value of Object.values(source)) {
            const parsedValue = parseMaybeJsonString<any[]>(value);
            if (!Array.isArray(parsedValue) || parsedValue.length === 0) continue;
            const sample = parsedValue[0];
            if (
              sample &&
              typeof sample === 'object' &&
              ('tabs' in sample || 'channelName' in sample || 'activeTab' in sample)
            ) {
              return parsedValue;
            }
          }
        }

        return null;
      };

      // Support multiple historical backup formats.
      const importedSettings = parseMaybeJsonString<any>(
        backupData?.settings ??
          parsed?.settings ??
          parsed?.['psych-studio-settings'] ??
          null
      );

      const importedProjects = findProjectsArray(backupData) ?? findProjectsArray(parsed);

      const importedActiveProjectIdRaw =
        backupData?.activeProjectId ??
        parsed?.activeProjectId ??
        parsed?.['psych-studio-active-project'] ??
        null;
      const importedActiveProjectId =
        typeof importedActiveProjectIdRaw === 'string'
          ? importedActiveProjectIdRaw
          : null;

      if (!Array.isArray(importedProjects) || importedProjects.length === 0) {
        toast.error('백업 파일 형식이 올바르지 않습니다.');
        return;
      }

      const normalizedProjects = importedProjects
        .filter((p: any) => p && typeof p === 'object')
        .map((p: any, index: number) => ({
          ...p,
          id: String(p.id ?? `imported-${index + 1}`),
        }));

      if (normalizedProjects.length === 0) {
        toast.error('프로젝트 데이터 형식이 올바르지 않습니다.');
        return;
      }

      const currentState = useAppStore.getState();
      const settingsToStore = importedSettings ?? currentState.settings;

      localStorage.setItem('psych-studio-settings', JSON.stringify(settingsToStore));
      localStorage.setItem('psych-studio-projects', JSON.stringify(normalizedProjects));
      if (importedActiveProjectId && normalizedProjects.some(p => p.id === importedActiveProjectId)) {
        localStorage.setItem('psych-studio-active-project', importedActiveProjectId);
      } else {
        localStorage.setItem('psych-studio-active-project', normalizedProjects[0].id);
      }

      toast.success('불러오기가 완료되어 화면을 새로고침합니다.');
      window.location.reload();
    } catch (error) {
      toast.error(`불러오기 실패: ${String(error)}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const tabIcons: Record<string, typeof Film> = {
    main: Film,
    shorts1: Clapperboard,
    shorts2: Clapperboard,
    shorts3: Clapperboard,
    shorts4: Clapperboard,
    shorts5: Clapperboard,
    shorts6: Clapperboard,
    shorts7: Clapperboard,
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Right Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-background/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center justify-between h-14 px-6">
            <div className="flex items-center gap-2">
              <div>
                <h1 className="text-xl font-bold tracking-tight leading-none">
                  HUCOMPANY 유튜브 스튜디오
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleResetAllTabsInProject}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                <span className="text-sm">초기화</span>
              </Button>
              <Button
                onClick={handleExportBackup}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Save className="w-4 h-4 mr-1.5" />
                <span className="text-sm">저장</span>
              </Button>
              <Button
                onClick={handleImportBackupClick}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                <span className="text-sm">불러오기</span>
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportBackupFile}
              />
              <Button
                onClick={() => setLocation('/projects')}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <FolderOpen className="w-4 h-4 mr-1.5" />
                <span className="text-sm">프로젝트 관리</span>
              </Button>
              <Button
                onClick={() => setSettingsOpen(true)}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings className="w-4 h-4 mr-1.5" />
                <span className="text-sm">설정</span>
              </Button>
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                <span className="text-sm">로그아웃</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {!activeProjectId ? (
            /* Empty State - No project selected */
            <div className="flex items-center justify-center flex-1">
              <div className="text-center max-w-sm px-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <Tv className="w-10 h-10 text-primary/50" />
                </div>
                <h2 className="text-lg font-bold mb-2">프로젝트를 선택하세요</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  왼쪽 사이드바에서 프로젝트를 생성하거나 기존 프로젝트를 선택하여 작업을 시작하세요.
                </p>
              </div>
            </div>
          ) : (
            /* Active Project Content - 탭 상단 고정 + 콘텐츠 내부 스크롤 */
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* 탭 목록 영역 - 상단 고정 */}
              <div className="shrink-0 px-6 pt-3 pb-0 border-b border-border bg-background">
                {/* 프로젝트 제목 행 */}
                <div className="mb-2.5 space-y-1">
                  {tabs.find(t => t.id === activeTab) && (
                    <>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold">
                          {tabs.find(t => t.id === activeTab)?.label}
                        </h2>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {tabs.find(t => t.id === activeTab)?.aspectRatio === '16:9' ? '가로형 16:9' : '세로형 9:16'}
                        </span>
                      </div>
                      {tabs.find(t => t.id === activeTab)?.title && (
                        <p className="text-base text-muted-foreground leading-6">
                          현재 제목: <span className="text-foreground font-medium">{tabs.find(t => t.id === activeTab)?.title}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="bg-transparent border-0 p-0 h-auto flex-wrap gap-1 justify-start flex">
                  {tabs.map((tab) => {
                    const Icon = tabIcons[tab.id] || Film;
                    const hasContent = tab.title || tab.script;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all rounded-t-md rounded-b-none border-b-2 border-transparent',
                          activeTab === tab.id
                            ? 'border-primary text-primary bg-primary/5'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {hasContent && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 ml-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 탭 콘텐츠 - 내부 스크롤 (일반 컨테이너로 고정) */}
              <div className="flex-1 overflow-y-auto mt-0 px-4 py-4">
                <TabWorkflow tabId={activeTab} />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
}
