// DREAMFORGE_SLIM: PR 8 telemetry stub — 真 Sentry/PostHog 物理删除, 14 file 仍 import trackEvent
// 保留 no-op stub 让现存 hook 编译通过 + 维持调用点 type 安全
// v0.1: 关闭所有 telemetry (DREAMFORGE_SLIM_MODE guard)

type ProductAnalyticsEventName = string
type ProductAnalyticsProperties = Record<string, string | number>

export function trackEvent(_name: ProductAnalyticsEventName, _properties?: ProductAnalyticsProperties): void {
  // no-op: PR 8 physical delete Sentry + PostHog
}

export function initSentry(_anonymousId?: string): void {
  // no-op
}

export function teardownSentry(): void {
  // no-op
}

export function initPostHog(_anonymousId?: string, _releaseChannel?: string): Promise<void> {
  return Promise.resolve()
}

export function teardownPostHog(): void {
  // no-op
}

export function updatePostHogIdentify(_releaseChannel?: string): void {
  // no-op
}

export function setReleaseChannel(_channel: string): void {
  // no-op
}

export function isFeatureEnabled(_flagKey: string): boolean {
  return false
}
