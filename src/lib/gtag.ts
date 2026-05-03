export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? ""

export const pageview = (url: string) => {
  if (!GA_MEASUREMENT_ID) return
  if (!window.gtag) return
  window.gtag("config", GA_MEASUREMENT_ID, {
    page_path: url,
  })
}

export const event = (action: string, params?: Record<string, unknown>) => {
  if (!GA_MEASUREMENT_ID) return
  if (!window.gtag) return
  window.gtag("event", action, params)
}
