import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useAppStore, type SeoScore } from '@/lib/store';
import { callGemini, PROMPTS, type ProgressCallbacks } from '@/lib/api';
import { Loader2, TrendingUp, BarChart3, RefreshCw, Check, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Step2Props {
  tabId: string;
}

type SeoMetricKey = Exclude<keyof SeoScore, 'total'>;

const SEO_METRIC_LABELS: Record<SeoMetricKey, string> = {
  titleKeyword: '제목 키워드 최적화',
  searchIntent: '검색 의도 일치도',
  clickRate: '클릭률 예상 점수',
  scriptKeywordDensity: '대본 키워드 밀도',
  viewerPotential: '시청자 유입 가능성',
};

const TITLE_FOCUSED_METRICS: SeoMetricKey[] = ['titleKeyword', 'searchIntent', 'clickRate'];
const SCRIPT_FOCUSED_METRICS: SeoMetricKey[] = ['scriptKeywordDensity', 'viewerPotential'];

type LineChange = {
  type: 'modified' | 'added' | 'removed';
  line: number;
  before: string;
  after: string;
};

function buildLineChanges(beforeText: string, afterText: string): LineChange[] {
  const beforeLines = beforeText.split('\n');
  const afterLines = afterText.split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const changes: LineChange[] = [];

  for (let i = 0; i < maxLen; i++) {
    const before = beforeLines[i] ?? '';
    const after = afterLines[i] ?? '';
    if (before === after) continue;

    if (!before && after) {
      changes.push({ type: 'added', line: i + 1, before: '', after });
    } else if (before && !after) {
      changes.push({ type: 'removed', line: i + 1, before, after: '' });
    } else {
      changes.push({ type: 'modified', line: i + 1, before, after });
    }
  }

  return changes;
}

function extractTitleKeywords(title: string): string[] {
  const tokens = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 3);
}

function boostScriptKeywordDensity(script: string, title: string): string {
  const text = (script || '').trim();
  if (!text) return script;
  const keywords = extractTitleKeywords(title);
  if (keywords.length === 0) return script;
  const boostLine = `${keywords.join(', ')} 관점에서 핵심 메시지를 다시 강조합니다.`;
  if (text.includes(boostLine)) return script;
  return `${text}\n\n${boostLine}`;
}

function ScoreBar({
  label,
  score,
  previousScore,
  onOptimize,
  optimizing,
}: {
  label: string;
  score: number;
  previousScore?: number;
  onOptimize?: () => void;
  optimizing?: boolean;
}) {
  const color =
    score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const hasDelta = typeof previousScore === 'number';
  const delta = hasDelta ? score - (previousScore as number) : 0;
  const deltaColor = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="space-y-1 w-full max-w-[560px] mx-auto">
      <div className="text-xs">
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 bg-secondary rounded-full overflow-hidden w-3/4 min-w-[4rem] shrink-0">
          <div
            className={cn('h-full rounded-full transition-all duration-700', color)}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="font-semibold text-xs shrink-0">
          {score}점
          {hasDelta && (
            <span className={cn('ml-1 text-[10px]', deltaColor)}>
              ({delta > 0 ? '+' : ''}{delta})
            </span>
          )}
        </span>
        {onOptimize ? (
          <button
            type="button"
            onClick={onOptimize}
            disabled={optimizing}
            className="text-[10px] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 w-[66px] text-center"
          >
            SEO 최적화
          </button>
        ) : (
          <span className="shrink-0 w-[66px] h-[22px]" aria-hidden />
        )}
      </div>
    </div>
  );
}

function ScoreCompareBar({ label, before, after }: { label: string; before: number; after: number }) {
  const diff = after - before;
  const diffColor = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-muted-foreground';
  const afterColor = after >= 80 ? 'bg-emerald-500' : after >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/80">{before}점</span>
          <ArrowRight className="w-3 h-3" />
          <span className="text-sm">{after}점</span>
          <span className={cn('ml-1', diffColor)}>
            ({diff > 0 ? '+' : ''}{diff})
          </span>
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', afterColor)}
          style={{ width: `${after}%` }}
        />
      </div>
    </div>
  );
}

function TotalScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? 'stroke-emerald-500'
      : score >= 60
      ? 'stroke-amber-500'
      : 'stroke-red-500';

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="oklch(0.25 0.02 280)"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          className={cn('transition-all duration-1000', color)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

interface OptimizeResult {
  title: string;
  script: string;
  newScore: SeoScore;
  previousScore: SeoScore;
}

export default function Step2Seo({ tabId }: Step2Props) {
  const { tabs, updateTab, settings } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState('');
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedScript, setEditedScript] = useState('');
  const titleChanged = optimizeResult ? tab.title !== editedTitle : false;
  const scriptChanges = optimizeResult ? buildLineChanges(tab.script || '', editedScript || '') : [];

  const makeProgressCallbacks = (label: string): ProgressCallbacks => ({
    onProgress: (percent, phase) => {
      setProgress(percent);
      setProgressPhase(phase);
    },
    onRetry: (attempt, max, delaySec) => {
      const msg = `Gemini 서버가 혼잡합니다. ${delaySec}초 후 재시도합니다... (${attempt}/${max})`;
      setRetryMessage(msg);
      toast.warning(`Gemini 서버 혼잡 - ${delaySec}초 후 재시도 (${attempt}/${max})`, { id: `gemini-retry-${label}`, duration: delaySec * 1000 + 1000 });
    },
    onGiveUp: () => {
      setRetryMessage(null);
      setProgress(0);
      setProgressPhase('');
    },
  });

  const clearProgress = () => {
    setTimeout(() => {
      setProgress(0);
      setProgressPhase('');
    }, 2000);
  };

  const handleAnalyze = async () => {
    if (!tab.title && !tab.script) {
      toast.error('먼저 STEP 1에서 대본을 분리해주세요.');
      return;
    }

    updateTab(tabId, { isOptimizingSeo: true });
    setRetryMessage(null);
    setProgress(0);
    setProgressPhase('준비 중...');

    try {
      const result = await callGemini(
        settings.geminiApiKey, '',
        `제목: ${tab.title}\n\n대본: ${tab.script}`,
        PROMPTS.seoAnalysis,
        makeProgressCallbacks('seo-analyze')
      );

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON 파싱 실패');

      const scores = JSON.parse(jsonMatch[0]);
      const total = Math.round(
        (scores.titleKeyword +
          scores.searchIntent +
          scores.clickRate +
          scores.scriptKeywordDensity +
          scores.viewerPotential) /
          5
      );

      updateTab(tabId, {
        seoScore: { ...scores, total },
        currentStep: Math.max(tab.currentStep, 3),
      });

      setRetryMessage(null);
      setProgress(100);
      setProgressPhase('완료!');
      toast.success('SEO 분석이 완료되었습니다.');
      clearProgress();
    } catch (err: any) {
      setRetryMessage(null);
      setProgress(0);
      setProgressPhase('');
      toast.error(`SEO 분석 실패: ${err.message}`);
    } finally {
      updateTab(tabId, { isOptimizingSeo: false });
      setRetryMessage(null);
    }
  };

  const runOptimize = async (targetMetric?: SeoMetricKey) => {
    const previousScore = tab.seoScore ? tab.seoScore.total : 0;
    const previousTitle = tab.title;
    const previousScript = tab.script;
    const previousSeoScore = tab.seoScore;
    const targetMetricLabel = targetMetric ? SEO_METRIC_LABELS[targetMetric] : null;
    const isTitleFocused = targetMetric ? TITLE_FOCUSED_METRICS.includes(targetMetric) : false;
    const isScriptFocused = targetMetric ? SCRIPT_FOCUSED_METRICS.includes(targetMetric) : false;

    updateTab(tabId, { isOptimizingSeo: true });
    setRetryMessage(null);
    setProgress(0);
    setProgressPhase(targetMetricLabel ? `${targetMetricLabel} 중심 SEO 최적화 중...` : 'SEO 최적화 중...');
    setOptimizeResult(null);

    const MAX_OPTIMIZE_ATTEMPTS = targetMetric ? 1 : 3;

    if (targetMetric && previousSeoScore && previousSeoScore[targetMetric] >= 95) {
      toast.info(
        `"${targetMetricLabel}" 점수가 이미 높은 편(${previousSeoScore[targetMetric]}점)이라 추가 상승 폭이 작을 수 있습니다.`
      );
      return;
    }

    try {
      for (let attempt = 1; attempt <= MAX_OPTIMIZE_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          setProgress(0);
          setProgressPhase(`점수 하락 방지: 재시도 중... (${attempt}/${MAX_OPTIMIZE_ATTEMPTS})`);
          toast.info(`점수가 낮아져서 다시 최적화 중입니다. (${attempt}/${MAX_OPTIMIZE_ATTEMPTS})`);
        }

        const scoreDetails = previousSeoScore
          ? `\n현재 세부 점수: 제목키워드=${previousSeoScore.titleKeyword}, 검색의도=${previousSeoScore.searchIntent}, 클릭률=${previousSeoScore.clickRate}, 키워드밀도=${previousSeoScore.scriptKeywordDensity}, 시청자유입=${previousSeoScore.viewerPotential}`
          : '';
        const scopeInstruction = targetMetric
          ? isTitleFocused
            ? '\n수정 범위 제한: 제목만 수정하고, 대본 본문은 절대 수정하지 마세요.'
            : isScriptFocused
            ? '\n수정 범위 제한: 대본 본문만 수정하고, 제목은 절대 수정하지 마세요.'
            : ''
          : '';
        const targetInstruction = targetMetricLabel
          ? `\n특히 "${targetMetricLabel}" 항목을 우선적으로 올리되, 다른 항목 점수는 유지하세요.${scopeInstruction}`
          : '';
        const mustIncreaseInstruction = targetMetric
          ? `\n성공 조건: "${targetMetricLabel}" 점수는 현재보다 반드시 높아야 합니다(동점 불가). 총점은 유지 이상이면 됩니다.`
          : '\n성공 조건: SEO 총점은 현재보다 반드시 높아야 합니다. 동점은 실패입니다.';

        const result = await callGemini(
          settings.geminiApiKey, '',
          `현재 SEO 총점: ${previousScore}점${scoreDetails}${targetInstruction}${mustIncreaseInstruction}\n\n제목: ${previousTitle}\n\n대본: ${previousScript}`,
          PROMPTS.seoOptimize,
          makeProgressCallbacks('seo-optimize')
        );

        // 구분자 방식 파싱 (메인 전략)
        let optimized: { title?: string; script?: string } | null = null;

        const titleDelimMatch = result.match(/###TITLE###\s*([\s\S]*?)\s*###SCRIPT###/);
        const scriptDelimMatch = result.match(/###SCRIPT###\s*([\s\S]*?)\s*###END###/);
        if (titleDelimMatch || scriptDelimMatch) {
          optimized = {
            title: titleDelimMatch ? titleDelimMatch[1].trim() : previousTitle,
            script: scriptDelimMatch ? scriptDelimMatch[1].trim() : previousScript,
          };
        }

        // 폴백: JSON 방식
        if (!optimized) {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try { optimized = JSON.parse(jsonMatch[0]); } catch {}
          }
        }

        if (!optimized) throw new Error('응답 파싱 실패. 다시 시도해주세요.');

        // 항목별 최적화 버튼을 눌렀을 때는 수정 범위를 강제로 고정합니다.
        if (targetMetric) {
          if (isTitleFocused) {
            optimized.script = previousScript;
          } else if (isScriptFocused) {
            optimized.title = previousTitle;
          }
        }

        // 재분석하여 점수 확인
        setProgress(50);
        setProgressPhase('최적화 완료, 점수 검증 중...');

        const reanalyzeCallbacks: ProgressCallbacks = {
          onProgress: (percent, phase) => {
            setProgress(50 + Math.floor(percent / 2));
            setProgressPhase(phase);
          },
          onRetry: (attempt: number, max: number, delaySec: number) => {
            const msg = `Gemini 서버가 혼잡합니다. ${delaySec}초 후 재시도합니다... (${attempt}/${max})`;
            setRetryMessage(msg);
            toast.warning(`재분석 재시도 - ${delaySec}초 후 (${attempt}/${max})`, { id: 'gemini-retry-seo-reanalyze', duration: delaySec * 1000 + 1000 });
          },
        };

        let analysisResult = await callGemini(
          settings.geminiApiKey, '',
          `제목: ${optimized.title}\n\n대본: ${optimized.script}`,
          PROMPTS.seoAnalysis,
          reanalyzeCallbacks
        );

        const analysisMatch = analysisResult.match(/\{[\s\S]*\}/);
        if (analysisMatch) {
          const scores = JSON.parse(analysisMatch[0]);
          // 항목별 최적화 모드에서는 선택한 항목 외 점수를 고정해 UX 혼선을 막습니다.
          const adjustedScores = targetMetric
            ? {
                ...scores,
                titleKeyword:
                  targetMetric === 'titleKeyword'
                    ? scores.titleKeyword
                    : (previousSeoScore?.titleKeyword ?? scores.titleKeyword),
                searchIntent:
                  targetMetric === 'searchIntent'
                    ? scores.searchIntent
                    : (previousSeoScore?.searchIntent ?? scores.searchIntent),
                clickRate:
                  targetMetric === 'clickRate'
                    ? scores.clickRate
                    : (previousSeoScore?.clickRate ?? scores.clickRate),
                scriptKeywordDensity:
                  targetMetric === 'scriptKeywordDensity'
                    ? scores.scriptKeywordDensity
                    : (previousSeoScore?.scriptKeywordDensity ?? scores.scriptKeywordDensity),
                viewerPotential:
                  targetMetric === 'viewerPotential'
                    ? scores.viewerPotential
                    : (previousSeoScore?.viewerPotential ?? scores.viewerPotential),
              }
            : scores;

          let newTotal = Math.round(
            (adjustedScores.titleKeyword +
              adjustedScores.searchIntent +
              adjustedScores.clickRate +
              adjustedScores.scriptKeywordDensity +
              adjustedScores.viewerPotential) /
              5
          );

          let targetImproved = targetMetric
            ? adjustedScores[targetMetric] > (previousSeoScore?.[targetMetric] ?? 0)
            : true;
          const totalImproved = newTotal > previousScore;
          const totalNotDecreased = newTotal >= previousScore;
          let success = targetMetric
            ? targetImproved && totalNotDecreased
            : totalImproved;

          if (
            targetMetric === 'scriptKeywordDensity' &&
            !success &&
            (optimized.script || '') === previousScript
          ) {
            const boostedScript = boostScriptKeywordDensity(previousScript, previousTitle);
            if (boostedScript !== previousScript) {
              optimized.script = boostedScript;
              analysisResult = await callGemini(
                settings.geminiApiKey,
                '',
                `제목: ${optimized.title}\n\n대본: ${optimized.script}`,
                PROMPTS.seoAnalysis
              );
              const boostedMatch = analysisResult.match(/\{[\s\S]*\}/);
              if (boostedMatch) {
                const boostedScores = JSON.parse(boostedMatch[0]);
                adjustedScores.scriptKeywordDensity = boostedScores.scriptKeywordDensity;
                const boostedTotal = Math.round(
                  (adjustedScores.titleKeyword +
                    adjustedScores.searchIntent +
                    adjustedScores.clickRate +
                    adjustedScores.scriptKeywordDensity +
                    adjustedScores.viewerPotential) / 5
                );
                targetImproved =
                  adjustedScores.scriptKeywordDensity >
                  (previousSeoScore?.scriptKeywordDensity ?? 0);
                success = targetImproved && boostedTotal >= previousScore;
                if (success) newTotal = boostedTotal;
              }
            }
          }

          // 점수 상승/유지 검사
          if (success) {
            // 개별 항목 최적화는 성공 시 즉시 반영해 "적용" 단계를 줄입니다.
            const newSeoScore: SeoScore = { ...adjustedScores, total: newTotal };
            const nextTitle = optimized.title || previousTitle;
            const nextScript = optimized.script || previousScript;
            const previousSnapshot =
              previousSeoScore || {
                total: 0,
                titleKeyword: 0,
                searchIntent: 0,
                clickRate: 0,
                scriptKeywordDensity: 0,
                viewerPotential: 0,
              };

            if (targetMetric) {
              updateTab(tabId, {
                title: nextTitle,
                script: nextScript,
                seoScore: newSeoScore,
              });
              setOptimizeResult(null);
            } else {
              setOptimizeResult({
                title: nextTitle,
                script: nextScript,
                newScore: newSeoScore,
                previousScore: previousSnapshot,
              });
              setEditedTitle(nextTitle);
              setEditedScript(nextScript);
            }

            setRetryMessage(null);
            setProgress(100);
            setProgressPhase('완료!');
            const metricMessage = targetMetric
              ? `${targetMetricLabel} 중심 최적화 완료! ${targetMetricLabel}: ${
                  previousSnapshot[targetMetric]
                }점 → ${adjustedScores[targetMetric]}점`
              : `SEO 최적화 완료! 점수: ${previousScore}점 → ${newTotal}점 (+${newTotal - previousScore})`;
            toast.success(metricMessage);
            clearProgress();
            return; // 성공적으로 종료
          } else {
            // 개별 최적화는 1회로 종료, 전체 최적화만 재시도
            if (attempt === MAX_OPTIMIZE_ATTEMPTS) {
              if (targetMetric) {
                toast.warning(
                  `${MAX_OPTIMIZE_ATTEMPTS}회 시도 후에도 "${targetMetricLabel}" 점수를 올리지 못해 원본을 유지합니다. (현재 ${previousSeoScore?.[targetMetric] ?? 0}점)`
                );
              } else {
                toast.warning(
                  `${MAX_OPTIMIZE_ATTEMPTS}회 시도 후에도 현재 점수보다 높게 만들지 못해 원본을 유지합니다. (시도된 점수: ${newTotal}점)`
                );
              }
              setRetryMessage(null);
              setProgress(0);
              setProgressPhase('');
              updateTab(tabId, { isOptimizingSeo: false });
              return;
            }
            continue;
          }
        } else {
          throw new Error('재분석 결과 파싱 실패');
        }
      }
    } catch (err: any) {
      setRetryMessage(null);
      setProgress(0);
      setProgressPhase('');
      toast.error(`SEO 최적화 실패: ${err.message}`);
    } finally {
      updateTab(tabId, { isOptimizingSeo: false });
      setRetryMessage(null);
    }
  };

  const handleOptimize = async () => {
    await runOptimize();
  };

  const handleOptimizeMetric = async (metric: SeoMetricKey) => {
    await runOptimize(metric);
  };

  // 최적화 결과 적용
  const handleApplyOptimization = () => {
    if (!optimizeResult) return;
    updateTab(tabId, {
      title: editedTitle,
      script: editedScript,
      seoScore: optimizeResult.newScore,
    });
    toast.success('최적화된 제목과 대본이 적용되었습니다.');
    setOptimizeResult(null);
  };

  // 원본 유지
  const handleKeepOriginal = () => {
    setOptimizeResult(null);
    toast.info('원본이 유지됩니다.');
  };

  const showProgress = tab.isOptimizingSeo || (progress > 0 && progress <= 100);

  return (
    <div className="space-y-5">
      {retryMessage && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {retryMessage}
        </div>
      )}

      {/* Progress Bar */}
      {showProgress && (
        <div className="space-y-1.5">
          <div className="relative">
            <Progress value={progress} className="h-3 bg-muted/50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white drop-shadow-sm">
                {progress}%
              </span>
            </div>
          </div>
          {progressPhase && (
            <p className={cn(
              "text-xs text-center",
              progress === 100 ? "text-green-400 font-medium" : "text-muted-foreground"
            )}>
              {progressPhase}
            </p>
          )}
        </div>
      )}

      {!tab.seoScore ? (
        <div className="text-center py-8">
          <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            SEO 분석을 실행하여 점수를 확인하세요.
          </p>
          <Button
            onClick={handleAnalyze}
            disabled={tab.isOptimizingSeo || (!tab.title && !tab.script)}
            className="bg-primary hover:bg-primary/90"
          >
            {tab.isOptimizingSeo ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 분석 중... {progress > 0 && `${progress}%`}</>
            ) : (
              <><TrendingUp className="w-4 h-4 mr-2" /> SEO 분석하기</>
            )}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8 items-start">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground text-center">SEO 분석 점수</p>
              <TotalScoreGauge score={tab.seoScore.total} />
            </div>
            <div className="space-y-2 xl:border-l xl:border-border xl:pl-8">
              <p className="text-xs font-semibold text-muted-foreground text-center">SEO 최적화 결과 점수</p>
              {optimizeResult ? (
                <div className="space-y-1">
                  <TotalScoreGauge score={optimizeResult.newScore.total} />
                  <p className="text-center text-xs">
                    <span className="text-muted-foreground">{optimizeResult.previousScore.total}점</span>
                    <ArrowRight className="w-3 h-3 inline mx-1 text-muted-foreground" />
                    <span className="font-semibold">{optimizeResult.newScore.total}점</span>
                    <span className={cn(
                      'ml-1',
                      optimizeResult.newScore.total - optimizeResult.previousScore.total > 0
                        ? 'text-emerald-400'
                        : optimizeResult.newScore.total - optimizeResult.previousScore.total < 0
                        ? 'text-red-400'
                        : 'text-muted-foreground'
                    )}>
                      ({optimizeResult.newScore.total - optimizeResult.previousScore.total > 0 ? '+' : ''}
                      {optimizeResult.newScore.total - optimizeResult.previousScore.total})
                    </span>
                  </p>
                </div>
              ) : (
                <div className="h-36 flex items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
                  SEO 최적화 후 표시됩니다.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
            <div className="space-y-3 flex flex-col items-center">
              <p className="text-xs font-semibold text-muted-foreground">SEO 분석 점수</p>
              <ScoreBar
                label="제목 키워드 최적화"
                score={tab.seoScore.titleKeyword}
                onOptimize={() => handleOptimizeMetric('titleKeyword')}
                optimizing={tab.isOptimizingSeo}
              />
              <ScoreBar
                label="검색 의도 일치도"
                score={tab.seoScore.searchIntent}
                onOptimize={() => handleOptimizeMetric('searchIntent')}
                optimizing={tab.isOptimizingSeo}
              />
              <ScoreBar
                label="클릭률 예상 점수"
                score={tab.seoScore.clickRate}
                onOptimize={() => handleOptimizeMetric('clickRate')}
                optimizing={tab.isOptimizingSeo}
              />
              <ScoreBar
                label="대본 키워드 밀도"
                score={tab.seoScore.scriptKeywordDensity}
                onOptimize={() => handleOptimizeMetric('scriptKeywordDensity')}
                optimizing={tab.isOptimizingSeo}
              />
              <ScoreBar
                label="시청자 유입 가능성"
                score={tab.seoScore.viewerPotential}
                onOptimize={() => handleOptimizeMetric('viewerPotential')}
                optimizing={tab.isOptimizingSeo}
              />
            </div>

            <div className="space-y-3 xl:border-l xl:border-border xl:pl-8 flex flex-col items-center">
              <p className="text-xs font-semibold text-muted-foreground">SEO 최적화 결과 점수</p>
              {optimizeResult ? (
                <>
                  <ScoreBar
                    label="제목 키워드 최적화"
                    score={optimizeResult.newScore.titleKeyword}
                    previousScore={optimizeResult.previousScore.titleKeyword}
                  />
                  <ScoreBar
                    label="검색 의도 일치도"
                    score={optimizeResult.newScore.searchIntent}
                    previousScore={optimizeResult.previousScore.searchIntent}
                  />
                  <ScoreBar
                    label="클릭률 예상 점수"
                    score={optimizeResult.newScore.clickRate}
                    previousScore={optimizeResult.previousScore.clickRate}
                  />
                  <ScoreBar
                    label="대본 키워드 밀도"
                    score={optimizeResult.newScore.scriptKeywordDensity}
                    previousScore={optimizeResult.previousScore.scriptKeywordDensity}
                  />
                  <ScoreBar
                    label="시청자 유입 가능성"
                    score={optimizeResult.newScore.viewerPotential}
                    previousScore={optimizeResult.previousScore.viewerPotential}
                  />
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border/70 p-3 space-y-3 w-full max-w-[560px]">
                  <p className="text-xs text-muted-foreground">SEO 최적화를 실행하면 이 영역에 결과 점수가 표시됩니다.</p>
                  {Object.values(SEO_METRIC_LABELS).map((metricLabel) => (
                    <div key={metricLabel} className="space-y-1">
                      <div className="text-xs text-muted-foreground/70">{metricLabel}</div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-secondary/70 rounded-full w-3/4 min-w-[4rem]" />
                        <span className="text-xs text-muted-foreground/70 shrink-0">-점</span>
                        <span className="shrink-0 w-[66px] h-[22px]" aria-hidden />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SEO 최적화 결과 표시 섹션 */}
          {optimizeResult && (
            <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/30 space-y-4">
              <h3 className="text-sm font-semibold text-emerald-400">
                ✅ SEO 최적화 결과
              </h3>

              {/* 제목 변경 요약 */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">기존 대본 대비 변경점</label>
                <div className="rounded-md border border-border bg-secondary/20 p-2.5">
                  <div className="text-xs leading-relaxed">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 mr-2">제목 수정</span>
                    <span className="text-muted-foreground/80 mr-1">{tab.title}</span>
                    <span className="text-emerald-300">{editedTitle}</span>
                  </div>
                </div>
              </div>

              {/* 변경된 대본: 요약 + 전체 편집 */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">변경된 대본 (직접 수정 가능)</label>
                <p className="text-[11px] text-muted-foreground/80">
                  원본 대본은 STEP 1 「본문 대본」과 비교하세요. 아래는 줄 단위로 무엇이 어떻게 바뀌었는지 요약입니다.
                </p>
                <div className="rounded-md border border-border bg-secondary/20 p-2.5 space-y-1.5 max-h-48 overflow-auto">
                  {scriptChanges.length === 0 ? (
                    <p className="text-xs text-muted-foreground">대본 문장 단위 변경이 없습니다. (제목만 바뀐 경우일 수 있습니다.)</p>
                  ) : (
                    <>
                      {scriptChanges.slice(0, 40).map((change, idx) => (
                        <div key={`${change.line}-${idx}`} className="text-xs leading-relaxed">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded mr-2 align-top',
                              change.type === 'modified' && 'bg-amber-500/15 text-amber-300',
                              change.type === 'added' && 'bg-emerald-500/15 text-emerald-300',
                              change.type === 'removed' && 'bg-red-500/15 text-red-300'
                            )}
                          >
                            {change.type === 'modified' ? '수정' : change.type === 'added' ? '추가' : '삭제'} L{change.line}
                          </span>
                          {change.type === 'removed' ? (
                            <span className="text-muted-foreground/70 line-through">{change.before}</span>
                          ) : change.type === 'added' ? (
                            <span className="text-emerald-300/90">{change.after}</span>
                          ) : (
                            <>
                              <span className="text-muted-foreground/70 line-through mr-1">{change.before}</span>
                              <ArrowRight className="w-3 h-3 inline mx-0.5 text-muted-foreground/60" />
                              <span className="text-foreground/90">{change.after}</span>
                            </>
                          )}
                        </div>
                      ))}
                      {scriptChanges.length > 40 && (
                        <p className="text-[11px] text-muted-foreground">... 외 {scriptChanges.length - 40}곳 변경</p>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/70 pt-1">최적화 대본 전체 (필요 시 직접 수정)</p>
                <Textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  className="min-h-[160px] text-sm bg-secondary border-border resize-y whitespace-pre-wrap break-words"
                />
              </div>

              {/* 적용/원본유지 버튼 */}
              <div className="flex gap-2">
                <Button
                  onClick={handleApplyOptimization}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="w-4 h-4 mr-1.5" /> 이 내용 적용하기
                </Button>
                <Button
                  onClick={handleKeepOriginal}
                  variant="outline"
                  className="flex-1 border-border"
                >
                  <X className="w-4 h-4 mr-1.5" /> 원본 유지
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleAnalyze}
              disabled={tab.isOptimizingSeo}
              variant="outline"
              className="flex-1 border-border"
            >
              {tab.isOptimizingSeo ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="w-4 h-4 mr-2" />
              )}
              재분석
            </Button>
            <Button
              onClick={handleOptimize}
              disabled={tab.isOptimizingSeo}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {tab.isOptimizingSeo ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              SEO 최적화하기
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
