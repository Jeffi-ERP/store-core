'use client'

// A2UI renderer for agent card blocks (Phase 1 spike).
// Uses @a2ui/react/v0_9 and @a2ui/web_core/v0_9 to render an A2UI v0.9 surface from a
// CardBlockData mapping produced by a2ui-card-mapper.ts.

import { Component, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { A2UIMessage } from '@/components/admin/agent/a2ui-card-mapper'
import { MessageProcessor } from '@a2ui/web_core/v0_9'
import { basicCatalog } from '@a2ui/web_core/v0_9/basic_catalog'
import { A2uiSurface } from '@a2ui/react/v0_9'
import type { SurfaceModel } from '@a2ui/web_core/v0_9'
import type { ReactCatalogComponent } from '@a2ui/react/v0_9'

interface Props {
  messages: A2UIMessage[]
  onSendMessage?: (msg: string) => void
}

function A2UIRendererInner({ messages, onSendMessage }: Props): ReactNode {
  const processor = useMemo(() => {
    const actionHandler = (action: { event?: { name?: string; context?: Record<string, unknown> } }) => {
      const event = action?.event
      if (!event) return
      if (event.name === 'sendMessage' && typeof event.context?.prompt === 'string' && onSendMessage) {
        onSendMessage(event.context.prompt)
      } else if (event.name === 'navigate' && typeof event.context?.href === 'string') {
        window.location.href = event.context.href
      }
    }
    return new MessageProcessor<ReactCatalogComponent>([basicCatalog], actionHandler as never)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactCatalogComponent>[]>(() =>
    Array.from(processor.model.surfacesMap.values())
  )

  useEffect(() => {
    const sync = () => setSurfaces(Array.from(processor.model.surfacesMap.values()))
    const createdSub = processor.onSurfaceCreated(sync)
    const deletedSub = processor.onSurfaceDeleted(sync)
    return () => {
      createdSub.unsubscribe()
      deletedSub.unsubscribe()
    }
  }, [processor])

  // Process incoming messages
  useEffect(() => {
    if (messages.length > 0) {
      processor.processMessages(messages)
    }
  // Using JSON.stringify so the effect re-runs only when message content changes (not reference).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(messages)])

  // Dispose the processor on unmount
  useEffect(() => {
    return () => {
      processor.dispose()
    }
  }, [processor])

  if (surfaces.length === 0) return null

  return (
    <div className="rounded-xl border border-border-default bg-surface-elevated text-xs text-foreground overflow-hidden p-3">
      {surfaces.map(surface => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  )
}

// Error boundary: if A2UI rendering fails, render null so the parent (AdminAgentBlocks) can
// fall through gracefully.
interface EBState { hasError: boolean }

class A2UIErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(): EBState {
    return { hasError: true }
  }
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
