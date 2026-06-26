import Link from 'next/link'

// ─── Table of contents ────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'events',      label: 'Events' },
  { id: 'categories',  label: 'Categories' },
  { id: 'parameters',  label: 'Parameters' },
  { id: 'stages',      label: 'Implementation stages' },
  { id: 'ga4',         label: 'GA4 sync' },
  { id: 'devdocs',     label: 'Dev Docs' },
  { id: 'import',      label: 'Import' },
  { id: 'analysis',    label: 'Analysis' },
  { id: 'quality',     label: 'Data quality' },
  { id: 'admin',       label: 'Admin' },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-semibold mb-1">Help guide</h2>
      <p className="text-sm text-muted-foreground mb-8">How to use GA4 Taxonomy</p>

      <div className="grid grid-cols-1 xl:grid-cols-[200px_1fr] gap-8 items-start">

        {/* TOC */}
        <nav className="sticky top-6 space-y-1 self-start hidden xl:block">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contents</p>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block text-sm text-muted-foreground hover:text-foreground py-0.5 transition-colors"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div className="space-y-12 min-w-0">

          {/* Overview */}
          <Section id="overview" title="Overview">
            <P>
              GA4 Taxonomy is a project management tool for planning, documenting, and tracking
              Google Analytics 4 event implementations. It organises work by <strong>Client</strong> →
              <strong> Project</strong> → <strong>Events</strong>, with shared parameters at the project level.
            </P>
            <P>Each project gives you:</P>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
              <li>An event library with implementation stages and GA4 fire counts</li>
              <li>A shared parameter library</li>
              <li>Developer documentation (dataLayer code blocks, field tables, testing status)</li>
              <li>GA4 sync to check which events are firing in production</li>
              <li>Import tools for Google Sheets and GTM containers</li>
            </ul>
          </Section>

          {/* Events */}
          <Section id="events" title="Events">
            <SubSection title="Creating an event">
              <P>Go to a project's <strong>Events</strong> page and click <strong>+ New event</strong>. Fill in the event name, category, trigger description, and any flags (key event, requires dataLayer).</P>
            </SubSection>

            <SubSection title="Editing an event">
              <P>Click any event name to open its detail page. You can update the name, category, trigger, notes, and implementation flags, then click <strong>Save changes</strong>.</P>
            </SubSection>

            <SubSection title="Notes">
              <P>The <strong>Notes</strong> field on each event is for internal context — implementation reminders, edge cases, or anything that doesn't belong in the trigger description. Notes appear below the event name in the events table and are included when you search.</P>
            </SubSection>

            <SubSection title="Searching and filtering">
              <P>The search box on the Events page matches against both the event <strong>name</strong> and <strong>notes</strong>. Use the filter buttons to narrow by:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>Key events</strong> — events marked as GA4 key events</li>
                <li><strong>Needs dataLayer</strong> — events that require a dataLayer push</li>
                <li><strong>⚠ Not fired</strong> — events that were checked in GA4 but had 0 fires (appears once you run a GA4 check)</li>
                <li><strong>Stage</strong> — filter by implementation stage (only stages with events are shown)</li>
              </ul>
            </SubSection>

            <SubSection title="Sorting">
              <P>Click any column header (Event, Category, Progress, GA4 fires) to sort. Click again to reverse; click a third time to clear the sort.</P>
            </SubSection>

            <SubSection title="Bulk actions">
              <P>Tick the checkboxes on the left to select multiple events. The bulk action bar appears with three actions:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>Stage</strong> — set all selected events to the same implementation stage</li>
                <li><strong>Category</strong> — type or pick a category and click Apply to assign it to all selected events</li>
                <li><strong>Delete</strong> — permanently delete all selected events</li>
              </ul>
            </SubSection>

            <SubSection title="Duplicating an event">
              <P>Click the copy icon at the right of any row to duplicate that event (including its parameters). Useful as a starting point for a similar event.</P>
            </SubSection>

            <SubSection title="Copying events between projects">
              <P>Use the <strong>Copy events</strong> button (top right of the Events page) to copy one or more events from another project in the same client into the current project.</P>
            </SubSection>
          </Section>

          {/* Categories */}
          <Section id="categories" title="Categories">
            <P>
              Categories group related events (e.g. <em>ecommerce</em>, <em>search</em>, <em>form</em>) and feed into the
              event naming convention <code className="text-xs bg-muted px-1 py-0.5 rounded">custom.&#123;category&#125;.&#123;name&#125;</code>.
            </P>
            <SubSection title="Assigning a category">
              <P>On the event detail page, click the <strong>Category</strong> field. Existing categories from the project appear as suggestions — select one or type a new value.</P>
            </SubSection>
            <SubSection title="Bulk category assignment">
              <P>On the Events page, select events using the checkboxes, then use the <strong>Category</strong> input in the bulk action bar. Type a new category or pick from the dropdown and click <strong>Apply</strong>.</P>
            </SubSection>
          </Section>

          {/* Parameters */}
          <Section id="parameters" title="Parameters">
            <P>Parameters are the data fields pushed alongside each event. They are shared across all events in a project.</P>

            <SubSection title="Creating a parameter">
              <P>Go to <strong>Parameters</strong> in the sidebar and click <strong>+ New parameter</strong>. Set the name, type (string, int, float, boolean), description, and example value.</P>
            </SubSection>

            <SubSection title="Global parameters">
              <P>Tick <strong>Global</strong> to automatically attach a parameter to every event in the project (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">user_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">page_path</code>). Global parameters appear greyed-out on individual event pages since they can't be detached individually.</P>
            </SubSection>

            <SubSection title="Attaching parameters to an event">
              <P>Open an event's detail page and scroll to the <strong>Parameters</strong> section. Use the dropdown to search for and attach parameters, or detach ones that don't apply to this event.</P>
            </SubSection>

            <SubSection title="GA4 registration">
              <P>Tick <strong>Requires GA4 registration</strong> on a parameter if it needs to be registered as a custom dimension or metric in GA4. Once registered, tick <strong>GA4 registered</strong> to mark it complete. The GA4 Sync page shows registration status.</P>
            </SubSection>

            <SubSection title="Example values">
              <P>The <strong>Example</strong> field on a parameter is used when generating dataLayer code blocks in Dev Docs — the example appears as the value in the generated <code className="text-xs bg-muted px-1 py-0.5 rounded">dataLayer.push()</code> snippet.</P>
            </SubSection>
          </Section>

          {/* Stages */}
          <Section id="stages" title="Implementation stages">
            <P>Every event has an implementation stage that tracks progress through the delivery workflow:</P>
            <div className="space-y-2 mt-3">
              {[
                { color: 'bg-slate-400',  label: 'Not started',           desc: 'Work has not begun on this event.' },
                { color: 'bg-blue-400',   label: 'dataLayer doc done',    desc: 'The dataLayer documentation has been written.' },
                { color: 'bg-indigo-400', label: 'dataLayer implemented', desc: 'The developer has implemented the dataLayer push.' },
                { color: 'bg-amber-400',  label: 'GTM work done',         desc: 'GTM tags and triggers have been set up.' },
                { color: 'bg-green-500',  label: 'Work passed',           desc: 'The implementation has been tested and signed off.' },
              ].map((s) => (
                <div key={s.label} className="flex items-start gap-3">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.color} mt-1 shrink-0`} />
                  <div>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-sm text-muted-foreground"> — {s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <P className="mt-4">Stages are set either on the individual event checklist (detail page) or in bulk from the Events page using the bulk action bar.</P>
          </Section>

          {/* GA4 */}
          <Section id="ga4" title="GA4 sync">
            <SubSection title="Setting up GA4">
              <P>Go to <strong>GA4 Sync</strong> in the sidebar and enter your GA4 property ID (found in GA4 → Admin → Property Settings). Save it to the project.</P>
            </SubSection>

            <SubSection title="Checking event fire counts">
              <P>On the Events page, click <strong>Check GA4 (last 90 days)</strong>. This queries the GA4 Data API and records how many times each event fired. Results appear in the <strong>GA4 fires</strong> column:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>A number — the event fired this many times in the last 90 days</li>
                <li><strong>⚠ Not fired</strong> — the event was checked but had 0 fires</li>
                <li><strong>—</strong> — the event has never been checked</li>
              </ul>
              <P>The <strong>⚠ Not fired</strong> filter button appears once at least one event has a zero count, making it easy to spot events that aren't working in production.</P>
            </SubSection>

            <SubSection title="Syncing key events">
              <P>The GA4 Sync page also lets you push key event status from the taxonomy into GA4 directly, marking the correct events as conversions.</P>
            </SubSection>

            <SubSection title="Finding undocumented events">
              <P>On the GA4 Sync page, the <strong>GA4 Events comparison</strong> panel lists every event firing in GA4 (last 90 days) and compares it against your documented events. Click <strong>Fetch GA4 events</strong> to run the comparison — events are split into <strong>documented</strong> and <strong>undocumented</strong>.</P>
              <P>Undocumented events appear with checkboxes, all ticked by default. Untick the ones you want to skip, or use <strong>Select all</strong> to toggle the whole list, then click <strong>Add N as drafts</strong> to create those events in the project in one go. This is the quickest way to bring real, firing events into your taxonomy.</P>
            </SubSection>
          </Section>

          {/* Dev Docs */}
          <Section id="devdocs" title="Dev Docs">
            <P>Dev Docs generates structured developer documentation for dataLayer implementations — the kind of document that would previously be produced manually as a Word doc per client.</P>

            <SubSection title="Generating documentation">
              <P>Go to <strong>Dev Docs</strong> in the sidebar. If no documentation exists yet, click <strong>Generate all</strong> to create a section for every event that has <em>Requires dataLayer</em> ticked. Each section is created with an auto-generated <code className="text-xs bg-muted px-1 py-0.5 rounded">dataLayer.push()</code> code block using the event's parameters and their example values.</P>
            </SubSection>

            <SubSection title="Adding a single event">
              <P>Use the <strong>Add event</strong> dropdown to add documentation for a single event that isn't in the doc yet.</P>
            </SubSection>

            <SubSection title="Code blocks">
              <P>Each section shows the generated <code className="text-xs bg-muted px-1 py-0.5 rounded">dataLayer.push()</code> snippet. You can edit it directly — it will be marked as <strong>Edited</strong> and won't be overwritten by future regenerations. Click <strong>Regenerate</strong> to reset it back to the auto-generated version.</P>
            </SubSection>

            <SubSection title="Parameter notes and examples">
              <P>The fields table shows each parameter with columns for Name, Description, Type, Example, and Notes. The Example and Notes cells are editable inline — click to type and blur to save. These are per-section overrides (they don't affect the shared parameter definition).</P>
            </SubSection>

            <SubSection title="Implementation status">
              <P>Each section has three status checkboxes:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>Done</strong> — documentation is complete</li>
                <li><strong>Tested</strong> — implementation has been tested</li>
                <li><strong>Test result</strong> — Passed or Failed</li>
              </ul>
              <P>When <strong>Failed</strong> is selected, a screenshot panel appears so you can upload failure screenshots directly into the doc.</P>
            </SubSection>

            <SubSection title="Comments">
              <P>Each section has a comments thread for developer notes and back-and-forth during implementation.</P>
            </SubSection>

            <SubSection title="Importing from a Google Doc">
              <P>If you already have a dataLayer doc written in Google Docs, click <strong>↑ Import Google Doc</strong>, paste the URL, and click Import. The tool will parse the doc and populate code blocks and parameter notes for any events it can match by name.</P>
              <P>If you see a <em>Google Docs access needs to be re-authorised</em> message, click the Re-authorise button and sign in again — this grants the Docs read permission and only needs to be done once.</P>
            </SubSection>

            <SubSection title="Exporting">
              <P>Three export options are available from the top of the Dev Docs page:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>Word</strong> — downloads a .docx file with all sections, code blocks, and field tables</li>
                <li><strong>Google Doc</strong> — creates a new Google Doc in your Drive and opens it in a new tab</li>
                <li><strong>Print / PDF</strong> — opens the browser print dialog with the sidebar hidden</li>
              </ul>
            </SubSection>
          </Section>

          {/* Import */}
          <Section id="import" title="Import">
            <SubSection title="Google Sheets import">
              <P>Go to <strong>Import</strong> in the sidebar. Paste the URL of a Google Sheet that contains event data. The importer reads the standard column layout (event name, trigger, key event flag, developer input needed, parameters) and creates or updates events in the current project.</P>
            </SubSection>

            <SubSection title="GTM container import">
              <P>Export a GTM container as JSON from GTM → Admin → Export Container, then upload it on the Import page. The tool extracts GA4 event tags and creates matching events in the project.</P>
            </SubSection>
          </Section>

          {/* Analysis */}
          <Section id="analysis" title="Analysis">
            <P>
              The Analysis section combines your GA4 data with your event taxonomy and qualitative research to help
              you understand user behaviour. Claude knows what every event means (trigger, parameters, category)
              so it can interpret data in context, not just return raw numbers.
            </P>
            <P>Access it via <strong>🔍 Analysis</strong> in the sidebar. There are three tabs:</P>

            <SubSection title="💬 Chat">
              <P>Ask free-form questions about your GA4 data or user behaviour. Examples:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>"Why are mobile users converting at half the rate of desktop?"</li>
                <li>"Show me the checkout funnel for the last 30 days"</li>
                <li>"Which pages have the highest drop-off rate?"</li>
                <li>"What do user tests say about the payment step?"</li>
              </ul>
              <P className="mt-2">Claude automatically queries GA4, searches your research documents, and cross-references both to give you a grounded answer. Tool use is shown inline so you can see what data was pulled.</P>
            </SubSection>

            <SubSection title="🔬 Guided analysis">
              <P>For more structured, hypothesis-driven analysis. A 6-step wizard collects context before Claude runs a full investigation:</P>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground ml-2">
                <li><strong>Core question</strong> — what do you want to understand?</li>
                <li><strong>Use case</strong> — what will you do with the insight? (UX design, experiments, campaigns, email, business case)</li>
                <li><strong>Stakeholder context</strong> — who is this for, their data literacy, key KPIs, where the insight goes</li>
                <li><strong>Prior knowledge</strong> — what do you already know or assume?</li>
                <li><strong>Sub-questions</strong> — specific questions that together answer the core question (AI can suggest these)</li>
                <li><strong>Hypotheses</strong> — what do you expect to find? Claude actively tries to <em>disprove</em> these to avoid confirmation bias</li>
              </ol>
              <P className="mt-2">The output is a structured report with: executive summary, a verdict per hypothesis (CONFIRMED / DISPROVED / INCONCLUSIVE) with evidence, top 3 recommendations with commercial impact estimates, and suggested next steps.</P>
              <P>The report format and language adapt to the use case and stakeholder data literacy you set in step 2–3.</P>
              <P>A collapsible <strong>Analysis brief</strong> at the top of the finished report recaps the inputs you gave during setup (core question, use cases, stakeholder, KPIs, prior knowledge, and hypotheses) so the report is self-explanatory.</P>
            </SubSection>

            <SubSection title="Working with the finished report">
              <P>The report is interactive — highlight any passage to get three options:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>🔍 Tell me more</strong> — Claude drills into that passage with fresh GA4 data and shows the detail in a side panel</li>
                <li><strong>✏️ Fix this</strong> — Claude checks the passage against real GA4 data and proposes a correction. You can refine it with follow-up chat, then <strong>Apply to report</strong> to replace the original text</li>
              </ul>
              <P className="mt-2">Drill-down and suggested-fix panels each have a <strong>✕</strong> to remove them (the report text itself is left untouched).</P>
              <P>The buttons at the top of the report let you:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>🖨 Download PDF</strong> — opens the print dialog; the full report (including expanded drill-downs) is included</li>
                <li><strong>✏️ Edit report</strong> — rewrite the report markdown directly, then Save</li>
                <li><strong>← Edit setup</strong> — go back into the wizard to change inputs and re-run the analysis</li>
              </ul>
            </SubSection>

            <SubSection title="📚 Research library">
              <P>Upload qualitative research so Claude can reference it during analysis. Supported types:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>User test notes</li>
                <li>Survey responses</li>
                <li>Session replay observations</li>
                <li>Interviews</li>
                <li>Support tickets</li>
              </ul>
              <P className="mt-2">Add documents by pasting text or uploading <code className="text-xs bg-muted px-1 py-0.5 rounded">.txt</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">.md</code>, or <code className="text-xs bg-muted px-1 py-0.5 rounded">.pdf</code> files. Include a title, type, and optional source (researcher name, tool used, date).</P>
              <P>When you ask a question in Chat or run a Guided analysis, Claude automatically searches these documents for relevant evidence using the <em>search_documents</em> tool.</P>
            </SubSection>

            <SubSection title="Requirements">
              <P>The Analysis feature requires:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>A GA4 property ID set in <strong>GA4 Sync</strong> (for data queries)</li>
                <li>An <code className="text-xs bg-muted px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code> environment variable set on the server</li>
              </ul>
            </SubSection>
          </Section>

          {/* Quality */}
          <Section id="quality" title="Data quality">
            <P>
              The Quality section runs a weekly GA4 health check per project, comparing the last 7 days against the prior 7 days and cross-referencing against your event taxonomy.
            </P>

            <SubSection title="What gets checked">
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>Core metrics</strong> — sessions, users, engaged sessions, conversions (flags &gt;15% drop as amber, &gt;30% as red)</li>
                <li><strong>Event inventory audit</strong> — events in your taxonomy with zero fires, unexpected events not in taxonomy, events with &gt;50% volume change</li>
                <li><strong>Key event check</strong> — conversion counts for all events marked as key events</li>
                <li><strong>Traffic sources</strong> — channel breakdown with week-over-week shifts</li>
                <li><strong>Top pages</strong> — top 10 pages flagging drops or unexpected new entries</li>
                <li>Any <strong>custom prompts</strong> you've added</li>
              </ul>
              <P className="mt-2">Each report ends with an overall health rating: <strong>🟢 GREEN</strong> / <strong>🟡 AMBER</strong> / <strong>🔴 RED</strong>.</P>
            </SubSection>

            <SubSection title="Interactive findings">
              <P>Select any text in a report to get two options:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><strong>🚫 Ignore this</strong> — creates a suppression rule; future reports will skip this finding</li>
                <li><strong>🔍 Tell me more</strong> — Claude drills down into that specific finding with more GA4 data, pulling detailed numbers and root cause analysis</li>
              </ul>
              <P className="mt-1">Drill-down responses appear below the report and can be expanded/collapsed.</P>
            </SubSection>

            <SubSection title="Custom prompts">
              <P>Go to <strong>⚙️ Settings</strong> to add custom prompts that get included in every monitoring run. Use these to focus on what matters most for a specific project, for example:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>"Always check checkout conversion rate and flag if it drops below 2%"</li>
                <li>"Compare mobile vs desktop conversion rates separately"</li>
                <li>"Flag if add_to_cart event drops below 50 fires per day"</li>
              </ul>
              <P className="mt-1">Prompts can be toggled on/off without deleting them.</P>
            </SubSection>

            <SubSection title="Suppressions">
              <P>Suppressions are created when you select text and click "Ignore this". They appear in <strong>⚙️ Settings → Suppressions</strong> where you can:</P>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>See all active suppressions</li>
                <li>Re-enable a suppression if you want it to reappear in future reports</li>
                <li>Delete suppressions entirely</li>
              </ul>
            </SubSection>

            <SubSection title="Scheduling weekly reports">
              <P>Click <strong>▶ Run now</strong> to generate a report immediately. For automated weekly runs, add a cron job on the server:</P>
              <pre className="text-xs bg-muted rounded p-3 mt-2">
                {`# Run every Monday at 8am (replace with your project's API URL)
0 8 * * 1 curl -X POST https://datadocs.meliorum.com.au/api/clients/CLIENT_ID/projects/PROJECT_ID/quality/reports`}
              </pre>
            </SubSection>
          </Section>

          {/* Admin */}
          <Section id="admin" title="Admin">
            <P>The Admin section is only visible to super-admin users.</P>

            <SubSection title="Managing clients">
              <P>Go to <strong>Admin → Clients</strong> to create new clients, rename existing ones, or delete them. Each client can have one or more projects.</P>
            </SubSection>

            <SubSection title="Assigning users">
              <P>On a client's admin page, use the <strong>Add user</strong> section to give a user access to that client. Users can only see clients they've been assigned to. Super-admins can see all clients.</P>
            </SubSection>

            <SubSection title="Managing projects">
              <P>Projects are created and managed from the client's admin page. Each project has its own event library, parameters, and Dev Docs.</P>
            </SubSection>
          </Section>

        </div>
      </div>
    </div>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">{title}</h3>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-1.5">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function P({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-muted-foreground leading-relaxed ${className}`}>{children}</p>
}
