import { PageHeader } from '@/components/layout/page-header'
import { PageBody } from '@/components/layout/page-body'
import { Section } from '@/components/layout/section'
import { CardPanel } from '@/components/layout/card-panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Package } from 'lucide-react'

export default function ComponentsPage() {
  return (
    <main className="ds-page-wrapper">
      <PageHeader
        title="Components"
        description="Reusable UI components with consistent styling"
        icon={<Package className="h-6 w-6" />}
      />
      <PageBody>
        <Section
          title="Status Badges"
          description="Semantic badges for status indication across the application"
        >
          <div className="flex flex-wrap gap-4">
            <StatusBadge status="running" label="Running" />
            <StatusBadge status="success" label="Success" />
            <StatusBadge status="warning" label="Warning" />
            <StatusBadge status="error" label="Error" />
          </div>
        </Section>

        <Section
          title="Buttons"
          description="Button variants with consistent sizing and states"
        >
          <div className="space-y-6">
            <div>
              <h4 className="mb-3 font-semibold">Primary Buttons</h4>
              <div className="flex flex-wrap gap-2">
                <Button>Default</Button>
                <Button disabled>Disabled</Button>
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold">Secondary Variants</h4>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold">Destructive Actions</h4>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive">Delete</Button>
                <Button variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Card Panels"
          description="Consistent card styling with proper spacing and borders"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CardPanel>
              <h4 className="font-semibold">Card Panel (Default)</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Standard card with padding and border
              </p>
            </CardPanel>

            <CardPanel size="sm">
              <h4 className="font-semibold">Card Panel (Small)</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Compact card with less padding
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Typography"
          description="Consistent heading and text hierarchy"
        >
          <div className="space-y-4">
            <div>
              <h1>Heading 1 (h1)</h1>
              <p className="text-sm text-muted-foreground">text-3xl font-bold</p>
            </div>

            <div>
              <h2>Heading 2 (h2)</h2>
              <p className="text-sm text-muted-foreground">text-2xl font-bold</p>
            </div>

            <div>
              <h3>Heading 3 (h3)</h3>
              <p className="text-sm text-muted-foreground">text-xl font-semibold</p>
            </div>

            <div>
              <h4>Heading 4 (h4)</h4>
              <p className="text-sm text-muted-foreground">text-lg font-semibold</p>
            </div>

            <div>
              <p>Body text - The quick brown fox jumps over the lazy dog</p>
              <p className="text-sm text-muted-foreground">text-sm leading-6</p>
            </div>

            <div>
              <p className="text-xs">Small text - The quick brown fox jumps over the lazy dog</p>
              <p className="text-xs text-muted-foreground">text-xs</p>
            </div>
          </div>
        </Section>

        <Section
          title="Input Fields"
          description="Consistent input styling with focus states"
        >
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Text input field"
              className="ds-input-field w-full"
            />
            <textarea
              placeholder="Text area field"
              className="ds-input-field w-full"
              rows={4}
            />
            <select className="ds-input-field w-full">
              <option>Select option...</option>
              <option>Option 1</option>
              <option>Option 2</option>
            </select>
          </div>
        </Section>
      </PageBody>
    </main>
  )
}
