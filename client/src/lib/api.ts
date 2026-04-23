// 더 이상 브라우저에서 직접 Gemini API를 호출하지 않습니다.
// 서버 tRPC gemini.generate 프로시저를 통해 호출합니다.

import { trpc } from './trpc';

export interface RetryCallbacks {
  onRetry?: (attempt: number, maxRetries: number, nextDelaySec: number) => void;
  onGiveUp?: () => void;
}

export interface ProgressCallbacks extends RetryCallbacks {
  onProgress?: (percent: number, phase: string) => void;
}

class RetryableRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableRequestError';
  }
}

function createProgressSimulator(onProgress?: (percent: number, phase: string) => void) {
  let currentPercent = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const phases = [
    { upTo: 15, phase: 'API 요청 전송 중...' },
    { upTo: 35, phase: 'AI 분석 중...' },
    { upTo: 55, phase: 'AI 응답 생성 중...' },
    { upTo: 75, phase: '데이터 처리 중...' },
    { upTo: 90, phase: '결과 정리 중...' },
  ];

  function getPhase(percent: number): string {
    for (const p of phases) { if (percent <= p.upTo) return p.phase; }
    return '거의 완료...';
  }

  function start() {
    if (!onProgress) return;
    onProgress(0, '준비 중...');
    intervalId = setInterval(() => {
      if (stopped) return;
      if (currentPercent < 20) { currentPercent += Math.random() * 6 + 3; }
      else if (currentPercent < 50) { currentPercent += Math.random() * 3 + 1.5; }
      else if (currentPercent < 75) { currentPercent += Math.random() * 2 + 0.5; }
      else if (currentPercent < 97) { currentPercent += Math.random() * 0.6 + 0.15; }
      currentPercent = Math.min(currentPercent, 97);
      const rounded = Math.round(currentPercent);
      onProgress(rounded, getPhase(rounded));
    }, 400);
  }

  function complete() { stopped = true; if (intervalId) clearInterval(intervalId); onProgress?.(100, '완료!'); }
  function fail() { stopped = true; if (intervalId) clearInterval(intervalId); onProgress?.(0, ''); }
  function reset() { stopped = false; currentPercent = 0; if (intervalId) clearInterval(intervalId); }

  return { start, complete, fail, reset };
}

// callGeminiViaServer: tRPC 클라이언트를 직접 사용할 수 없으므로 (React 컴포넌트 외부),
// fetch를 통해 서버 tRPC 엔드포인트를 직접 호출합니다.
// 무한 로딩처럼 보이지 않도록 재시도 횟수/대기 시간을 낮춥니다.
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 2500;
const REQUEST_TIMEOUT_MS = 180000;

function getRetryDelay(attempt: number): number {
  return BASE_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1);
}

