# Strategy Tool design context

## Product and audience

This is an India broking market intelligence tool for strategy teams and senior leaders. The news view should help readers separate competitor actions, market policy changes, and adjacent fintech developments quickly enough to form their own conclusions.

## Visual language

- Keep the existing dark navy surfaces, fine borders, compact data typography, and restrained amber selection accent.
- Reuse the CSS variables in `src/index.css`; do not introduce a second palette or font system for an individual page.
- Use amber for broker competition, violet for markets and regulation, and mint for the fintech ecosystem. Pair each color with a visible text label.
- Keep controls compact on desktop and comfortably tappable on narrow screens. Preserve visible keyboard focus.

## News behavior and content

- Separate **BFSL**, **Broker competition**, **Markets & regulation**, and **Fintech ecosystem** coverage. Broker filters must include named leaders such as Zerodha and Sahi even when there is no current story.
- Keep broad industry coverage India-focused and tied to broking, investing, fintech, market structure, policy, or capital formation.
- Collapse repeated coverage of the same company event within the three-day collection window. Keep separate events distinct.
- Show the article title, reporting date, topic, company when applicable, and a link to the source. Treat article summaries as source text; do not present generated strategic conclusions as facts.
- Search and topic/company filters operate on unread stories. Marking a story read removes its event group from the unread view.
