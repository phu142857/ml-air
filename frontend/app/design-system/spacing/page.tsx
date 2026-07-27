import { PageHeader } from '@/components/layout/page-header'
import { PageBody } from '@/components/layout/page-body'
import { Section } from '@/components/layout/section'
import { CardPanel } from '@/components/layout/card-panel'
import { Maximize2 } from 'lucide-react'

export default function SpacingPage() {
  const spacingValues = [
    { name: 'xs', value: 0.5, rem: '0.5rem' },
    { name: 'sm', value: 1, rem: '1rem' },
    { name: 'md', value: 1.5, rem: '1.5rem' },
    { name: 'lg', value: 2, rem: '2rem' },
    { name: 'xl', value: 2.5, rem: '2.5rem' },
    { name: '2xl', value: 3, rem: '3rem' },
    { name: '3xl', value: 4, rem: '4rem' },
  ]

  return (
    <main className="ds-page-wrapper">
      <PageHeader
        title="Spacing & Utilities"
        description="Consistent spacing scale and utility classes"
        icon={<Maximize2 className="h-6 w-6" />}
      />
      <PageBody>
        <Section
          title="Spacing Scale"
          description="All spacing values use this consistent scale"
        >
          <div className="space-y-6">
            {spacingValues.map((item) => (
              <div key={item.name}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.rem}</span>
                </div>
                <div
                  className="bg-primary"
                  style={{ width: `${item.value * 2}rem`, height: '2rem' }}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Padding (p-*)"
          description="Component internal spacing"
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Cards use p-6 (1.5rem)</p>
              <CardPanel className="p-6">
                <div className="h-12 border-2 border-dashed border-border" />
                <p className="mt-2 text-xs text-muted-foreground">Standard card padding</p>
              </CardPanel>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Small cards use p-4 (1rem)</p>
              <CardPanel size="sm" className="p-4">
                <div className="h-8 border-2 border-dashed border-border" />
                <p className="mt-2 text-xs text-muted-foreground">Compact card padding</p>
              </CardPanel>
            </div>
          </div>
        </Section>

        <Section
          title="Margin (m-*) & Spacing (space-*)"
          description="Component external spacing"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Between Sections: mb-8</h4>
              <p className="text-sm text-muted-foreground">Large vertical spacing between major content sections</p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Between Items: space-y-4</h4>
              <p className="text-sm text-muted-foreground">Medium spacing between related items in a section</p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Within Component: space-y-2</h4>
              <p className="text-sm text-muted-foreground">Small spacing between text elements in a card</p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Gap (gap-*)"
          description="Spacing between flex/grid items"
        >
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-semibold">Grid: gap-4 (1rem)</p>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded bg-muted"
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold">Flex row: gap-2 (0.5rem)</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-10 w-10 rounded bg-muted"
                  />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Page Structure Spacing"
          description="Large scale page layout spacing"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Page Header</h4>
              <p className="text-sm text-muted-foreground">
                <code>px-6 py-4</code> - Horizontal padding 1.5rem, vertical padding 1rem
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Page Body</h4>
              <p className="text-sm text-muted-foreground">
                <code>px-6 py-8</code> - Horizontal padding 1.5rem, vertical padding 2rem
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Max Width</h4>
              <p className="text-sm text-muted-foreground">
                <code>max-w-7xl</code> - 80rem (1280px) for optimal readability
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Between Sections</h4>
              <p className="text-sm text-muted-foreground">
                <code>mb-8</code> - 2rem spacing between major sections
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Utility Classes"
          description="Common layout utilities for consistency"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold text-sm">Flexbox Utilities</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>
                  <code>.flex-center</code> - Center items both directions
                </li>
                <li>
                  <code>.flex-between</code> - Space-between with center align
                </li>
                <li>
                  <code>.grid-cols-auto</code> - Responsive grid 1/2/3/4 cols
                </li>
              </ul>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold text-sm">Status Styling</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>
                  <code>.status-badge</code> - Base status badge styling
                </li>
                <li>
                  <code>.status-badge-running</code> - Running state colors
                </li>
                <li>
                  <code>.status-badge-success</code> - Success state colors
                </li>
              </ul>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold text-sm">Page Structure</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>
                  <code>.page-wrapper</code> - Full-height flex container
                </li>
                <li>
                  <code>.page-header</code> - Header with border and background
                </li>
                <li>
                  <code>.page-body</code> - Scrollable content area
                </li>
                <li>
                  <code>.page-content</code> - Centered content with max-width
                </li>
              </ul>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Responsive Spacing"
          description="Spacing adjusts on smaller screens"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Mobile (default)</h4>
              <code className="text-xs">px-4 py-6</code>
              <p className="mt-2 text-sm text-muted-foreground">Smaller padding on mobile devices</p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Tablet (sm:)</h4>
              <code className="text-xs">sm:px-6 sm:py-8</code>
              <p className="mt-2 text-sm text-muted-foreground">Increased padding on tablets</p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Desktop (md:, lg:)</h4>
              <code className="text-xs">lg:px-6 lg:py-8</code>
              <p className="mt-2 text-sm text-muted-foreground">Consistent desktop spacing</p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Common Spacing Patterns"
          description="Ready-to-use spacing combinations"
        >
          <div className="space-y-4">
            <CardPanel className="space-y-2">
              <h4 className="font-semibold">Section Container</h4>
              <code className="text-xs">page-section mb-8 space-y-4</code>
              <p className="text-xs text-muted-foreground">Consistent section styling</p>
            </CardPanel>

            <CardPanel className="space-y-2">
              <h4 className="font-semibold">Card Grid</h4>
              <code className="text-xs">grid grid-cols-auto gap-4</code>
              <p className="text-xs text-muted-foreground">Responsive grid with consistent gap</p>
            </CardPanel>

            <CardPanel className="space-y-2">
              <h4 className="font-semibold">List Items</h4>
              <code className="text-xs">space-y-3</code>
              <p className="text-xs text-muted-foreground">Consistent vertical list spacing</p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Anti-Patterns"
          description="What NOT to do"
        >
          <div className="space-y-4">
            <CardPanel className="border-destructive bg-red-50 dark:bg-red-950/20">
              <h4 className="mb-2 font-semibold text-destructive">DON&apos;T: Arbitrary spacing</h4>
              <code className="text-xs text-destructive">
                &lt;&gt;p-[23px]&lt;/&gt; · m-[47px]&lt;/&gt;
              </code>
            </CardPanel>

            <CardPanel className="border-destructive bg-red-50 dark:bg-red-950/20">
              <h4 className="mb-2 font-semibold text-destructive">
                DON&apos;T: Mix margin and gap
              </h4>
              <code className="text-xs text-destructive">
                &lt;div gap-4 m-4&gt; (choose one pattern)
              </code>
            </CardPanel>

            <CardPanel className="border-green-600 bg-green-50 dark:bg-green-950/20">
              <h4 className="mb-2 font-semibold text-green-700 dark:text-green-400">
                DO: Use spacing scale
              </h4>
              <code className="text-xs text-green-700 dark:text-green-400">
                p-4 · m-2 · gap-6 · space-y-3
              </code>
            </CardPanel>
          </div>
        </Section>
      </PageBody>
    </main>
  )
}
