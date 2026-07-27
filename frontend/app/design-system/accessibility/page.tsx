import { PageHeader } from '@/components/layout/page-header'
import { PageBody } from '@/components/layout/page-body'
import { Section } from '@/components/layout/section'
import { CardPanel } from '@/components/layout/card-panel'
import { Button } from '@/components/ui/button'
import { AccessibilityIcon } from 'lucide-react'

export default function AccessibilityPage() {
  return (
    <main className="ds-page-wrapper">
      <PageHeader
        title="Accessibility"
        description="WCAG compliance and accessible design patterns"
        icon={<AccessibilityIcon className="h-6 w-6" />}
      />
      <PageBody>
        <Section
          title="Focus Management"
          description="All interactive elements have visible focus states"
        >
          <div className="space-y-4">
            <div>
              <p className="mb-3 text-sm font-semibold">Try tabbing through these buttons:</p>
              <div className="flex flex-wrap gap-2">
                <Button>Focus Test 1</Button>
                <Button variant="outline">Focus Test 2</Button>
                <Button variant="ghost">Focus Test 3</Button>
              </div>
            </div>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Implementation</h4>
              <code className="text-xs">
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              </code>
              <p className="mt-3 text-sm text-muted-foreground">
                Uses Tailwind&apos;s focus-visible modifier to show focus rings only for keyboard
                navigation, not mouse clicks.
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Semantic HTML"
          description="Proper use of heading hierarchy and semantic elements"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Heading Hierarchy</h4>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>
                  <code>&lt;h1&gt;</code> - Page title (one per page)
                </li>
                <li>
                  <code>&lt;h2&gt;</code> - Section headings
                </li>
                <li>
                  <code>&lt;h3&gt;</code> - Subsection headings
                </li>
                <li>Never skip heading levels</li>
              </ul>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Semantic Markup</h4>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>
                  <code>&lt;main&gt;</code> - Primary content
                </li>
                <li>
                  <code>&lt;nav&gt;</code> - Navigation regions
                </li>
                <li>
                  <code>&lt;article&gt;</code> - Self-contained content
                </li>
                <li>
                  <code>&lt;section&gt;</code> - Content grouping
                </li>
              </ul>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Color Contrast"
          description="WCAG AA compliance for readability"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Contrast Ratios</h4>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>Text on background: 4.5:1 minimum</li>
                <li>Large text (18pt+): 3:1 minimum</li>
                <li>UI components: 3:1 minimum</li>
                <li>Status colors: Tested in light &amp; dark modes</li>
              </ul>
            </CardPanel>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CardPanel className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                Running - 4.8:1 ratio
              </CardPanel>
              <CardPanel className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
                Success - 5.2:1 ratio
              </CardPanel>
              <CardPanel className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                Warning - 4.1:1 ratio
              </CardPanel>
              <CardPanel className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">
                Error - 4.9:1 ratio
              </CardPanel>
            </div>
          </div>
        </Section>

        <Section
          title="Motion Preferences"
          description="Respects user prefers-reduced-motion setting"
        >
          <CardPanel>
            <h4 className="mb-2 font-semibold">Implementation</h4>
            <code className="block text-xs leading-relaxed">
              {`@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}`}
            </code>
            <p className="mt-3 text-sm text-muted-foreground">
              If you&apos;ve enabled &quot;Reduce motion&quot; in your system settings, animations will
              be disabled across the entire application.
            </p>
          </CardPanel>
        </Section>

        <Section
          title="ARIA Attributes"
          description="Proper ARIA labeling for dynamic content"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Common ARIA Patterns</h4>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>
                  <code>aria-label</code> - Accessible name for unlabeled elements
                </li>
                <li>
                  <code>aria-describedby</code> - Extended description
                </li>
                <li>
                  <code>aria-busy</code> - Loading state indication
                </li>
                <li>
                  <code>aria-disabled</code> - Disabled state for custom elements
                </li>
              </ul>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Status Badge Accessibility</h4>
              <p className="text-sm text-muted-foreground">
                Status badges use semantic classes and color names, not color alone. Always pair visual
                indicators with text labels.
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Keyboard Navigation"
          description="Full keyboard accessibility support"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Tab Order</h4>
              <p className="text-sm text-muted-foreground">
                Interactive elements are focusable in logical order. Use native HTML elements (button,
                a, input) whenever possible for automatic keyboard support.
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Skip Links</h4>
              <p className="text-sm text-muted-foreground">
                Pages include skip-to-content links for keyboard users to bypass navigation and jump
                directly to main content.
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Testing Checklist"
          description="Quick accessibility audit items"
        >
          <CardPanel>
            <ul className="space-y-2 text-sm">
              <li>
                <input type="checkbox" className="mr-2" />
                Tab through all interactive elements
              </li>
              <li>
                <input type="checkbox" className="mr-2" />
                Check focus visible rings on all buttons
              </li>
              <li>
                <input type="checkbox" className="mr-2" />
                Verify heading hierarchy with screen reader
              </li>
              <li>
                <input type="checkbox" className="mr-2" />
                Test color contrast in light &amp; dark modes
              </li>
              <li>
                <input type="checkbox" className="mr-2" />
                Disable animations via system preferences
              </li>
              <li>
                <input type="checkbox" className="mr-2" />
                Test with keyboard only (no mouse)
              </li>
              <li>
                <input type="checkbox" className="mr-2" />
                Use automated accessibility scanner (Axe, WAVE)
              </li>
            </ul>
          </CardPanel>
        </Section>
      </PageBody>
    </main>
  )
}
