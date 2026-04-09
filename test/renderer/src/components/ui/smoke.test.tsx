import { describe, expect, it } from 'vitest'

import { Alert, AlertDescription, AlertTitle } from '../../../../../src/renderer/src/components/ui/alert'
import { Badge } from '../../../../../src/renderer/src/components/ui/badge'
import { Button } from '../../../../../src/renderer/src/components/ui/button'
import { Card, CardContent } from '../../../../../src/renderer/src/components/ui/card'
import { Progress } from '../../../../../src/renderer/src/components/ui/progress'
import { ScrollArea } from '../../../../../src/renderer/src/components/ui/scroll-area'
import { Separator } from '../../../../../src/renderer/src/components/ui/separator'
import { Switch } from '../../../../../src/renderer/src/components/ui/switch'
import { flushMicrotasks, renderIntoDocument } from '../../testUtils/render'

describe('UI wrappers', () => {
  it('renders the button, badge, alert, and card primitives', async () => {
    const { container } = await renderIntoDocument(
      <div>
        <Button>Save</Button>
        <Badge>New</Badge>
        <Alert>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>Something happened</AlertDescription>
        </Alert>
        <Card>
          <CardContent>Card body</CardContent>
        </Card>
      </div>,
    )

    expect(container.textContent).toContain('Save')
    expect(container.textContent).toContain('New')
    expect(container.textContent).toContain('Warning')
    expect(container.textContent).toContain('Card body')
  })

  it('renders the switch, progress, separator, and scroll area primitives', async () => {
    const { container } = await renderIntoDocument(
      <div className="space-y-4">
        <Switch />
        <Progress value={35} />
        <Separator />
        <ScrollArea className="h-16">
          <div>Scrollable content</div>
        </ScrollArea>
      </div>,
    )

    await flushMicrotasks()

    expect(container.textContent).toContain('Scrollable content')
    expect(container.querySelector('[role="switch"]')).not.toBeNull()
    expect(container.querySelector('div')).not.toBeNull()
  })
})