function shouldRetryStatus(status: number): boolean {
  // 서버 혼잡/일시 오류만 재시도
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function callGemini(
  apiKey: string,
  _model: string,
  prompt: string,
  systemInstruction?: string,
  callbacks?: ProgressCallbacks,
  abortSignal?: AbortSignal
): Promise<string> {
  let lastError: Error | null = null;
  const simulator = createProgressSimulator(callbacks?.onProgress);
  const directKey = apiKey?.trim();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      simulator.reset();
      simulator.start();

      // 요청 타임아웃 (30초)
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
      const combinedSignal = abortSignal
        ? AbortSignal.any([abortSignal, timeoutController.signal])
        : timeoutController.signal;

      let res: Response;
      try {
        if (directKey) {
          // 로컬/배포 환경과 무관하게 사용자가 입력한 Gemini 키로 직접 호출
          const requestBody = JSON.stringify({
            ...(systemInstruction
              ? {
                  systemInstruction: {
                    parts: [{ text: systemInstruction }],
                  },
                }
              : {}),
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
          });

          // 기본 모델 실패(특히 503 과부하) 시 경량 모델로 1회 즉시 폴백
          const primaryModel = 'gemini-2.5-flash';
          const fallbackModel = 'gemini-2.5-flash-lite';

          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${directKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: requestBody,
              signal: combinedSignal,
            }
          );

          if (!res.ok && (res.status === 429 || res.status === 503)) {
            callbacks?.onProgress?.(40, '기본 모델 과부하, 백업 모델로 전환 중...');
            res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${directKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody,
                signal: combinedSignal,
              }
            );
          }
        } else {
          res = await fetch('/api/trpc/gemini.generate?batch=1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              "0": {
                json: {
                  prompt,
                  systemInstruction: systemInstruction || undefined,
                  geminiApiKey: apiKey || undefined,
                },
              },
            }),
            signal: combinedSignal,
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const errText = await res.text();
        let errMsg: string;
        if (res.status === 401 || res.status === 403) {
          errMsg = `인증 오류 (${res.status}): Gemini API 키가 유효하지 않습니다. 설정에서 API 키를 확인해주세요.`;
        } else if (res.status === 500 && errText.includes('OPENAI_API_KEY is not configured')) {
          errMsg = '서버 AI 키가 설정되지 않았습니다. 관리자에게 BUILT_IN_FORGE_API_KEY 설정을 요청해주세요.';
        } else if (res.status === 503) {
          errMsg = `서버 과부하 (503): ${errText}`;
        } else {
          errMsg = `오류 ${res.status}: ${errText}`;
        }
        if (attempt < MAX_RETRIES && shouldRetryStatus(res.status)) {
          simulator.fail();
          lastError = new RetryableRequestError(errMsg);
          const delay = getRetryDelay(attempt);
          callbacks?.onRetry?.(attempt, MAX_RETRIES, Math.round(delay / 1000));
          callbacks?.onProgress?.(0, `재시도 대기 중... (${attempt}/${MAX_RETRIES})`);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            abortSignal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('중지됨', 'AbortError')); }, { once: true });
          });
          continue;
        }
        simulator.fail();
        throw new Error(errMsg);
      }

      const data = await res.json();
      const text = directKey
        ? (
            data?.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part?.text ?? '')
              .join('\n') ?? ''
          ).trim()
        : (Array.isArray(data) ? data[0] : data)?.result?.data?.json?.text;
      if (!text) {
        simulator.fail();
        throw new Error('AI에서 빈 응답을 받았습니다.');
      }

      simulator.complete();
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        simulator.fail();
        throw new Error('요청 시간이 초과되었습니다. API 키/네트워크 상태를 확인 후 다시 시도해주세요.');
      }
      const isRetryableError =
        err instanceof RetryableRequestError ||
        err?.name === 'TypeError' || // fetch 네트워크 오류
        err?.name === 'TimeoutError';

      if (attempt < MAX_RETRIES && isRetryableError) {
        simulator.fail();
        lastError = err;
        const delay = getRetryDelay(attempt);
        callbacks?.onRetry?.(attempt, MAX_RETRIES, Math.round(delay / 1000));
        callbacks?.onProgress?.(0, `재시도 대기 중... (${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delay);
          abortSignal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('중지됨', 'AbortError')); }, { once: true });
        });
        continue;
      }
      simulator.fail();
      callbacks?.onGiveUp?.();
      throw err;
    }
  }
  simulator.fail();
  throw lastError || new Error('AI 호출에 실패했습니다. 잠시 후 다시 시도해주세요.');
}

export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('/api/trpc/gemini.generate?batch=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "0": {
          json: {
            prompt: 'ping',
            systemInstruction: 'Reply with only the word "pong".',
            geminiApiKey: apiKey || undefined,
          },
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ===== Kie AI API =====
const KIE_BASE = 'https://api.kie.ai';

export interface KieGenerationResult {
  taskId: string;
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  resultUrl: string | null;
  failMsg?: string | null;
}

interface KieRequestOptions {
  signal?: AbortSignal;
}

async function callTrpcMutation<T>(path: string, input: Record<string, any>, options?: KieRequestOptions): Promise<T> {
  const res = await fetch(`/api/trpc/${path}?batch=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options?.signal,
    body: JSON.stringify({
      '0': {
        json: input,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data) || data[0]?.error) {
    const trpcMessage = data?.[0]?.error?.json?.message;
    // #region agent log
    fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H5',location:'client/src/lib/api.ts:callTrpcMutation:error',message:'tRPC mutation failed',data:{path,status:res.status,trpcMessage:trpcMessage||null,hasArrayPayload:Array.isArray(data)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error(trpcMessage || `요청 실패 (${res.status})`);
  }
  return data[0].result.data.json as T;
}

export async function generateImageKie(
  apiKey: string,
  prompt: string,
  aspectRatio: string = '16:9',
  referenceImageUrls?: string[],
  model: string = 'nano-banana-2',
  options?: KieRequestOptions
): Promise<KieGenerationResult> {
  return callTrpcMutation<KieGenerationResult>('kie.generateImage', {
    apiKey,
    model,
    prompt,
    aspectRatio,
    referenceImageUrls: referenceImageUrls && referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
  }, options);
}

// ===== Kie AI Video Generation (Kling, Veo, Runway) =====
type VideoModel = 'kling_standard' | 'kling_pro' | 'veo3_fast' | 'veo3_quality' | 'runway_gen4';

export async function generateVideoKie(
  apiKey: string,
  imageUrl: string,
  prompt: string,
  videoMode: VideoModel,
  aspectRatio: string = '16:9',
  options?: KieRequestOptions
): Promise<KieGenerationResult> {
  return callTrpcMutation<KieGenerationResult>('kie.generateVideo', {
    apiKey,
    imageUrl,
    prompt: prompt || 'Gentle cinematic motion',
    videoMode,
    aspectRatio,
    duration: '5',
    quality: '720p',
  }, options);
}

// ===== Vidu AI API (주석 처리 - 보존용) =====
/*
const VIDU_BASE = 'https://api.vidu.com';

export async function generateVideoVidu(apiKey: string, imageUrl: string, prompt: string = '', duration: number = 4): Promise<string> {
  const body: any = { model: 'vidu-2.0', images: [{ url: imageUrl, type: 'subject' }], prompt: prompt || 'Gentle cinematic motion, slow zoom in', duration, resolution: '720p' };
  const createRes = await fetch(`${VIDU_BASE}/ent/v1/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${apiKey}` }, body: JSON.stringify(body) });
  if (!createRes.ok) { const err = await createRes.json().catch(() => ({})); throw new Error(err?.error?.message || err?.message || `Vidu AI 오류: ${createRes.status}`); }
  const createData = await createRes.json();
  const taskId = createData.data?.task_id || createData.task_id;
  if (!taskId) { throw new Error('Vidu AI: task_id를 받지 못했습니다.'); }
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${VIDU_BASE}/ent/v1/tasks/${taskId}`, { headers: { 'Authorization': `Token ${apiKey}` } });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = pollData.data?.status || pollData.state;
    if (status === 'success' || status === 'completed') { const videoUrl = pollData.data?.output?.video?.url || pollData.data?.creations?.[0]?.url; if (videoUrl) return videoUrl; }
    if (status === 'failed') { throw new Error('Vidu AI: 동영상 생성 실패'); }
  }
  throw new Error('Vidu AI: 동영상 생성 시간 초과');
}

export async function validateViduKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) return { valid: false, error: 'API 키를 입력해주세요.' };
  try {
    const res = await fetch(`${VIDU_BASE}/ent/v1/tasks?page_size=1`, { method: 'GET', headers: { 'Authorization': `Token ${apiKey}` } });
    if (res.status === 401 || res.status === 403) return { valid: false, error: 'API 키가 올바르지 않습니다.' };
    if (res.ok || res.status === 404) return { valid: true };
    return { valid: false, error: `Vidu AI 응답 오류: ${res.status}` };
  } catch { return { valid: false, error: '네트워크 오류가 발생했습니다.' }; }
}
*/

export async function validateKieKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) return { valid: false, error: 'API 키를 입력해주세요.' };
  try {
    const res = await fetch(`${KIE_BASE}/v1/images/models`, { method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (res.status === 401 || res.status === 403) return { valid: false, error: 'API 키가 올바르지 않습니다.' };
    if (res.ok || res.status === 404) return { valid: true };
    return { valid: false, error: `Kie AI 응답 오류: ${res.status}` };
  } catch { return { valid: false, error: '네트워크 오류가 발생했습니다.' }; }
}

export async function validateSupertoneKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) return { valid: false, error: 'API 키를 입력해주세요.' };
  try {
    const res = await fetch('https://supertoneapi.com/v1/voices', { method: 'GET', headers: { 'x-sup-api-key': apiKey } });
    if (res.status === 401 || res.status === 403) return { valid: false, error: 'API 키가 올바르지 않습니다.' };
    if (res.ok || res.status === 404) return { valid: true };
    return { valid: false, error: `Supertone 응답 오류: ${res.status}` };
  } catch { return { valid: false, error: '네트워크 오류가 발생했습니다.' }; }
}

