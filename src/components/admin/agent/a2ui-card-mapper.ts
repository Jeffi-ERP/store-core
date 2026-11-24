import type { CardBlockData, CardData } from '@/components/admin/agent/RecordCard'
import { fmtINR, fmtQty, fmtPct, parseNumber, safeHref, arr } from '@/components/admin/agent/format'

// Converts a CardBlockData (the existing admin agent card block format) into a valid A2UI v0.9
// message sequence that the @a2ui/web_core/v0_9 MessageProcessor can consume.
// Phase 1: uses only the basic catalog (Column, Row, Text, Button). Progress bars are
// omitted — no basic catalog analog exists. All formatting is done here before values reach
// A2UI Text components, since the basic catalog has no format-aware primitives.
//
// v0.9 message format: createSurface + updateComponents (separate messages).

export type A2UIMessage = A2UICreateSurfaceMsg | A2UIUpdateComponentsMsg

export interface A2UICreateSurfaceMsg {
  version: 'v0.9'
  createSurface: { surfaceId: string; catalogId: string }
}

export interface A2UIUpdateComponentsMsg {
  version: 'v0.9'
  updateComponents: {
    surfaceId: string
    components: Array<{ id: string; component: string; [key: string]: unknown }>
  }
}

type Format = 'inr' | 'number' | 'percent' | 'date' | 'datetime' | 'text'

function fmtValue(value: unknown, format?: Format): string {
  if (value == null || value === '') return '—'
  const n = parseNumber(value)
  switch (format) {
    case 'inr':
      return fmtINR(value)
    case 'number':
      return n == null ? String(value) : fmtQty(n)
    case 'percent':
      return n == null ? String(value) : fmtPct(n as number)
    case 'date':
    case 'datetime': {
      const d = new Date(String(value))
      if (isNaN(d.getTime())) return String(value)
      return format === 'date'
        ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    }
    default:
      return String(value)
  }
}

// The basic catalog ID from @a2ui/web_core/v0_9/basic_catalog
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'

