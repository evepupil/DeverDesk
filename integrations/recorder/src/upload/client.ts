import {
  RECORDER_PATHS,
  type BindingsResponse,
  type BriefingResponse,
  type LiveRequest,
  type UploadRequest,
  type UploadResponse,
} from "../../../../src/sync/recorder-protocol"
import { RECORDER_VERSION } from "../version"

export type RecorderHttpErrorKind = "auth" | "forbidden" | "invalid" | "server" | "network"

export class RecorderHttpError extends Error {
  readonly status: number
  readonly kind: RecorderHttpErrorKind

  constructor(status: number, kind: RecorderHttpErrorKind, message: string) {
    super(message)
    this.name = "RecorderHttpError"
    this.status = status
    this.kind = kind
  }
}

export interface RecorderClient {
  getBindings(): Promise<BindingsResponse>
  getBriefing(dir: string): Promise<BriefingResponse>
  upload(request: UploadRequest): Promise<UploadResponse>
  putLive(request: LiveRequest): Promise<void>
}

export interface CreateClientOptions {
  url: string
  token: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

const RETRY_DELAYS = [500, 1500] as const

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function responseMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message
  }
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return body.error
  }
  return fallback
}

function kindForStatus(status: number): RecorderHttpErrorKind {
  if (status === 401) return "auth"
  if (status === 403) return "forbidden"
  if (status >= 500) return "server"
  return "invalid"
}

export function createClient(options: CreateClientOptions): RecorderClient {
  const baseUrl = options.url.replace(/\/+$/u, "")
  const fetcher = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const sleep = options.sleep ?? defaultSleep

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let lastError: RecorderHttpError | undefined
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetcher(`${baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${options.token}`,
            "Content-Type": "application/json",
            "User-Agent": `deverdesk-recorder/${RECORDER_VERSION}`,
            ...init.headers,
          },
          signal: controller.signal,
        })
        if (!response.ok) {
          let body: unknown
          try {
            body = await response.json()
          } catch {
            body = undefined
          }
          const status = response.status
          const error = new RecorderHttpError(status, kindForStatus(status), responseMessage(body, `服务器返回 HTTP ${status}`))
          if (status >= 500 && attempt < RETRY_DELAYS.length) {
            lastError = error
            await sleep(RETRY_DELAYS[attempt] ?? 1500)
            continue
          }
          throw error
        }
        if (response.status === 204) return undefined as T
        return await response.json() as T
      } catch (error) {
        if (error instanceof RecorderHttpError) throw error
        const timedOut = controller.signal.aborted
        lastError = new RecorderHttpError(0, "network", timedOut ? "连接服务器超时" : `无法连接服务器：${error instanceof Error ? error.message : String(error)}`)
        if (attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt] ?? 1500)
          continue
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    throw lastError ?? new RecorderHttpError(0, "network", "无法连接服务器")
  }

  return {
    getBindings: () => request<BindingsResponse>(RECORDER_PATHS.bindings),
    getBriefing: (dir) => request<BriefingResponse>(`${RECORDER_PATHS.briefing}?dir=${encodeURIComponent(dir)}`),
    upload: (payload) => request<UploadResponse>(RECORDER_PATHS.upload, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    putLive: async (payload) => {
      await request<void>(RECORDER_PATHS.live, { method: "PUT", body: JSON.stringify(payload) })
    },
  }
}
