/*
 * Sidebar: 상단에 채널 로고 + 채널명 카드, 하단에 프로젝트 리스트
 * Design: 두 번째 이미지 참고 — 로고 이미지 카드 + 채널명 하단 표시
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Tv,
  ImagePlus,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const {
    projects,
    activeProjectId,
    createProject,
    deleteProject,
    updateProject,
    setActiveProject,
    isSidebarCollapsed,
    setSidebarCollapsed,
  } = useAppStore();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const createProjectMut = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
    },
  });

  const [newChannelName, setNewChannelName] = useState('');
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startEditing = (e: React.MouseEvent, projectId: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(projectId);
    setEditingName(currentName);
    setConfirmDeleteId(null);
  };

  const commitEdit = (projectId: string) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== projects.find(p => p.id === projectId)?.channelName) {
      updateProject(projectId, { channelName: trimmed });
      toast.success('프로젝트명이 수정되었습니다.');
    }
    setEditingId(null);
    setEditingName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setNewLogoPreview(url);
  };

  const handleCreate = async () => {
    const name = newChannelName.trim();
    if (!name) {
      toast.error('채널명을 입력해주세요.');
      return;
    }
    // 로컬 스토어에 생성 (워크플로우 상태 관리용)
    createProject(name, newLogoPreview);
    // 로그인된 경우 서버 DB에도 동기화
    if (isAuthenticated) {
      try {
        await createProjectMut.mutateAsync({ name });
      } catch (e) {
        // 서버 저장 실패해도 로컬은 유지
        console.warn('[Sidebar] 서버 프로젝트 생성 실패:', e);
      }
    }
    setNewChannelName('');
    setNewLogoPreview(null);
    setIsCreating(false);
    toast.success(`"${name}" 프로젝트가 생성되었습니다.`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
    if (e.key === 'Escape') {
      setIsCreating(false);
      setNewChannelName('');
      setNewLogoPreview(null);
    }
  };

  const handleDelete = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    deleteProject(projectId);
    setConfirmDeleteId(null);
    toast.success(`"${project?.channelName}" 프로젝트가 삭제되었습니다.`);
  };

  const handleLogoUpdate = (projectId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateProject(projectId, { logoUrl: url });
    toast.success('로고가 업데이트되었습니다.');
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 border-r border-border bg-sidebar flex flex-col transition-all duration-300 z-40 shrink-0',
        isSidebarCollapsed ? 'w-14' : 'w-64'
      )}
    >
      {/* HUCOMPANY Brand Card — Top of sidebar, toggle button overlaid */}
      {!isSidebarCollapsed && (
        <div className="border-b border-sidebar-border shrink-0">
          <div className="overflow-hidden" style={{ backgroundColor: '#2d3748' }}>
            {/* Logo Image with toggle button overlay */}
            <div className="relative bg-white flex items-center justify-center">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663497089734/KhDKm7HKpK55rujq9wNoP6/hucompany-family_ac38dbac.webp"
                alt="HUCOMPANY"
                className="w-full h-auto object-contain"
              />
              {/* Collapse toggle — top right of image */}
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="absolute top-2 right-2 p-1 rounded bg-black/20 hover:bg-black/40 text-white/70 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            {/* Brand Name */}
            <div className="py-2.5 px-3" style={{ backgroundColor: '#2d3748' }}>
              <p className="text-xs font-bold text-center tracking-[0.2em] uppercase" style={{ color: '#63b3ed' }}>
                HUCOMPANY
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed: show brand mini icon + expand button */}
      {isSidebarCollapsed && (
        <div className="px-2 py-3 border-b border-sidebar-border shrink-0 flex flex-col items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="w-10 h-10 rounded-lg overflow-hidden border border-border bg-white p-0.5 hover:ring-2 hover:ring-primary/50 transition-all"
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663497089734/KhDKm7HKpK55rujq9wNoP6/hucompany-family_ac38dbac.webp"
              alt="HUCOMPANY"
              className="w-full h-full object-contain"
            />
          </button>
        </div>
      )}

      {/* Create Project Area */}
      <div className="px-2 py-3 border-b border-sidebar-border shrink-0">
        {isSidebarCollapsed ? (
          <button
            onClick={() => {
              setSidebarCollapsed(false);
              setTimeout(() => setIsCreating(true), 300);
            }}
            className="w-full flex items-center justify-center p-2 rounded-md text-primary hover:bg-sidebar-accent transition-colors"
            title="새 프로젝트"
          >
            <Plus className="w-4 h-4" />
          </button>
        ) : isCreating ? (
          <div className="space-y-2">
            {/* Logo upload for new project */}
            <div
              onClick={() => logoInputRef.current?.click()}
              className="w-full aspect-video rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
            >
              {newLogoPreview ? (
                <img src={newLogoPreview} alt="미리보기" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <>
                  <ImagePlus className="w-5 h-5 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/50">로고 이미지 (선택)</span>
                </>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoSelect}
                className="hidden"
              />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="채널명을 입력하세요"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
            />
            <div className="flex gap-1.5">
              <Button
                onClick={handleCreate}
                size="sm"
                className="flex-1 h-7 text-[11px] bg-primary hover:bg-primary/90"
              >
                생성
              </Button>
              <Button
                onClick={() => {
                  setIsCreating(false);
                  setNewChannelName('');
                  setNewLogoPreview(null);
                }}
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-muted-foreground"
              >
                취소
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setIsCreating(true)}
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs border-dashed border-border hover:border-primary hover:bg-primary/5 hover:text-primary transition-all"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            새 프로젝트 생성
          </Button>
        )}
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {projects.length === 0 && !isSidebarCollapsed && (
          <div className="text-center py-8 px-2">
            <Tv className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
              아직 프로젝트가 없습니다.
              <br />
              위의 버튼으로 새 프로젝트를 생성하세요.
            </p>
          </div>
        )}

        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const isDeleting = confirmDeleteId === project.id;
          const mainTab = project.tabs.find((t) => t.id === 'main');
          const hasContent = mainTab?.title || mainTab?.script;

          return (
            <div key={project.id} className="group relative">
              {isSidebarCollapsed ? (
                <button
                  onClick={() => setActiveProject(project.id)}
                  className={cn(
                    'w-full flex items-center justify-center p-1.5 rounded-md transition-all',
                    isActive
                      ? 'ring-2 ring-primary'
                      : 'hover:bg-sidebar-accent'
                  )}
                  title={project.channelName}
                >
                  <div className="w-8 h-8 rounded-md overflow-hidden">
                    {project.logoUrl ? (
                      <img src={project.logoUrl} alt={project.channelName} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className={cn(
                          'w-full h-full flex items-center justify-center text-[10px] font-bold',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {project.channelName.charAt(0)}
                      </div>
                    )}
                  </div>
                </button>
              ) : editingId === project.id ? (
                /* 인라인 편집 모드 */
                <div className="px-2.5 py-2 rounded-md bg-sidebar-accent border border-primary/30 space-y-1.5">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(project.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="프로젝트명"
                  />
                  <div className="flex gap-1">
                    <Button
                      onClick={() => commitEdit(project.id)}
                      size="sm"
                      className="flex-1 h-6 text-[10px] bg-primary hover:bg-primary/90"
                    >
                      저장
                    </Button>
                    <Button
                      onClick={cancelEdit}
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-muted-foreground"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              ) : isDeleting ? (
                <div className="p-2 rounded-md bg-destructive/10 border border-destructive/30 space-y-2">
                  <p className="text-[11px] text-destructive font-medium">
                    "{project.channelName}" 삭제?
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      onClick={() => handleDelete(project.id)}
                      size="sm"
                      className="flex-1 h-6 text-[10px] bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      삭제
                    </Button>
                    <Button
                      onClick={() => setConfirmDeleteId(null)}
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-muted-foreground"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setActiveProject(project.id)}
                  onDoubleClick={(e) => startEditing(e, project.id, project.channelName)}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md transition-all duration-150 flex items-center gap-2.5 cursor-pointer',
                    isActive
                      ? 'bg-sidebar-primary/15 border border-sidebar-primary/30'
                      : 'hover:bg-sidebar-accent border border-transparent'
                  )}
                >
                  {/* Mini Logo */}
                  <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-border">
                    {project.logoUrl ? (
                      <img src={project.logoUrl} alt={project.channelName} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className={cn(
                          'w-full h-full flex items-center justify-center text-[10px] font-bold',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {project.channelName.charAt(0)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <p
                      className={cn(
                        'text-xs font-semibold truncate',
                        isActive ? 'text-primary' : 'text-sidebar-foreground'
                      )}
                    >
                      {project.channelName}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {hasContent ? mainTab?.title || '작업 중...' : '새 프로젝트'}
                    </p>
                  </div>

                  {/* Edit & Delete buttons */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-all">
                    <button
                      onClick={(e) => startEditing(e, project.id, project.channelName)}
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                      title="이름 수정"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(project.id);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      title="삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer */}
      {!isSidebarCollapsed && (
        <div className="px-3 py-2 border-t border-sidebar-border shrink-0">
          <p className="text-[10px] text-muted-foreground/40 text-center">
            HUCOMPANY 유튜브 프로그램 v1.0
          </p>
        </div>
      )}
    </aside>
  );
}
