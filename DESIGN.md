---
name: Pickle mobile
description: A quiet decision inbox in the TaskNotes and mdbase standards-notebook family.
colors:
  paper: "#FFFFFF"
  paper-soft: "#FAFBFC"
  ink: "#20242C"
  ink-soft: "#505965"
  ink-muted: "#77818E"
  line: "#E6EAF0"
  line-strong: "#CDD3DC"
  accent: "#356F96"
  danger: "#974D4A"
  success: "#4F735D"
dark-colors:
  paper: "oklch(17.5% 0.012 255)"
  paper-soft: "oklch(20% 0.013 255)"
  paper-raised: "oklch(21.5% 0.014 255)"
  ink: "oklch(92% 0.008 255)"
  ink-soft: "oklch(78% 0.01 255)"
  ink-muted: "oklch(67% 0.012 255)"
  line: "oklch(29% 0.012 255)"
  line-strong: "oklch(40% 0.014 255)"
  accent: "oklch(73% 0.09 238)"
typography:
  title: "Atkinson Hyperlegible 700"
  body: "Atkinson Hyperlegible 400"
  metadata: "Azeret Mono 500"
rounded:
  control: "6px"
  sheet: "12px"
---

# Design System: Pickle mobile

## Creative north star

**A decision slip inside a pocket standards notebook.** Pickle uses the same
paper, blue-black ink, quiet rules, literal labels, and compact navigation as
TaskNotes. Each request begins with a small state marker that makes pending,
answered, conflict, and cancelled states scan without dashboard decoration.

The physical scene is a person checking one agent request on a phone during
ordinary daylight or after dark, often one-handed. The app must present the
decision and supporting context with stable controls and no ceremony.

## Color

Use a restrained palette. Paper is the canvas, paper-soft is reserved for
navigation and read-only metadata, and rules separate repeated rows. Accent
blue indicates focus and current selection. Green appears only with an explicit
positive decision; red appears with rejection, conflict, or destructive
disconnect actions.

Dark mode uses deep blue-black paper and close raised surfaces. State always
has a label or symbol in addition to colour.

## Typography

Atkinson Hyperlegible carries headings, request titles, controls, and prose.
Azeret Mono is reserved for source, dates, state, type names, and Markdown
paths. Preserve platform text scaling and avoid text smaller than 11 points.

## Layout

Views are edge-to-edge pages with 20-point horizontal insets. Requests are rows
separated by one-pixel rules, never a card grid. The mobile bottom navigation
is flat. On wider screens, navigation becomes a rail and request detail opens
in a stable inspector beside the inbox.

## Components

- Request rows have at least a 56-point target and a leading labelled state
  marker.
- Buttons are text or lightly outlined controls. Positive, negative, and revise
  actions share a stable row without saturated fills.
- Inputs use the current surface and a complete one-pixel border.
- Loading uses skeleton rows.
- Empty states name the next useful action.
- Attachment rows identify the file type and expand in place. Images and PDFs
  render as bounded document previews; Markdown uses the same typesetting as
  request context so a decision can be made without leaving the inspector.

## Motion

Use 150 to 220 millisecond ease-out transitions for state changes and inspector
reveals. Do not animate layout or orchestrate page entry. Respect reduced
motion.
