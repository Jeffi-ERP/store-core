'use client'

// A2UI renderer for agent card blocks (Phase 1 spike).
// All @a2ui imports are dynamic so this file has zero static dependencies on @a2ui packages.
// That keeps the TypeScript compiler happy in environments where the packages are not yet
// installed (e.g. CI for other repos in the workspace), and avoids SSR issues since these
// packages require a browser DOM.

import { Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { A2UIMessage } from './a2ui-card-mapper'

interface Props {
  messages: A2UIMessage[]
  onSendMessage?: (msg: string) => void
}

// Minimal local types so we don't need static @a2ui imports for type checking.
interface Subscription { unsubscribe(): void }
interface A2uiProcessor {
  model: { surfacesMap: ReadonlyMap<string, unknown> }
  onSurfaceCreated(h: (s: unknown) => void): Subscription
  onSurfaceDeleted(h: (id: string) => void): Subscription
  processMessages(msgs: unknown): void
  dispose(): void
}

function A2UIRendererInner({ messages, onSendMessage }: Props): ReactNode {
  const processorRef = useRef<A2uiProcessor | null>(null)
  const [surfaces, setSurfaces] = useState<unknown[]>([])
  const [SurfaceComponent, setSurfaceComponent] = useState<((props: { surface: unknown }) => ReactNode) | null>(null)
  // Track whether the component is still mounted (avoids setState after unmount)
  const mountedRef = useRef(true)

  // Dynamically load @a2ui packages on the client. If the packages are not installed the
  // dynamic imports reject silently and the component renders nothing (RecordCard fallback
  // remains visible since the flag defaults to false).
  useEffect(() => {
    mountedRef.current = true

    const actionHandler = (action: unknown) => {
      const ev = (action as { event?: { name?: string; context?: Record<string, unknown> } })?.event
      if (!ev) return
      if (ev.name === 'sendMessage' && typeof ev.context?.prompt === 'string' && onSendMessage) {
        onSendMessage(ev.context.prompt)
      } else if (ev.name === 'navigate' && typeof ev.context?.href === 'string') {
        window.location.href = ev.context.href
      }
    }

    Promise.all([
      import('@a2ui/web_core/v0_9' as string),
      import('@a2ui/web_core/v0_9/basic_catalog' as string),
      import('@a2ui/react/v0_9' as string),
    ])
      .then(([core, basicCatalogMod, reactMod]) => {
        if (!mountedRef.current) return

        const { MessageProcessor } = core as { MessageProcessor: new (catalogs: unknown[], handler?: unknown) => A2uiProcessor }
        const { basicCatalog } = basicCatalogMod as { basicCatalog: unknown }
        const { A2uiSurface } = reactMod as { A2uiSurface: (props: { surface: unknown }) => ReactNode }

        const processor = new MessageProcessor([basicCatalog], actionHandler)
        processorRef.current = processor

        const sync = () => {
          if (mountedRef.current) setSurfaces(Array.from(processor.model.surfacesMap.values()))
        }
        const createdSub = processor.onSurfaceCreated(sync)
        const deletedSub = processor.onSurfaceDeleted(sync)

        setSurfaceComponent(() => A2uiSurface)

        if (messages.length > 0) {
          processor.processMessages(messages)
        }

        return () => {
          createdSub.unsubscribe()
          deletedSub.unsubscribe()
        }
      })
      .catch(() => {
        // @a2ui packages not installed — component stays hidden, RecordCard remains visible.
      })

    return () => {
      mountedRef.current = false
      processorRef.current?.dispose()
      processorRef.current = null
    }
  // onSendMessage intentionally excluded: the actionHandler closure captures the ref value at mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-process when messages change after initial mount
  useEffect(() => {
    const processor = processorRef.current
    if (!processor || messages.length === 0) return
    processor.processMessages(messages)
  // JSON.stringify so the effect fires only when message content changes, not reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(messages)])

  if (!SurfaceComponent || surfaces.length === 0) return null

  return (
    <div className="rounded-xl border border-border-default bg-surface-elevated text-xs text-foreground overflow-hidden p-3">
      {surfaces.map((surface, i) => (
        SurfaceComponent({ surface, key: i } as unknown as { surface: unknown })
      ))}
    </div>
  )
}

// Error boundary: if A2UI rendering throws, renders null so the caller degrades gracefully.
interface EBState { hasError: boolean }

class A2UIErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(): EBState { return { hasError: true } }
  override render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export default function A2UIRenderer(props: Props): ReactNode {
  return (
    <A2UIErrorBoundary>
      <A2UIRendererInner {...props} />
    </A2UIErrorBoundary>
  )
}
