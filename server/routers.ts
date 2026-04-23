import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);
const KIE_BASE_URL = "https://api.kie.ai";
type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

function getKieHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function normalizeKieState(raw: string | undefined): KieTaskState {
  if (!raw) return "waiting";
  const value = raw.toLowerCase();
  if (value === "success" || value === "succeed" || value === "completed") return "success";
  if (value === "fail" || value === "failed" || value === "error") return "fail";
  if (value === "queuing" || value === "queueing" || value === "queued") return "queuing";
  if (value === "generating" || value === "processing" || value === "running") return "generating";
  return "waiting";
}

async function kieCreateTask(apiKey: string, payload: Record<string, unknown>) {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: getKieHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  const code = typeof data?.code === "string" ? Number(data.code) : data?.code;
  if (!res.ok || (typeof code === "number" && code !== 200)) {
    throw new Error(data?.msg || data?.message || `Kie createTask 오류: ${res.status}`);
  }
  const taskId = data?.data?.taskId || data?.data?.task_id;
  if (!taskId) throw new Error("Kie createTask 응답에 taskId가 없습니다.");
  return { taskId: String(taskId), raw: data };
}

async function kieGetTaskRecordInfo(apiKey: string, taskId: string) {
  const url = new URL(`${KIE_BASE_URL}/api/v1/jobs/recordInfo`);
  url.searchParams.set("taskId", taskId);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  const code = typeof data?.code === "string" ? Number(data.code) : data?.code;
  if (!res.ok || (typeof code === "number" && code !== 200)) {
    throw new Error(data?.msg || `Kie task 조회 오류: ${res.status}`);
  }
  return data;
}

function extractResultUrlFromRecordInfo(data: any): string | null {
  const resultJsonRaw = data?.data?.resultJson;
  if (typeof resultJsonRaw === "string") {
    try {
      const parsed = JSON.parse(resultJsonRaw);
      if (Array.isArray(parsed?.resultUrls) && parsed.resultUrls.length > 0) {
        return parsed.resultUrls[0];
      }
      if (Array.isArray(parsed?.images) && parsed.images.length > 0) {
        return parsed.images[0]?.url || parsed.images[0];
      }
      if (parsed?.video_url) return parsed.video_url;
      if (parsed?.videoUrl) return parsed.videoUrl;
      if (parsed?.image_url) return parsed.image_url;
      if (parsed?.imageUrl) return parsed.imageUrl;
      if (parsed?.output?.image_url) return parsed.output.image_url;
      if (parsed?.output?.video_url) return parsed.output.video_url;
    } catch {}
  }
  if (Array.isArray(data?.data?.resultUrls) && data.data.resultUrls.length > 0) {
    return data.data.resultUrls[0];
  }
  if (Array.isArray(data?.data?.images) && data.data.images.length > 0) {
    return data.data.images[0]?.url || data.data.images[0];
  }
  if (data?.data?.output?.image_url) return data.data.output.image_url;
  if (data?.data?.output?.video_url) return data.data.output.video_url;
  const videoInfo = data?.data?.videoInfo;
  if (videoInfo?.videoUrl) return videoInfo.videoUrl;
  if (videoInfo?.imageUrl) return videoInfo.imageUrl;
  return null;
}