export function cardToA2UIMessages(card: CardBlockData, surfaceId: string): A2UIMessage[] {
  const components: Array<{ id: string; component: string; [key: string]: unknown }> = []
  const rootChildren: string[] = []

  const p = surfaceId

  // Header: eyebrow + title + subtitle
  const headerChildren: string[] = []

  if (card.eyebrow) {
    components.push({ id: `${p}_eyebrow`, component: 'Text', text: card.eyebrow, variant: 'caption' })
    headerChildren.push(`${p}_eyebrow`)
  }

  components.push({ id: `${p}_title`, component: 'Text', text: card.title, weight: 'strong' })
  headerChildren.push(`${p}_title`)

  if (card.subtitle) {
    components.push({ id: `${p}_subtitle`, component: 'Text', text: card.subtitle, variant: 'caption' })
    headerChildren.push(`${p}_subtitle`)
  }

  // Badges: rendered as caption Text
  const badges = arr(card.badges).filter(b => b?.label)
  if (badges.length > 0) {
    badges.forEach((badge, i) => {
      const bid = `${p}_badge_${i}`
      components.push({ id: bid, component: 'Text', text: badge.label, variant: 'caption' })
      headerChildren.push(bid)
    })
  }

  components.push({ id: `${p}_header`, component: 'Column', children: headerChildren })
  rootChildren.push(`${p}_header`)

  // Stats row
  const stats = arr(card.stats).filter(s => s?.label)
  if (stats.length > 0) {
    const statIds: string[] = []
    stats.forEach((stat, i) => {
      const sid = `${p}_stat_${i}`
      const labelId = `${sid}_label`
      const valueId = `${sid}_value`
      components.push({ id: labelId, component: 'Text', text: stat.label, variant: 'caption' })
      components.push({ id: valueId, component: 'Text', text: fmtValue(stat.value, stat.format as Format), weight: 'strong' })

      const statChildren = [labelId, valueId]
      if (typeof stat.delta === 'number') {
        const deltaId = `${sid}_delta`
        const sign = stat.delta >= 0 ? '+' : ''
        components.push({ id: deltaId, component: 'Text', text: `${sign}${fmtPct(Math.abs(stat.delta))}`, variant: 'caption' })
        statChildren.push(deltaId)
      }

      components.push({ id: sid, component: 'Column', children: statChildren })
      statIds.push(sid)
    })
    components.push({ id: `${p}_stats`, component: 'Row', children: statIds })
    rootChildren.push(`${p}_stats`)
  }

  // Fields
  const fields = arr(card.fields).filter(f => f?.label)
  if (fields.length > 0) {
    const fieldRowIds: string[] = []
    fields.forEach((field, i) => {
      const fid = `${p}_field_${i}`
      const labelId = `${fid}_label`
      const valueId = `${fid}_value`
      components.push({ id: labelId, component: 'Text', text: field.label, variant: 'caption' })
      components.push({ id: valueId, component: 'Text', text: fmtValue(field.value, field.format as Format) })
      components.push({ id: fid, component: 'Row', children: [labelId, valueId] })
      fieldRowIds.push(fid)
    })
    components.push({ id: `${p}_fields`, component: 'Column', children: fieldRowIds })
    rootChildren.push(`${p}_fields`)
  }

  // Items list (first 6 only in Phase 1; no expand interaction via basic catalog)
  const items = arr(card.items).filter(it => it?.title).slice(0, 6)
  if (items.length > 0) {
    const itemRowIds: string[] = []
    items.forEach((item, i) => {
      const iid = `${p}_item_${i}`
      const titleId = `${iid}_title`
      components.push({ id: titleId, component: 'Text', text: item.title })
      const itemChildren = [titleId]
      if (item.subtitle) {
        const subId = `${iid}_subtitle`
        components.push({ id: subId, component: 'Text', text: item.subtitle, variant: 'caption' })
        itemChildren.push(subId)
      }
      if (item.value != null && item.value !== '') {
        const valId = `${iid}_value`
        components.push({ id: valId, component: 'Text', text: fmtValue(item.value, item.format as Format) })
        itemChildren.push(valId)
      }
      components.push({ id: iid, component: 'Row', children: itemChildren })
      itemRowIds.push(iid)
    })
    components.push({ id: `${p}_items`, component: 'Column', children: itemRowIds })
    rootChildren.push(`${p}_items`)
  }

  // Note
  if (card.note) {
    components.push({ id: `${p}_note`, component: 'Text', text: card.note, variant: 'caption' })
    rootChildren.push(`${p}_note`)
  }

  // Actions (prompt-based and href-based)
  // In v0.9, Button takes `child` (a component id for the label text) and `action`.
  // Action for user events uses { event: { name, userMessage, context } }.
  const actions = arr((card as CardData).actions).filter(
    a => a?.label && (a.prompt ?? safeHref(a.href, a.entity))
  )
  if (actions.length > 0) {
    const actionIds: string[] = []
    actions.forEach((action, i) => {
      const aid = `${p}_action_${i}`
      const labelId = `${aid}_label`
      const href = safeHref(action.href, action.entity)
      components.push({ id: labelId, component: 'Text', text: action.label })
      components.push({
        id: aid,
        component: 'Button',
        child: labelId,
        variant: action.primary ? 'primary' : 'default',
        // A2UI v0.9 event action — the name carries routing info for the action handler in A2UIRenderer.
        action: action.prompt
          ? { event: { name: 'sendMessage', context: { prompt: action.prompt } } }
          : { event: { name: 'navigate', context: { href } } },
      })
      actionIds.push(aid)
    })
    components.push({ id: `${p}_actions`, component: 'Row', children: actionIds })
    rootChildren.push(`${p}_actions`)
  }

  // Root container
  components.push({ id: 'root', component: 'Column', children: rootChildren })

  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID },
    },
    {
      version: 'v0.9',
      updateComponents: { surfaceId, components },
    },
  ]
}
