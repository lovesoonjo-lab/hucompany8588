import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/lib/store';
import { callGemini, PROMPTS, type ProgressCallbacks } from '@/lib/api';
import { Loader2, SplitSquareHorizontal, FileText, Sparkles, Upload, X, File, RotateCcw, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface Step1Props { tabId: string; }

export default function Step1Script({ tabId }: Step1Props) {
  const { tabs, updateTab, settings } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState('');

  // 컴포넌트 마운트 시 isSplitting이 true로 잔류해 있으면 리셋합니다.
  // (이전 세션에서 분리 중 페이지를 떠나거나 오류가 발생한 경우)
  useEffect(() => {
    if (tab.isSplitting) {
      updateTab(tabId, { isSplitting: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textParts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];
      if (items.length === 0) continue;
      let pageText = '';
      let prevItem: any = null;
      for (const item of items) {
        if (item.str === undefined) continue;
        if (prevItem && !prevItem.hasEOL) {
          const prevX = prevItem.transform[4]; const prevWidth = prevItem.width;
          const curX = item.transform[4]; const prevY = prevItem.transform[5]; const curY = item.transform[5];
          const sameLineY = Math.abs(curY - prevY) < 3;
          if (sameLineY) {
            const gap = curX - (prevX + prevWidth); const fontSize = Math.abs(item.transform[0]) || 10;
            if (gap > fontSize * 0.15 && item.str.length > 0 && !item.str.startsWith(' ')) { pageText += ' '; }
          } else { pageText += '\n'; }
        }
        pageText += item.str;
        if (item.hasEOL) { pageText += '\n'; }
        prevItem = item;
      }
      pageText = pageText.split('\n').map((line: string) => line.replace(/ {2,}/g, ' ').trim()).filter((line: string) => line.length > 0).join('\n');
      if (pageText.trim()) { textParts.push(pageText.trim()); }
    }
    return textParts.join('\n\n');
  };

  const handleFileUpload = async (file: File) => {
    const allowedExtensions = ['.txt', '.md', '.srt', '.vtt', '.pdf'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) { toast.error('지원되는 파일 형식: .txt, .md, .srt, .vtt, .pdf'); return; }
    setIsLoadingFile(true);
    try {
      if (ext === '.pdf') {
        const content = await extractTextFromPdf(file);
        if (content.trim()) {
          updateTab(tabId, { rawScript: content }); setUploadedFileName(file.name);
          toast.success(`"${file.name}" PDF 파일에서 텍스트를 추출했습니다.`);
        } else { toast.error('PDF에서 텍스트를 추출할 수 없습니다.'); }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { const content = e.target?.result as string; if (content) { updateTab(tabId, { rawScript: content }); setUploadedFileName(file.name); toast.success(`"${file.name}" 파일이 성공적으로 로드되었습니다.`); } };
        reader.onerror = () => { toast.error('파일 읽기에 실패했습니다.'); };
        reader.readAsText(file, 'UTF-8');
      }
    } catch (err: any) { toast.error(`파일 처리 실패: ${err.message}`); } finally { setIsLoadingFile(false); }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleFileUpload(file); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const clearUploadedFile = () => { setUploadedFileName(null); updateTab(tabId, { rawScript: '' }); };
  const handleReset = () => {
    // 분리 중이면 먼저 중지
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadedFileName(null); setIsLoadingFile(false); setIsDragOver(false); setProgress(0); setProgressPhase('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Step1~5 전체 데이터 초기화
    updateTab(tabId, {
      // Step1: 대본
      rawScript: '', title: '', script: '', isSplitting: false,
      // Step2: SEO
      seoScore: null, isOptimizingSeo: false,
      // Step3: 이미지 설정 (기본값 유지)
      imageStyle: 'natural', imageModel: 'nano-banana-2', imageEffectMode: 'basic',
      consistencyImageUrl: null, consistencyImageFile: null,
      referenceImages: [], serverProjectId: null, serverReferenceMode: 'local',
      // Step4: 장면 분석
      scenes: [], isAnalyzing: false,
      // Step5: 오디오/영상
      isBatchGeneratingImages: false, isBatchGeneratingVideos: false,
      isBatchGeneratingAudios: false,
      isGeneratingFinalVideo: false, finalVideoUrl: null,
      step5Tab: 'images',
      // 스텝 초기화
      currentStep: 1,
    });
    toast.success('대본 및 모든 단계가 초기화되었습니다.');
  };

  // Gemini 전송 전 영문 메타데이터를 클라이언트에서 직접 제거합니다.
  // 이 작업은 브라우저에서 즉시 실행되며 API 호출이 필요 없습니다.
  // 제거 대상: Image Prompt, Video Motion Prompt, FX Tag
  // 보존 대상: EN TTS Script → [TTS] 태그, EN Subtitle → [SUB] 태그로 변환
  // 결과: 한국어 나레이션 + [TTS]/[SUB] 태그가 포함된 텍스트
  const preprocessScript = (text: string): string => {
    const lines = text.split('\n');
    const result: string[] = [];
    let skipMode = false;
    let captureMode: 'tts' | 'sub' | null = null;
    let captureBuffer: string[] = [];

    const flushCapture = () => {
      if (captureMode && captureBuffer.length > 0) {
        const tag = captureMode === 'tts' ? '[TTS]' : '[SUB]';
        result.push(`${tag} ${captureBuffer.join(' ').trim()}`);
      }
      captureMode = null;
      captureBuffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // EN TTS Script → [TTS] 태그로 변환하여 보존
      const ttsMatch = trimmed.match(/^(?:[^\w가-힣\[]*\s*)?EN TTS Script\s*[:：]\s*(.*)/i);
      if (ttsMatch) {
        flushCapture();
        skipMode = false;
        captureMode = 'tts';
        const content = (ttsMatch[1] ?? '').trim();
        if (content) captureBuffer.push(content);
        continue;
      }

      // EN Subtitle → [SUB] 태그로 변환하여 보존
      const subMatch = trimmed.match(/^(?:[^\w가-힣\[]*\s*)?EN Subtitle\s*[:：]\s*(.*)/i);
      if (subMatch) {
        flushCapture();
        skipMode = false;
        captureMode = 'sub';
        const content = (subMatch[1] ?? '').trim();
        if (content) captureBuffer.push(content);
        continue;
      }

      // 삭제 대상: Image Prompt, Video Motion Prompt, FX Tag
      if (/^(?:[^\w가-힣\[]*\s*)?(Image Prompt|Video Motion Prompt|FX Tag)\s*[:：]/i.test(trimmed)) {
        flushCapture();
        skipMode = true;
        continue;
      }

      // KR Script 태그는 제거하고 내용만 보존
      if (/^(?:[^\w가-힣\[]*\s*)?KR Script\s*[:：]/i.test(trimmed)) {
        flushCapture();
        skipMode = false;
        const content = trimmed.replace(/^(?:[^\w가-힣\[]*\s*)?KR Script\s*[:：]\s*/i, '').trim();
        if (content) result.push(content);
        continue;
      }

      // 구조 태그 제거
      if (/^\[?(장면|Phase|섹션|Scene)\s*\d*\]?/.test(trimmed)) {
        flushCapture();
        skipMode = false;
        continue;
      }

      if (/^#\s*\[Phase/.test(trimmed)) {
        flushCapture();
        skipMode = false;
        continue;
      }

      if (/^-{2,}$/.test(trimmed)) {
        flushCapture();
        skipMode = false;
        continue;
      }

      if (trimmed === '') {
        flushCapture();
        skipMode = false;
        result.push('');
        continue;
      }

      // 캡처 모드 중이면 다음 줄도 같은 태그의 연속으로 취급
      if (captureMode && !skipMode) {
        captureBuffer.push(trimmed);
        continue;
      }

      if (!skipMode) {
        result.push(line);
      }
    }

    // 마지막 캡처 버퍼 플러시
    flushCapture();

    return result
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const optimizeSplitInput = (text: string): string => {
    const cleaned = preprocessScript(text)
      .split('\n')
      .filter((line) => !/^\s*\[(TTS|SUB)\]/i.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return cleaned;
  };

  const splitLocally = (source: string): { title: string; script: string } => {
    const lines = source
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return { title: '', script: '' };
    }

    const firstLine = lines[0]
      .replace(/^[#*\-\s]+/, '')
      .replace(/^\[(장면|Phase|섹션|Scene)[^\]]*\]\s*/i, '')
      .trim();

    const autoTitle = firstLine.length > 40 ? `${firstLine.slice(0, 40)}...` : firstLine || '심리 분석 대본';
    const body = lines.slice(1).join('\n').trim() || lines.join('\n').trim();

    return { title: autoTitle, script: body };
  };

  // 분리 중지 핸들러
  const handleStopSplit = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    updateTab(tabId, { isSplitting: false });
    setRetryMessage(null);
    setProgress(0);
    setProgressPhase('');
    toast.info('분리가 중지되었습니다.');
  };

  const handleSplit = async () => {
    if (!tab.rawScript.trim()) { toast.error('대본을 입력해주세요.'); return; }
    // Gemini API 키는 필수입니다.
    if (!settings.geminiApiKey?.trim()) {
      toast.error('Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
      return;
    }

    // AbortController 생성
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    updateTab(tabId, { isSplitting: true }); setRetryMessage(null); setProgress(0); setProgressPhase('준비 중...');
    // 간헐적으로 분리 상태가 끝나지 않는 케이스를 대비한 강제 종료 안전장치
    const hardTimeoutId = window.setTimeout(() => {
      if (abortControllerRef.current === abortController) {
        abortController.abort();
        abortControllerRef.current = null;
        updateTab(tabId, { isSplitting: false });
        setRetryMessage(null);
        setProgress(0);
        setProgressPhase('');
        toast.error('요청 시간이 길어 자동 중지되었습니다. 다시 시도해주세요.');
      }
    }, 65000);
    try {
      // 중지 확인 헬퍼
      const checkAborted = () => {
        if (abortController.signal.aborted) {
          throw new DOMException('분리가 사용자에 의해 중지되었습니다.', 'AbortError');
        }
      };

      const progressCallbacks: ProgressCallbacks = {
        onProgress: (percent, phase) => { checkAborted(); setProgress(percent); setProgressPhase(phase); },
        onRetry: (attempt, max, delaySec) => { setRetryMessage(`Gemini 서버가 혼잡합니다. ${delaySec}초 후 재시도합니다... (${attempt}/${max})`); toast.warning(`Gemini 서버 혼잡 - ${delaySec}초 후 재시도 (${attempt}/${max})`, { id: 'gemini-retry', duration: delaySec * 1000 + 1000 }); },
        onGiveUp: () => { setRetryMessage(null); setProgress(0); setProgressPhase(''); },
      };

      checkAborted();

      // 클라이언트에서 즉시 메타데이터를 제거한 후 Gemini를 단 한 번만 호출합니다.
      const cleanedScript = optimizeSplitInput(tab.rawScript);
      const result = await callGemini(
        settings.geminiApiKey, '',
        `다음 대본을 분석해주세요:\n\n${cleanedScript}`,
        PROMPTS.splitScript,
        progressCallbacks,
        abortController.signal
      );

      checkAborted();

      // 구분자 방식으로 파싱 (###TITLE### / ###SCRIPT### / ###END###)
      let parsed: { title?: string; script?: string } | null = null;

      // 전략 1: 구분자 파싱 (메인 전략)
      const titleDelimMatch = result.match(/###TITLE###\s*([\s\S]*?)\s*###SCRIPT###/);
      const scriptDelimMatch = result.match(/###SCRIPT###\s*([\s\S]*?)\s*###END###/);
      if (titleDelimMatch || scriptDelimMatch) {
        parsed = { title: titleDelimMatch ? titleDelimMatch[1].trim() : '', script: scriptDelimMatch ? scriptDelimMatch[1].trim() : '' };
      }

      // 전략 2: JSON 블록 추출
      if (!parsed || (!parsed.title && !parsed.script)) {
        const codeBlockMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) { try { parsed = JSON.parse(codeBlockMatch[1].trim()); } catch {} }
      }

      // 전략 3: 중괄호 JSON 매칭
      if (!parsed || (!parsed.title && !parsed.script)) {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch {} }
      }

      // 전략 4: 텍스트 직접 추출
      if (!parsed || (!parsed.title && !parsed.script)) {
        const lines = result.split('\n').filter((l: string) => l.trim());
        if (lines.length >= 2) { parsed = { title: lines[0].replace(/^[#*\-\s]+/, '').trim(), script: lines.slice(1).join('\n').trim() }; }
        else if (lines.length === 1) { parsed = { title: '', script: lines[0].trim() }; }
      }

      if (!parsed || (!parsed.title && !parsed.script)) {
        throw new Error('응답에서 제목과 대본을 추출할 수 없습니다. 대본 형식을 확인해주세요.');
      }

      checkAborted();

      // ** 마크다운 굵게 기호 제거 (대본에는 불필요)
      const cleanTitle = (parsed.title || '').replace(/\*\*/g, '').trim();
      const cleanScript = (parsed.script || '').replace(/\*\*/g, '').trim();
      updateTab(tabId, { title: cleanTitle, script: cleanScript, currentStep: Math.max(tab.currentStep, 2) });
      // 쇼츠 추출: 분리된 메인 제목+본문을 우선 사용(STEP1 본문 대본과 동일 출처). 없을 때만 rawScript.
      if (tabId === 'main') {
        const mergedMain = [cleanTitle, cleanScript].filter(Boolean).join('\n\n').trim();
        if (mergedMain || tab.rawScript.trim()) {
          extractShorts(mergedMain || tab.rawScript);
        }
      }
      setRetryMessage(null); setProgress(100); setProgressPhase('완료!'); toast.success('제목과 대본이 성공적으로 분리되었습니다.');
      setTimeout(() => { setProgress(0); setProgressPhase(''); }, 2000);
    } catch (err: any) {
      // AbortError는 사용자가 중지한 것이므로 에러 토스트를 표시하지 않음
      if (err.name === 'AbortError') {
        // 이미 handleStopSplit에서 처리됨
        return;
      }
      setRetryMessage(null);
      setProgress(0);
      setProgressPhase('');
      toast.error(`분리 실패: ${err.message}`);
    } finally {
      window.clearTimeout(hardTimeoutId);
      abortControllerRef.current = null;
      updateTab(tabId, { isSplitting: false });
      setRetryMessage(null);
    }
  };

  const extractShorts = async (script: string) => {
    try {
      const shortsCallbacks: ProgressCallbacks = {
        onRetry: (attempt, max, delaySec) => {
          toast.warning(`쇼츠 추출: ${delaySec}초 후 재시도 (${attempt}/${max})`, {
            id: 'gemini-retry-shorts',
            duration: delaySec * 1000 + 1000,
          });
        },
      };
      // 제목·본문 분리(split)와 동일한 전처리(TTS/SUB 줄 제외 등)로 메인과 출처를 맞춤
      const cleanedForShorts = optimizeSplitInput(script);
      if (!cleanedForShorts.trim()) {
        toast.warning('쇼츠 추출: 메인 대본이 비어 있어 건너뜁니다.');
        return;
      }
      const result = await callGemini(
        settings.geminiApiKey,
        '',
        `다음 메인 영상 대본을 바탕으로 쇼츠용 대본 7개를 작성해주세요. 원문의 핵심 사실·용어를 유지하고 각 쇼츠는 30~60초 분량으로 독립적으로 이해 가능하게 해주세요:\n\n${cleanedForShorts}`,
        PROMPTS.extractShorts,
        shortsCallbacks
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        toast.error('쇼츠 추출: 응답에서 JSON을 찾을 수 없습니다.');
        return;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.shorts && Array.isArray(parsed.shorts)) {
        const { updateTab: update } = useAppStore.getState();
        parsed.shorts.forEach((short: any, i: number) => {
          const shortTabId = `shorts${i + 1}`;
          const cleanShortTitle = (short.title || '').replace(/\*\*/g, '').trim();
          const cleanShortScript = (short.script || '').replace(/\*\*/g, '').trim();
          update(shortTabId, {
            rawScript: `${cleanShortTitle}\n\n${cleanShortScript}`,
            title: cleanShortTitle,
            script: cleanShortScript,
          });
        });
        toast.success(`쇼츠 대본 ${parsed.shorts.length}개가 메인 대본 기준으로 자동 추출되었습니다.`);
      } else {
        toast.error('쇼츠 추출: 응답에 shorts 배열이 없습니다.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`쇼츠 추출 실패: ${msg}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[3fr_1fr] gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" /> 대본 입력
          </label>
          <textarea value={tab.rawScript} onChange={(e) => { updateTab(tabId, { rawScript: e.target.value }); if (uploadedFileName) setUploadedFileName(null); }}
            placeholder="심리학 대본을 여기에 붙여넣으세요..."
            className="w-full h-56 bg-background border border-border rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 break-words whitespace-pre-wrap" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Upload className="w-4 h-4" /> 대본 파일 업로드
            </label>
            {(tab.rawScript.trim() || tab.title || tab.script || uploadedFileName) && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 초기화
              </button>
            )}
          </div>
          {uploadedFileName ? (
            <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 h-56">
              <File className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm text-foreground truncate flex-1">{uploadedFileName}</span>
              <button onClick={clearUploadedFile} className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
              onClick={() => !isLoadingFile && fileInputRef.current?.click()}
              className={`relative h-56 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-all duration-200 ${isLoadingFile ? 'border-primary/50 bg-primary/5 cursor-wait' : isDragOver ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'}`}>
              {isLoadingFile ? (
                <><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-primary font-medium">PDF 텍스트 추출 중...</p></>
              ) : (
                <>
                  <Upload className={`w-8 h-8 ${isDragOver ? 'text-primary' : 'text-muted-foreground/50'}`} />
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">{isDragOver ? <span className="text-primary font-medium">파일을 놓으세요</span> : <>클릭하거나 파일을 드래그하여 업로드</>}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">지원 형식: .txt, .md, .srt, .vtt, .pdf</p>
                    <p className="text-xs text-muted-foreground/40 mt-0.5">* 이모지가 포함된 대본은 .txt 파일 권장</p>
                  </div>
                </>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".txt,.md,.srt,.vtt,.pdf" onChange={handleFileInputChange} className="hidden" />
        </div>
      </div>

      <div className="space-y-2">
        {tab.isSplitting ? (
          <div className="flex gap-2">
            <Button disabled className="flex-1 bg-primary/80 h-11">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 분리 중... {progress > 0 && `${progress}%`}
            </Button>
            <Button onClick={handleStopSplit} variant="destructive" className="h-11 px-4">
              <StopCircle className="w-4 h-4 mr-1.5" /> 중지
            </Button>
          </div>
        ) : (
          <Button onClick={handleSplit} disabled={!tab.rawScript.trim()} className="w-full bg-primary hover:bg-primary/90 h-11">
            <SplitSquareHorizontal className="w-4 h-4 mr-2" /> 제목 / 대본 분리하기
          </Button>
        )}
        {(tab.isSplitting || (progress > 0 && progress < 100)) && (
          <div className="space-y-1.5">
            <div className="relative">
              <Progress value={progress} className="h-3 bg-muted/50" />
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-bold text-white drop-shadow-sm">{progress}%</span></div>
            </div>
            {progressPhase && <p className="text-xs text-muted-foreground text-center">{progressPhase}</p>}
          </div>
        )}
        {progress === 100 && !tab.isSplitting && progressPhase && (
          <div className="space-y-1.5">
            <div className="relative">
              <Progress value={100} className="h-3 bg-muted/50" />
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-bold text-white drop-shadow-sm">100%</span></div>
            </div>
            <p className="text-xs text-green-400 text-center font-medium">{progressPhase}</p>
          </div>
        )}
      </div>

      {retryMessage && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> {retryMessage}
        </div>
      )}

      {(tab.title || tab.script) && (
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> 제목
            </label>
            <input type="text" value={tab.title} onChange={(e) => updateTab(tabId, { title: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> 본문 대본
              </label>
              {tab.script && tab.script.includes('**') && (
                <button
                  type="button"
                  onClick={() => updateTab(tabId, { script: tab.script.replace(/\*\*/g, '') })}
                  className="text-xs text-amber-400 hover:text-amber-300 border border-amber-400/40 hover:border-amber-300/60 px-2 py-0.5 rounded-md transition-colors"
                >
                  ** 기호 제거
                </button>
              )}
            </div>
            <textarea value={tab.script} onChange={(e) => updateTab(tabId, { script: e.target.value })}
              className="w-full h-64 bg-background border border-border rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 break-words whitespace-pre-wrap" />
          </div>
        </div>
      )}
    </div>
  );
}
