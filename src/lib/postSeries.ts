import type { JSONContent } from '@tiptap/react'

export type RelatedPostsData = {
  postIds: string[]
  hasIntro: boolean
}

export type PostSeriesConfig = {
  key: string
  channelNameHe: string
  subcategoryNameHe: string
  contextLabel: string
  buttonLabel: string
  panelTitle: string
  panelDescription: string
  publicHeading: string
  availableHeading: string
  selectedHeading: string
  orderHint: string
  searchPlaceholder: string
  introToggleLabel: string
  introBadge: string
  currentDraftBadge: string
  currentPostBadge: string
  loadingLabel: string
  addSelectedLabel: string
  emptyAvailableLabel: string
  emptySelectedLabel: string
}

type SeriesDefinition = {
  channelNameHe: string
  subcategoryNameHe: string
  buttonLabel: string
  panelTitle: string
  publicHeading: string
}

const EMPTY_RELATED_POSTS: RelatedPostsData = {
  postIds: [],
  hasIntro: false,
}

const SERIES_DEFINITIONS: SeriesDefinition[] = [
  {
    channelNameHe: 'סיפורים',
    subcategoryNameHe: 'סיפור בהמשכים',
    buttonLabel: 'הוספת פרקים',
    panelTitle: 'ניהול פרקים',
    publicHeading: 'השתלשלות העלילה',
  },
  {
    channelNameHe: 'סיפורים',
    subcategoryNameHe: 'סיפורים אמיתיים',
    buttonLabel: 'הוספת חלקים',
    panelTitle: 'חלקים בסיפור',
    publicHeading: 'עוד מהסיפור',
  },
  {
    channelNameHe: 'פריקה',
    subcategoryNameHe: 'וידויים',
    buttonLabel: 'הוספת חלקים',
    panelTitle: 'חלקים בווידוי',
    publicHeading: 'עוד מהמגירה',
  },
  {
    channelNameHe: 'פריקה',
    subcategoryNameHe: 'מחשבות',
    buttonLabel: 'הוספת חלקים',
    panelTitle: 'חלקים ברצף',
    publicHeading: 'עוד קווי מחשבה',
  },
]

export function getPostSeriesConfig(
  channelNameHe?: string | null,
  subcategoryNameHe?: string | null,
): PostSeriesConfig | null {
  if (!channelNameHe || !subcategoryNameHe) return null

  const definition = SERIES_DEFINITIONS.find(
    item => item.channelNameHe === channelNameHe && item.subcategoryNameHe === subcategoryNameHe,
  )

  if (!definition) return null

  const contextLabel = `${definition.channelNameHe} > ${definition.subcategoryNameHe}`

  return {
    key: `${definition.channelNameHe}::${definition.subcategoryNameHe}`,
    channelNameHe: definition.channelNameHe,
    subcategoryNameHe: definition.subcategoryNameHe,
    contextLabel,
    buttonLabel: definition.buttonLabel,
    panelTitle: definition.panelTitle,
    panelDescription: `אפשר להוסיף כאן רק פוסטים מפורסמים מתוך ${contextLabel}. טיוטות שתסמני יישמרו לסידור פנימי, אבל יוצגו לקוראים רק אחרי פרסום.`,
    publicHeading: definition.publicHeading,
    availableHeading: 'פוסטים זמינים',
    selectedHeading: 'סדר התצוגה',
    orderHint: 'הסדר כאן הוא הסדר שיופיע לקוראים בפוסט.',
    searchPlaceholder: 'חיפוש פוסט...',
    introToggleLabel: 'יש פתיח לפני החלק הראשון',
    introBadge: 'פתיח',
    currentDraftBadge: 'הפוסט הזה',
    currentPostBadge: 'אתה פה',
    loadingLabel: 'טוען חלקים...',
    addSelectedLabel: 'הוסף נבחרים',
    emptyAvailableLabel: 'אין פוסטים זמינים בתת-הקטגוריה הזו כרגע',
    emptySelectedLabel: 'עדיין לא בחרת חלקים לסדרה הזו.',
  }
}

export function extractRelatedPostsData(json: JSONContent | null | undefined): RelatedPostsData {
  const relatedNode = (json?.content ?? []).find(node => node.type === 'relatedPosts')
  const attrs = relatedNode?.attrs as Record<string, unknown> | undefined
  if (!attrs) return EMPTY_RELATED_POSTS

  if (Array.isArray(attrs.postIds)) {
    return {
      postIds: (attrs.postIds as unknown[]).filter((item): item is string => typeof item === 'string'),
      hasIntro: !!attrs.hasIntro,
    }
  }

  if (Array.isArray(attrs.items)) {
    return {
      postIds: (attrs.items as Array<Record<string, unknown>>)
        .map(item => item.id)
        .filter((item): item is string => typeof item === 'string'),
      hasIntro: !!attrs.hasIntro,
    }
  }

  return EMPTY_RELATED_POSTS
}

export function stripRelatedPosts(json: JSONContent): JSONContent {
  return {
    ...json,
    content: (json?.content ?? []).filter(node => node.type !== 'relatedPosts'),
  }
}

export function appendRelatedPosts(
  json: JSONContent,
  postIds: string[],
  hasIntro: boolean,
): JSONContent {
  const content = stripRelatedPosts(json).content ?? []
  if (postIds.length > 0) {
    content.push({ type: 'relatedPosts', attrs: { postIds, hasIntro } })
  }
  return { ...json, content }
}

export function applyRelatedPostsData(json: JSONContent, data: RelatedPostsData): JSONContent {
  return data.postIds.length > 0 ? appendRelatedPosts(json, data.postIds, data.hasIntro) : stripRelatedPosts(json)
}

export function sameRelatedPostsData(a: RelatedPostsData, b: RelatedPostsData): boolean {
  if (a.hasIntro !== b.hasIntro) return false
  if (a.postIds.length !== b.postIds.length) return false
  return a.postIds.every((postId, index) => postId === b.postIds[index])
}

export function hasRelatedPosts(data: RelatedPostsData): boolean {
  return data.postIds.length > 0
}

export function formatRelatedPostPosition(index: number, hasIntro: boolean, introBadge = 'פתיח'): string {
  if (hasIntro && index === 0) return introBadge
  return String(hasIntro ? index : index + 1)
}

export function emptyRelatedPostsData(): RelatedPostsData {
  return EMPTY_RELATED_POSTS
}
