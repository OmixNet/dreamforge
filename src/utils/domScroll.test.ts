import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scrollSelectedHTMLChildIntoView } from './domScroll'

/**
 * v0.3 PR 12.1: small DOM helper — easy branch coverage lift.
 */

describe('scrollSelectedHTMLChildIntoView', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollIntoViewSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a no-op when the container is null', () => {
    scrollSelectedHTMLChildIntoView(null, 0)
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('scrolls the child at the given index into view', () => {
    const container = document.createElement('div')
    const a = document.createElement('p')
    const b = document.createElement('p')
    const c = document.createElement('p')
    container.append(a, b, c)

    scrollSelectedHTMLChildIntoView(container, 1)
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(b)
  })

  it('is a no-op when the index is out of range', () => {
    const container = document.createElement('div')
    container.append(document.createElement('p'))

    scrollSelectedHTMLChildIntoView(container, 5)
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })
})