async function runwayGenerate(apiKey: string, payload: Record<string, unknown>) {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/runway/generate`, {
    method: "POST",
    headers: getKieHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  const code = typeof data?.code === "string" ? Number(data.code) : data?.code;
  if (!res.ok || (typeof code === "number" && code !== 200)) {
    throw new Error(data?.msg || data?.message || `Runway generate 오류: ${res.status}`);
  }
  const taskId = data?.data?.taskId || data?.data?.task_id;
  if (!taskId) throw new Error("Runway 응답에 taskId가 없습니다.");
  return { taskId: String(taskId), raw: data };
}

async function runwayGetTask(apiKey: string, taskId: string) {
  const url = new URL(`${KIE_BASE_URL}/api/v1/runway/record-detail`);
  url.searchParams.set("taskId", taskId);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json().catch(() => ({}));
  const code = typeof data?.code === "string" ? Number(data.code) : data?.code;
  if (!res.ok || (typeof code === "number" && code !== 200)) {
    throw new Error(data?.msg || `Runway task 조회 오류: ${res.status}`);
  }
  return data;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== 프로젝트 관리 =====
  project: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getProjectsByUser(ctx.user.id);
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getProjectById(input.id, ctx.user.id);
      }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(255), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createProject({ userId: ctx.user.id, name: input.name, description: input.description });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(255).optional(), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await db.updateProject(id, ctx.user.id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteProject(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ===== Gemini AI 서버 프록시 =====
  gemini: router({
    generate: publicProcedure
      .input(z.object({
        prompt: z.string().min(1),
        systemInstruction: z.string().optional(),
        geminiApiKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const directGeminiKey = input.geminiApiKey?.trim();

        // 1) 사용자가 직접 입력한 Gemini API 키가 있으면 해당 키로 우선 호출
        if (directGeminiKey) {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${directGeminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...(input.systemInstruction
                  ? {
                      systemInstruction: {
                        parts: [{ text: input.systemInstruction }],
                      },
                    }
                  : {}),
                contents: [
                  {
                    role: "user",
                    parts: [{ text: input.prompt }],
                  },
                ],
              }),
            }
          );

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            if (geminiRes.status === 400 && errText.includes("API_KEY_INVALID")) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Gemini API 키가 유효하지 않습니다. 설정에서 키를 다시 입력해주세요.",
              });
            }
            if (geminiRes.status === 403) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Gemini API 키 권한이 없습니다. API 제한/결제 상태를 확인해주세요.",
              });
            }
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Gemini API 오류(${geminiRes.status})가 발생했습니다.`,
            });
          }

          const geminiData = await geminiRes.json();
          const parts = geminiData?.candidates?.[0]?.content?.parts;
          const text = Array.isArray(parts)
            ? parts
                .map((part: { text?: string }) => (typeof part?.text === "string" ? part.text : ""))
                .join("\n")
                .trim()
            : "";

          if (!text) {
            const finishReason = geminiData?.candidates?.[0]?.finishReason;
            const blockReason = geminiData?.promptFeedback?.blockReason;
            const details = blockReason || finishReason || "EMPTY_RESPONSE";
            throw new Error(`Gemini API에서 유효한 텍스트 응답이 없습니다. (${details})`);
          }

          return { text };
        }

        // 2) 입력 키가 없으면 즉시 안내 (서버 내장 키 fallback 사용 안 함)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Gemini API 키가 비어 있습니다. 설정에서 API 키를 입력해주세요.",
        });
      }),

    analyzeImage: publicProcedure
      .input(z.object({
        imageBase64: z.string().optional(),
        imageUrl: z.string().url().optional(),
        mimeType: z.string().default('image/jpeg'),
        geminiApiKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { ENV } = await import('./_core/env');
        const apiKey = (ENV as any).geminiApiKey || input.geminiApiKey?.trim();
        if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
        if (!input.imageBase64 && !input.imageUrl) {
          throw new Error('분석할 이미지 데이터가 없습니다.');
        }

        const VALID_STYLES = [
          '레퍼런스 이미지', '인물 풍성', '내추럴', '에디토리얼', '일러스트',
          '3D 캐릭터', '리소그래프', '픽셀아트', '유화', '한국 전통화',
          '카툰', '팝 초현실', '비브런트 필름', '패션 포토', '글리치 콜라주',
          '레트로 필름', '크로스프로세스', '와일드 풍경', '볼드 라인', '수채화',
        ];

        const systemPrompt = `You are an expert at analyzing illustration and art styles.
Analyze the provided character reference image and recommend the single most suitable image style from the following options:
레퍼런스 이미지, 인물 풍성, 내추럴, 에디토리얼, 일러스트, 3D 캐릭터, 리소그래프, 픽셀아트, 유화, 한국 전통화, 카툰, 팝 초현실, 비브런트 필름, 패션 포토, 글리치 콜라주, 레트로 필름, 크로스프로세스, 와일드 풍경, 볼드 라인, 수채화

Respond with ONLY the Korean style name exactly as written above. No explanation needed.`;

        let imageBase64 = input.imageBase64;
        let mimeType = input.mimeType || 'image/jpeg';

        if (!imageBase64 && input.imageUrl) {
          const imageRes = await fetch(input.imageUrl);
          if (!imageRes.ok) {
            throw new Error(`이미지 다운로드 실패: ${imageRes.status}`);
          }
          const imageBuf = Buffer.from(await imageRes.arrayBuffer());
          imageBase64 = imageBuf.toString('base64');
          const ct = imageRes.headers.get('content-type');
          if (ct) mimeType = ct;
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
              generationConfig: { maxOutputTokens: 50 },
            }),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini Vision API 오류: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '내추럴';
        const matched = VALID_STYLES.find(s => rawText.includes(s));
        return { style: matched || '내추럴' };
      }),
  }),

  // ===== Kie AI 생성 =====
  kie: router({
    generateImage: publicProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        model: z.string().min(1),
        prompt: z.string().min(1),
        aspectRatio: z.string().default("16:9"),
        referenceImageUrls: z.array(z.string().url()).optional(),
        pollIntervalMs: z.number().min(1000).max(10000).default(3000),
        maxPollCount: z.number().min(10).max(300).default(120),
        callBackUrl: z.string().url().optional(),
      }))
      .mutation(async ({ input }) => {
        // #region agent log
        fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H1',location:'server/routers.ts:generateImage:start',message:'server image generation started',data:{model:input.model,aspectRatio:input.aspectRatio,hasReferenceImages:!!(input.referenceImageUrls&&input.referenceImageUrls.length>0)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const createPayload: Record<string, unknown> = {
          model: input.model,
          input: {
            prompt: input.prompt,
            aspect_ratio: input.aspectRatio,
            ...(input.referenceImageUrls && input.referenceImageUrls.length > 0
              ? { image_input: input.referenceImageUrls }
              : {}),
          },
          ...(input.callBackUrl ? { callBackUrl: input.callBackUrl } : {}),
        };

        let taskId: string;
        try {
          const created = await kieCreateTask(input.apiKey, createPayload);
          taskId = created.taskId;
        } catch (error: any) {
          const message = String(error?.message || "");
          const hasReferenceImages = !!(input.referenceImageUrls && input.referenceImageUrls.length > 0);
          const isFileTypeError =
            message.toLowerCase().includes("file type not supported") ||
            message.toLowerCase().includes("unsupported") ||
            message.toLowerCase().includes("image format");

          // 참조 이미지 포맷 문제일 때는 텍스트 프롬프트만으로 자동 재시도
          if (hasReferenceImages && isFileTypeError) {
            const fallbackPayload: Record<string, unknown> = {
              model: input.model,
              input: {
                prompt: input.prompt,
                aspect_ratio: input.aspectRatio,
              },
              ...(input.callBackUrl ? { callBackUrl: input.callBackUrl } : {}),
            };
            const created = await kieCreateTask(input.apiKey, fallbackPayload);
            taskId = created.taskId;
          } else {
            throw error;
          }
        }
        // #region agent log
        fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H2',location:'server/routers.ts:generateImage:taskCreated',message:'task created for image generation',data:{taskId},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        for (let i = 0; i < input.maxPollCount; i++) {
          await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
          const detail = await kieGetTaskRecordInfo(input.apiKey, taskId);
          const state = normalizeKieState(detail?.data?.state);
          if (i === 0 || i % 10 === 0 || state === "success" || state === "fail") {
            // #region agent log
            fetch('http://127.0.0.1:7396/ingest/1afd1c7a-6278-4472-a50c-eaf839810218',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a1fce'},body:JSON.stringify({sessionId:'0a1fce',runId:'run1',hypothesisId:'H3',location:'server/routers.ts:generateImage:poll',message:'polling image task state',data:{taskId,iteration:i,state,hasResultUrl:!!extractResultUrlFromRecordInfo(detail),failMsg:detail?.data?.failMsg||null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
          }
          if (state === "success") {
            const resultUrl = extractResultUrlFromRecordInfo(detail);
            if (!resultUrl) {
              continue;
            }
            return {
              taskId,
              state,
              resultUrl,
            };
          }
          if (state === "fail") {
            return {
              taskId,
              state,
              resultUrl: null,
              failMsg: detail?.data?.failMsg || detail?.msg || "이미지 생성 실패",
            };
          }
        }

        return {
          taskId,
          state: "generating" as KieTaskState,
          resultUrl: null,
          failMsg: "이미지 생성이 아직 완료되지 않았습니다. 잠시 후 다시 확인해주세요.",
        };
      }),

    generateVideo: publicProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        videoMode: z.enum(["kling_standard", "kling_pro", "veo3_fast", "veo3_quality", "runway_gen4"]),
        prompt: z.string().min(1),
        imageUrl: z.string().url(),
        aspectRatio: z.string().default("16:9"),
        duration: z.enum(["5", "10"]).default("5"),
        quality: z.enum(["720p", "1080p"]).default("720p"),
        pollIntervalMs: z.number().min(1000).max(10000).default(3000),
        maxPollCount: z.number().min(10).max(300).default(180),
        callBackUrl: z.string().url().optional(),
      }))
      .mutation(async ({ input }) => {
        // Runway는 전용 API를 사용
        if (input.videoMode === "runway_gen4") {
          const runwayPayload: Record<string, unknown> = {
            prompt: input.prompt,
            imageUrl: input.imageUrl,
            duration: Number(input.duration),
            quality: input.quality,
            waterMark: "",
            ...(input.callBackUrl ? { callBackUrl: input.callBackUrl } : {}),
          };
          const { taskId } = await runwayGenerate(input.apiKey, runwayPayload);
          for (let i = 0; i < input.maxPollCount; i++) {
            await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
            const detail = await runwayGetTask(input.apiKey, taskId);
            const state = normalizeKieState(detail?.data?.state);
            if (state === "success") {
              const resultUrl = detail?.data?.videoInfo?.videoUrl || null;
              return { taskId, state, resultUrl };
            }
            if (state === "fail") {
              return {
                taskId,
                state,
                resultUrl: null,
                failMsg: detail?.data?.failMsg || detail?.msg || "영상 생성 실패",
              };
            }
          }
          return {
            taskId,
            state: "generating" as KieTaskState,
            resultUrl: null,
            failMsg: "영상 생성이 아직 완료되지 않았습니다. 잠시 후 다시 확인해주세요.",
          };
        }

        // Kling/기타 Market 모델은 createTask + recordInfo를 사용
        const model =
          input.videoMode === "kling_pro"
            ? "kling/v2-1-master-image-to-video"
            : input.videoMode === "kling_standard"
              ? "kling/v2-1-standard-image-to-video"
              : input.videoMode === "veo3_fast"
                ? "veo3_fast"
                : "veo3_quality";

        const createPayload: Record<string, unknown> = {
          model,
          input: {
            prompt: input.prompt,
            duration: input.duration,
            ...(input.videoMode === "kling_pro"
              ? { image_url: input.imageUrl }
              : { image_urls: [input.imageUrl], sound: false }),
          },
          ...(input.callBackUrl ? { callBackUrl: input.callBackUrl } : {}),
        };

        const { taskId } = await kieCreateTask(input.apiKey, createPayload);

        for (let i = 0; i < input.maxPollCount; i++) {
          await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
          const detail = await kieGetTaskRecordInfo(input.apiKey, taskId);
          const state = normalizeKieState(detail?.data?.state);
          if (state === "success") {
            const resultUrl = extractResultUrlFromRecordInfo(detail);
            if (!resultUrl) {
              continue;
            }
            return { taskId, state, resultUrl };
          }
          if (state === "fail") {
            return {
              taskId,
              state,
              resultUrl: null,
              failMsg: detail?.data?.failMsg || detail?.msg || "영상 생성 실패",
            };
          }
        }

        return {
          taskId,
          state: "generating" as KieTaskState,
          resultUrl: null,
          failMsg: "영상 생성이 아직 완료되지 않았습니다. 잠시 후 다시 확인해주세요.",
        };
      }),

    getTask: publicProcedure
      .input(z.object({
        apiKey: z.string().min(1),
        taskId: z.string().min(1),
        provider: z.enum(["market", "runway"]).default("market"),
      }))
      .query(async ({ input }) => {
        if (input.provider === "runway") {
          const data = await runwayGetTask(input.apiKey, input.taskId);
          const state = normalizeKieState(data?.data?.state);
          return {
            taskId: input.taskId,
            state,
            resultUrl: data?.data?.videoInfo?.videoUrl || null,
            failMsg: data?.data?.failMsg || data?.msg || null,
          };
        }
        const data = await kieGetTaskRecordInfo(input.apiKey, input.taskId);
        const state = normalizeKieState(data?.data?.state);
        return {
          taskId: input.taskId,
          state,
          resultUrl: extractResultUrlFromRecordInfo(data),
          failMsg: data?.data?.failMsg || data?.msg || null,
        };
      }),
  }),

  // ===== 외부 API 키 검증 (CORS 우회 서버 프록시) =====
  validateApiKey: router({
    supertone: protectedProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        try {
          const res = await fetch('https://supertoneapi.com/v1/voices', {
            method: 'GET',
            headers: { 'x-sup-api-key': input.apiKey },
          });
          if (res.status === 401 || res.status === 403) return { valid: false, error: 'API 키가 올바르지 않습니다.' };
          if (res.ok || res.status === 404) return { valid: true };
          return { valid: false, error: `Supertone 응답 오류: ${res.status}` };
        } catch (e: any) {
          return { valid: false, error: `서버 프록시 오류: ${e.message || '알 수 없는 오류'}` };
        }
      }),
    kie: protectedProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        try {
          const res = await fetch('https://api.kie.ai/v1/images/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${input.apiKey}` },
          });
          if (res.status === 401 || res.status === 403) return { valid: false, error: 'API 키가 올바르지 않습니다.' };
          if (res.ok || res.status === 404) return { valid: true };
          return { valid: false, error: `Kie AI 응답 오류: ${res.status}` };
        } catch (e: any) {
          return { valid: false, error: `서버 프록시 오류: ${e.message || '알 수 없는 오류'}` };
        }
      }),
    vidu: protectedProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        try {
          const res = await fetch('https://api.vidu.com/ent/v1/tasks?page_size=1', {
            method: 'GET',
            headers: { 'Authorization': `Token ${input.apiKey}` },
          });
          if (res.status === 401 || res.status === 403) return { valid: false, error: 'API 키가 올바르지 않습니다.' };
          if (res.ok || res.status === 404) return { valid: true };
          return { valid: false, error: `Vidu AI 응답 오류: ${res.status}` };
        } catch (e: any) {
          return { valid: false, error: `서버 프록시 오류: ${e.message || '알 수 없는 오류'}` };
        }
      }),
  }),

  // ===== Supertone TTS =====
  supertone: router({
    getVoices: protectedProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .query(async ({ input }) => {
        const allVoices: Array<{
          voice_id: string;
          name: string;
          description?: string;
          age?: string;
          gender?: string;
          use_case?: string;
          use_cases?: string[];
          language?: string[];
          styles?: string[];
          samples?: Array<{ language: string; style: string; model: string; url: string }>;
          thumbnail_image_url?: string;
        }> = [];

        let nextPageToken: string | undefined = undefined;
        let pageCount = 0;
        const MAX_PAGES = 10;

        do {
          const url = new URL('https://supertoneapi.com/v1/voices');
          url.searchParams.set('page_size', '100');
          if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

          const res = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'x-sup-api-key': input.apiKey },
          });
          if (!res.ok) {
            throw new Error(`Supertone 음성 목록 조회 실패: ${res.status}`);
          }
          const data = await res.json();

          const items = Array.isArray(data) ? data : (data.items || data.voices || data.data || []);
          allVoices.push(...items);

          nextPageToken = data.next_page_token || undefined;
          pageCount++;
        } while (nextPageToken && pageCount < MAX_PAGES);

        return allVoices;
      }),

    generateTTS: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        voiceId: z.string().min(1),
        speechRate: z.number().min(0.5).max(2.0).default(1.0),
        language: z.enum(['ko', 'en', 'ja']).default('en'),
        apiKey: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        // Supertone 공식 API: POST /v1/text-to-speech/{voice_id}?output_format=mp3
        const voiceId = encodeURIComponent(input.voiceId);
        const apiUrl = `https://supertoneapi.com/v1/text-to-speech/${voiceId}?output_format=mp3`;

        // 텍스트 300자 제한 처리
        const MAX_CHARS = 300;
        const textChunks: string[] = [];
        if (input.text.length > MAX_CHARS) {
          const sentences = input.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [input.text];
          let currentChunk = '';
          for (const sentence of sentences) {
            if ((currentChunk + sentence).length > MAX_CHARS && currentChunk.length > 0) {
              textChunks.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              currentChunk += sentence;
            }
          }
          if (currentChunk.trim()) textChunks.push(currentChunk.trim());
        } else {
          textChunks.push(input.text);
        }

        const audioBuffers: Buffer[] = [];
        let totalDuration = 0;

        for (const chunk of textChunks) {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'x-sup-api-key': input.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: chunk,
              language: input.language,
              voice_settings: {
                speed: input.speechRate,
              },
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Supertone TTS 생성 실패: ${res.status} - ${errText}`);
          }

          const audioLength = res.headers.get('x-audio-length');
          const chunkDuration = audioLength ? parseFloat(audioLength) : 0;
          totalDuration += chunkDuration;

          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('audio') || contentType.includes('octet-stream')) {
            const audioBuffer = Buffer.from(await res.arrayBuffer());
            audioBuffers.push(audioBuffer);
          } else {
            const data = await res.json();
            const audioUrl = data.audio_url || data.url || data.output_url;
            const duration = data.duration || data.audio_duration || 3;
            if (audioUrl) {
              return { audioUrl, duration };
            }
            throw new Error('Supertone TTS: 오디오 URL을 받지 못했습니다.');
          }
        }

        const combinedBuffer = Buffer.concat(audioBuffers);
        const fileKey = `tts/${nanoid(12)}.mp3`;
        const { url } = await storagePut(fileKey, combinedBuffer, 'audio/mpeg');

        if (totalDuration === 0) {
          totalDuration = combinedBuffer.length / (128 * 1024 / 8);
        }

        return { audioUrl: url, duration: Math.round(totalDuration * 10) / 10 };
      }),
  }),

  // ===== 영상 처리 =====
  video: router({
    imageToStaticVideo: protectedProcedure
      .input(z.object({
        imageUrl: z.string().url(),
        duration: z.number().min(1).max(30).default(3),
        effectType: z.string().default('zoom-in'),
        frameRate: z.number().default(25),
      }))
      .mutation(async ({ input }) => {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'video-'));
        const inputImage = path.join(tmpDir, 'input.png');
        const outputVideo = path.join(tmpDir, 'output.mp4');

        try {
          const imgRes = await fetch(input.imageUrl);
          if (!imgRes.ok) throw new Error(`이미지 다운로드 실패: ${imgRes.status}`);
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          await fs.promises.writeFile(inputImage, imgBuffer);

          const totalFrames = Math.round(input.duration * input.frameRate);
          const fps = input.frameRate;

          let filterComplex = '';
          const et = input.effectType;

          if (et === 'fade-in') {
            filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,loop=${totalFrames}:1:0,setpts=N/${fps}/TB,fade=t=in:st=0:d=0.5[v]`;
          } else if (et === 'fade-out') {
            const fadeStart = Math.max(0, input.duration - 0.5);
            filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,loop=${totalFrames}:1:0,setpts=N/${fps}/TB,fade=t=out:st=${fadeStart}:d=0.5[v]`;
          } else if (et === 'fade-in-hold') {
            filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,loop=${totalFrames}:1:0,setpts=N/${fps}/TB,fade=t=in:st=0:d=0.5[v]`;
          } else if (et === 'zoom-in') {
            filterComplex = `[0:v]scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}[v]`;
          } else if (et === 'zoom-in-slow') {
            filterComplex = `[0:v]scale=8000:-1,zoompan=z='min(zoom+0.0008,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}[v]`;
          } else if (et === 'zoom-out') {
            filterComplex = `[0:v]scale=8000:-1,zoompan=z='if(lte(zoom\\,1.0)\\,1.5\\,max(1.001\\,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}[v]`;
          } else if (et === 'hold') {
            filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,loop=${totalFrames}:1:0,setpts=N/${fps}/TB[v]`;
          } else if (et === 'pan-left-to-right') {
            filterComplex = `[0:v]scale=8000:-1,zoompan=z='1.2':x='(iw-iw/zoom)*on/${totalFrames}':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}[v]`;
          } else if (et === 'pan-right-to-left') {
            filterComplex = `[0:v]scale=8000:-1,zoompan=z='1.2':x='(iw-iw/zoom)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}[v]`;
          } else if (et === 'shake') {
            filterComplex = `[0:v]scale=1960:1120:force_original_aspect_ratio=decrease,pad=1960:1120:(ow-iw)/2:(oh-ih)/2,loop=${totalFrames}:1:0,setpts=N/${fps}/TB,crop=1920:1080:'(sin(n/5)*20+20)':'(cos(n/7)*20+20)'[v]`;
          } else {
            filterComplex = `[0:v]scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}[v]`;
          }

          const ffmpegArgs = [
            '-y', '-i', inputImage,
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-t', String(input.duration),
            '-preset', 'fast',
            outputVideo,
          ];

          await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120000 });

          const videoBuffer = await fs.promises.readFile(outputVideo);
          const fileKey = `videos/static/${nanoid(12)}.mp4`;
          const { url } = await storagePut(fileKey, videoBuffer, 'video/mp4');

          return { videoUrl: url };
        } finally {
          await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      }),

    renderFinal: protectedProcedure
      .input(z.object({
        scenes: z.array(z.object({
          videoUrl: z.string().url().optional(),
          audioUrl: z.string().url().optional(),
          subtitleScenes: z.array(z.object({
            id: z.number(),
            text: z.string(),
          })).optional(),
          duration: z.number().optional(),
          subtitleFont: z.string().default('Pretendard'),
          subtitleSize: z.number().default(48),
          subtitlePosition: z.number().default(90),
          subtitleColor: z.string().default('#FFFFFF'),
          subtitleOutline: z.boolean().default(true),
          subtitleOutlineWidth: z.number().default(2),
          subtitleBg: z.string().default('none'),
        })),
        frameRate: z.number().default(25),
      }))
      .mutation(async ({ input }) => {
        const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'render-'));

        const hexToFFmpegColor = (hex: string): string => {
          if (hex.startsWith('#')) return `0x${hex.slice(1)}FF`;
          return '0xFFFFFFFF';
        };

        const rgbaToFFmpegColor = (rgba: string): string | null => {
          if (rgba === 'none' || rgba === 'transparent') return null;
          const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (match) {
            const r = parseInt(match[1]!).toString(16).padStart(2, '0');
            const g = parseInt(match[2]!).toString(16).padStart(2, '0');
            const b = parseInt(match[3]!).toString(16).padStart(2, '0');
            const a = match[4] ? Math.round(parseFloat(match[4]) * 255).toString(16).padStart(2, '0') : 'FF';
            return `0x${r}${g}${b}${a}`;
          }
          if (rgba === 'light') return '0x00000080';
          if (rgba === 'heavy') return '0x000000CC';
          return null;
        };

        try {
          const clipPaths: string[] = [];

          for (let i = 0; i < input.scenes.length; i++) {
            const scene = input.scenes[i]!;
            const videoPath = path.join(tmpDir, `scene_${i}_video.mp4`);
            const withAudioPath = path.join(tmpDir, `scene_${i}_withaudio.mp4`);
            const clipPath = path.join(tmpDir, `scene_${i}_clip.mp4`);

            if (!scene.videoUrl) continue;
            const videoRes = await fetch(scene.videoUrl);
            if (!videoRes.ok) throw new Error(`장면 ${i + 1} 영상 다운로드 실패`);
            await fs.promises.writeFile(videoPath, Buffer.from(await videoRes.arrayBuffer()));

            let baseVideoPath = videoPath;
            if (scene.audioUrl) {
              const audioPath = path.join(tmpDir, `scene_${i}_audio.mp3`);
              const audioRes = await fetch(scene.audioUrl);
              if (!audioRes.ok) throw new Error(`장면 ${i + 1} 오디오 다운로드 실패`);
              await fs.promises.writeFile(audioPath, Buffer.from(await audioRes.arrayBuffer()));

              await execFileAsync('ffmpeg', [
                '-y', '-i', videoPath, '-i', audioPath,
                '-c:v', 'copy', '-c:a', 'aac', '-shortest',
                withAudioPath,
              ], { timeout: 60000 });
              baseVideoPath = withAudioPath;
            }

            const subtitles = scene.subtitleScenes || [];
            if (subtitles.length > 0) {
              const fontColor = hexToFFmpegColor(scene.subtitleColor || '#FFFFFF');
              const fontSize = scene.subtitleSize || 48;
              const yPos = Math.round((scene.subtitlePosition || 90) / 100 * 1080);
              const bgColor = rgbaToFFmpegColor(scene.subtitleBg || 'none');
              const borderW = scene.subtitleOutline ? (scene.subtitleOutlineWidth || 2) : 0;

              const totalDuration = scene.duration || 3;
              const segDuration = totalDuration / subtitles.length;

              const drawTextFilters = subtitles.map((sub, j) => {
                const startTime = j * segDuration;
                const endTime = (j + 1) * segDuration;
                const escapedText = sub.text
                  .replace(/\\/g, '\\\\\\\\')
                  .replace(/'/g, "'\\\\\\''")
                  .replace(/:/g, '\\\\:')
                  .replace(/%/g, '%%');

                let filter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${yPos}:borderw=${borderW}`;
                if (bgColor) {
                  filter += `:box=1:boxcolor=${bgColor}:boxborderw=8`;
                }
                filter += `:enable='between(t,${startTime.toFixed(2)},${endTime.toFixed(2)})'`;
                return filter;
              }).join(',');

              await execFileAsync('ffmpeg', [
                '-y', '-i', baseVideoPath,
                '-vf', drawTextFilters,
                '-c:v', 'libx264', '-c:a', 'copy', '-preset', 'fast',
                clipPath,
              ], { timeout: 120000 });
            } else {
              if (baseVideoPath !== clipPath) {
                await fs.promises.copyFile(baseVideoPath, clipPath);
              }
            }

            clipPaths.push(clipPath);
          }

          const concatList = path.join(tmpDir, 'concat.txt');
          const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
          await fs.promises.writeFile(concatList, concatContent);

          const finalPath = path.join(tmpDir, 'final.mp4');
          await execFileAsync('ffmpeg', [
            '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
            '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast',
            finalPath,
          ], { timeout: 300000 });

          const finalBuffer = await fs.promises.readFile(finalPath);
          const fileKey = `videos/final/${nanoid(12)}.mp4`;
          const { url } = await storagePut(fileKey, finalBuffer, 'video/mp4');

          return { videoUrl: url };
        } finally {
          await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      }),
  }),

  // ===== 프로젝트 에셋 =====
  asset: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number(), category: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return db.getProjectAssets(input.projectId, ctx.user.id, input.category);
      }),
    upload: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        category: z.enum(['character', 'background', 'document_plan', 'document_knowledge']),
        fileName: z.string(),
        mimeType: z.string(),
        fileBase64: z.string(),
        label: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const CATEGORY_LIMITS: Record<string, number> = { character: 20, background: 20, document_plan: 5, document_knowledge: 10 };
        const project = await db.getProjectById(input.projectId, ctx.user.id);
        if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');
        const existingAssets = await db.getProjectAssets(input.projectId, ctx.user.id, input.category);
        const maxCount = CATEGORY_LIMITS[input.category] || 20;
        if (existingAssets.length >= maxCount) {
          const categoryLabels: Record<string, string> = { character: '캐릭터 이미지', background: '배경 이미지', document_plan: '기획서', document_knowledge: '지식자료' };
          throw new Error(`${categoryLabels[input.category] || input.category}는 최대 ${maxCount}개까지 업로드할 수 있습니다.`);
        }
        const fileBuffer = Buffer.from(input.fileBase64, 'base64');
        const suffix = nanoid(8);
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._\-\u3131-\u318E\uAC00-\uD7A3]/g, '_');
        const fileKey = `projects/${project.id}/${input.category}/${safeName}-${suffix}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
        const assetId = await db.addProjectAsset({
          projectId: input.projectId, userId: ctx.user.id, category: input.category,
          fileName: input.fileName, fileUrl: url, fileKey, mimeType: input.mimeType,
          fileSize: fileBuffer.length, label: input.label || null,
        });
        return { id: assetId, url, fileKey };
      }),
    updateLabel: protectedProcedure
      .input(z.object({ id: z.number(), label: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateProjectAsset(input.id, ctx.user.id, { label: input.label });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await db.deleteProjectAsset(input.id, ctx.user.id);
        return { success: true, deleted };
      }),
  }),
});

export type AppRouter = typeof appRouter;