export function validateGcsSettings(gcs: { bucketName: string; projectId: string; clientEmail: string; privateKey: string }): { valid: boolean; error?: string } {
  if (!gcs.bucketName.trim()) return { valid: false, error: '버킷 이름을 입력해주세요.' };
  if (!gcs.projectId.trim()) return { valid: false, error: '프로젝트 ID를 입력해주세요.' };
  if (!gcs.clientEmail.trim()) return { valid: false, error: '서비스 계정 이메일을 입력해주세요.' };
  if (!gcs.clientEmail.includes('@') || !gcs.clientEmail.includes('.iam.gserviceaccount.com')) { return { valid: false, error: '서비스 계정 이메일 형식이 올바르지 않습니다.' }; }
  if (!gcs.privateKey.trim()) return { valid: false, error: 'Private Key를 입력해주세요.' };
  if (!gcs.privateKey.includes('BEGIN PRIVATE KEY') && !gcs.privateKey.includes('BEGIN RSA PRIVATE KEY')) { return { valid: false, error: 'Private Key 형식이 올바르지 않습니다.' }; }
  return { valid: true };
}

// ===== Prompt Templates =====
export const PROMPTS = {
  splitScript: `당신은 심리학 유튜브 채널의 대본 분석 전문가입니다.
주어진 텍스트에서 제목과 본문 대본을 분리해주세요.

중요 규칙:
- 텍스트에 영문 프롬프트, Image Prompt, EN TTS Script, EN Subtitle, FX Tag, Video Motion Prompt 등 영상 제작 메타데이터가 포함되어 있다면 모두 제거하고, 순수 한국어 나레이션 대본(KR Script)만 추출하세요.
- [Phase], [섹션], [장면] 등의 구조 태그가 있다면 제거하고 대본 내용만 이어서 작성하세요.
- script에는 반드시 한국어 나레이션 텍스트만 포함하세요.
- 대본이 이미 제목과 본문으로 구분되어 있다면 그대로 분리하세요.
- 대본에 제목이 명시되어 있지 않다면 내용을 분석하여 적절한 제목을 생성하세요.

반드시 아래 구분자 형식으로만 응답하세요. JSON을 사용하지 마세요:

###TITLE###
여기에 제목만 작성
###SCRIPT###
여기에 본문 대본 전체를 작성
###END###`,

  seoAnalysis: `당신은 유튜브 SEO 전문가입니다. 주어진 제목과 대본을 분석하여 SEO 점수를 매겨주세요.
각 항목을 0~100점으로 평가하세요:
1. titleKeyword: 제목 키워드 최적화
2. searchIntent: 검색 의도 일치도
3. clickRate: 클릭률 예상 점수
4. scriptKeywordDensity: 대본 키워드 밀도
5. viewerPotential: 시청자 유입 가능성
반드시 아래 JSON 형식으로만 응답하세요:
{"titleKeyword": 점수, "searchIntent": 점수, "clickRate": 점수, "scriptKeywordDensity": 점수, "viewerPotential": 점수, "suggestions": {"titleKeyword": "제안", "searchIntent": "제안", "clickRate": "제안", "scriptKeywordDensity": "제안", "viewerPotential": "제안"}}`,

  seoOptimize: `당신은 유튜브 SEO 최적화 전문가입니다. 주어진 제목과 대본을 SEO 관점에서 개선해주세요.

[절대 규칙] 현재 SEO 점수가 제공됩니다. 최적화 후 모든 항목(titleKeyword, searchIntent, clickRate, scriptKeywordDensity, viewerPotential)의 점수가 반드시 현재보다 같거나 높아야 합니다. 점수가 낮아지는 변경은 절대 하지 마세요.

개선 방향:
- 현재 점수보다 반드시 더 높은 점수가 나오도록 개선하세요. 특히 가장 낮은 항목을 집중 개선하세요.
- 제목에 검색량 높은 키워드를 자연스럽게 포함하세요. 기존 키워드는 유지하면서 추가하세요.
- 클릭을 유도하는 감성적이고 궁금증을 자극하는 제목으로 개선하세요.
- 대본의 기존 내용은 최대한 유지하면서 핵심 키워드를 자연스럽게 더 배치하세요.
- 시청자의 검색 의도에 맞는 내용으로 보강하세요.
- 대본의 전체 길이와 구조를 유지하면서 키워드 밀도를 높이세요.

반드시 아래 구분자 형식으로만 응답하세요. JSON을 사용하지 마세요:

###TITLE###
여기에 개선된 제목만 작성
###SCRIPT###
여기에 개선된 본문 대본 전체를 작성
###END###`,

  analyzeScenes: (
    aspectRatio: string,
    imageStyle: string = 'natural',
    targetSceneCount: number = 15,
    options?: {
      imagePromptLang?: 'en' | 'ko';
      ttsLang?: 'en' | 'ko';
      subtitleLang?: 'en' | 'ko';
      motionPromptLang?: 'en' | 'ko';
    }
  ) => `당신은 심리학 유튜브 영상의 스토리보드 전문가입니다.
주어진 대본을 분석하여 장면별 이미지 프롬프트, TTS 스크립트, 자막을 생성해주세요.
비율: ${aspectRatio}
이미지 스타일: ${imageStyle}
목표 장면 수: ${targetSceneCount}개
출력 언어 선택:
- 이미지 프롬프트 우선 언어: ${options?.imagePromptLang ?? 'en'}
- TTS 우선 언어: ${options?.ttsLang ?? 'en'}
- 자막 우선 언어: ${options?.subtitleLang ?? 'en'}
- 모션 프롬프트 우선 언어: ${options?.motionPromptLang ?? 'en'}

대본의 흐름에 맞게 목표 장면 수에 가깝게 장면을 나누고, 각 장면에 대해:
1. 영문 이미지 프롬프트 (Kie AI Nano Banana 2 모델용, 이미지 스타일 반영, 상세하고 구체적)
2. 한글 이미지 프롬프트 (참고용)
3. 추천 효과 (아래 10가지 중 장면 내용과 분위기에 맞는 것을 선택)
4. 효과 지속 시간 (ttsScript 길이 기준: 50자 미만→2.5, 50~100자→3.5, 100자 이상→4.5)
5. 동영상 모션 프롬프트 (영문, 카메라 움직임 설명)
6. EN TTS Script (영문 나레이션 스크립트)
7. EN Subtitle (영문 자막, ①②③ 형태로 구분)
8. KR TTS Script (한국어 TTS)
9. KR Subtitle (한국어 자막, ①②③ 형태로 구분)
10. Image Prompt (KO) / Video Motion Prompt (KO)

★★★ 최우선 규칙: 대본에 이미 메타가 있으면 그대로 사용 ★★★
- 장면에 "Image Prompt:"가 있으면 promptEn/promptKo를 해당 텍스트에서 추출해 그대로 사용하세요.
- 장면에 "EN TTS Script:"가 있으면 ttsScript로 그대로 사용하세요.
- 장면에 "EN Subtitle:"가 있으면 subtitleEn으로 그대로 사용하세요.
- 장면에 "Video Motion Prompt:"가 있으면 videoMotionPrompt로 그대로 사용하세요.
- 대본에 없는 항목만 보완 생성하세요. 이미 있는 항목을 임의로 바꾸지 마세요.

★★★ FX Tag / 장면 분위기 기반 effectType 규칙 ★★★
- "FX Tag" 또는 장면 설명의 분위기를 보고 아래 10개 effectType 중 하나를 반드시 선택하세요.
- effectType는 반드시 다음 중 하나만 사용: fade-in, fade-out, fade-in-hold, zoom-in, zoom-in-slow, zoom-out, hold, pan-left-to-right, pan-right-to-left, shake
- 효과 지속시간(effectDuration)은 ttsScript 길이 기준 규칙을 따르세요.

★★★ 중요: [TTS]와 [SUB] 태그 원본 사용 규칙 ★★★
대본 안에 [TTS]로 시작하는 텍스트가 있는 장면은 그 텍스트를 ttsScript로 그대로 사용하세요. 새로 작성하지 마세요.
[SUB]로 시작하는 텍스트가 있는 장면은 그 텍스트를 subtitleEn으로 그대로 사용하세요. 새로 작성하지 마세요.
[TTS]나 [SUB] 태그가 없는 장면만 새로 생성하세요.
태그 텍스트를 추출할 때 [TTS]나 [SUB] 접두어 자체는 제거하고 내용만 사용하세요.

예시:
대본에 "[TTS] Have you ever had this strange experience?" 가 있으면
ttsScript: "Have you ever had this strange experience?"
대본에 "[SUB] ①Have you ever ②They suddenly ③Why does" 가 있으면
subtitleEn: "①Have you ever ②They suddenly ③Why does"

effectType 선택 기준:
- "fade-in": 도입부, 첫 등장, 조용한 시작 장면
- "fade-out": 마무리, 결론, 감동적인 장면
- "fade-in-hold": 오프닝 타이틀, 장면 전환 시작 장면
- "zoom-in": 강조, 클로즈업, 핵심 포인트 장면 (기본값)
- "zoom-in-slow": 긴 설명, 천천히 집중시키는 장면
- "zoom-out": 전체 상황 설명, 배경 묘사 장면
- "hold": 충격적 사실, 정적인 강조 장면
- "pan-left-to-right": 이동, 흐름 연결, 전환 장면
- "pan-right-to-left": 이동, 흐름 연결, 전환 장면 (반대 방향)
- "shake": 긴장감, 충격, 위기 장면

반드시 아래 JSON 배열 형식으로만 응답하세요:
[{"promptEn":"영문 프롬프트","promptKo":"한글 프롬프트","effectType":"zoom-in","effectDuration":2.5,"videoMotionPrompt":"영문 모션 프롬프트","videoMotionPromptKo":"한글 모션 프롬프트","ttsScript":"EN TTS Script","ttsScriptKo":"KR TTS Script","subtitleEn":"①EN1②EN2③EN3","subtitleKo":"①KR1②KR2③KR3"}]`,

  analyzeCharacters: `당신은 영상 대본 분석 전문가입니다.
주어진 대본에서 등장하는 화자(캐릭터)를 분석해주세요.
나레이터(해설자)는 항상 포함합니다.
대본에서 직접 발화하는 캐릭터가 있으면 추가로 포함합니다.
반드시 아래 JSON 형식으로만 응답하세요:
{"characters": [{"role": "나레이터", "description": "차분하고 전문적인 해설 목소리"}, {"role": "캐릭터명", "description": "해당 캐릭터의 목소리 특성 설명"}]}`,

  extractShorts: `당신은 심리학 유튜브 쇼츠 전문가입니다.
주어진 메인 영상 대본에서 쇼츠용 대본 7개를 추출해주세요.
각 쇼츠는: 30~60초 분량, 독립적으로 이해 가능한 내용, 흥미를 끌 수 있는 핵심 포인트
반드시 아래 JSON 형식으로만 응답하세요:
{"shorts": [{"title": "쇼츠1 제목", "script": "쇼츠1 대본"}, {"title": "쇼츠2 제목", "script": "쇼츠2 대본"}, {"title": "쇼츠3 제목", "script": "쇼츠3 대본"}, {"title": "쇼츠4 제목", "script": "쇼츠4 대본"}, {"title": "쇼츠5 제목", "script": "쇼츠5 대본"}, {"title": "쇼츠6 제목", "script": "쇼츠6 대본"}, {"title": "쇼츠7 제목", "script": "쇼츠7 대본"}]}`,
};
