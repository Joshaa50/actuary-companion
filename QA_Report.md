# Tabula — Actuarial Study App: QA Report
**Date:** 20 June 2026  
**Tester:** Claude (automated QA pass)  
**File tested:** `index.html` (681 KB, single-file app)

---

## Overall Status: ⚠️ Needs Work

The app loads, navigates, and renders all sections correctly. The core UX skeleton is solid. However there are several notable bugs — one highly visible rendering error on the Dashboard, a broken mastery tracking system, and a handful of hardcoded-data issues that would mislead users into thinking stats are real when they're not.

---

## 🔴 High Severity Bugs

### BUG-01 — "To exam" stat card renders raw template literal (Dashboard)
**Visible?** Yes — renders as `${formatExamDate(state...}` in the UI  
**Location:** `renderHome()`, line 980

The third argument to `statCard()` is wrapped in single quotes inside a template literal, which prevents interpolation:
```js
// BROKEN:
${statCard(daysToExam()+'d','To exam','${formatExamDate(state.examDate)}')}

// FIX:
${statCard(daysToExam()+'d','To exam', formatExamDate(state.examDate))}
```
The `daysToExam()` count (93d) is correct — only the date sub-label below it is broken. The same `formatExamDate()` function works correctly in the sidebar exam card.

---

### BUG-02 — Mastery tracking data is never used in the UI
**Visible?** Not immediately obvious, but makes the whole Progress section misleading  
**Location:** `subMastery()` function, line 1609–1611

The app records flashcard ratings into a `mastery` object in localStorage (via `recordCardRating()`), but `subMastery()` completely ignores it:
```js
// CURRENT (wrong):
function subMastery(id){
  return pool[id] ? 100 : 0;   // pool = "is this topic checked?" — not performance
}
```
This means the mastery bars in Progress, the ring charts on the Dashboard, and the module mastery percentages all just reflect *whether a topic is ticked*, not actual flashcard performance. A user who has rated every CM1A card "Again" still sees 68% mastery. The `mastery` state is saved but orphaned.

**Fix:** Use the `mastery` object to compute a real percentage:
```js
function subMastery(id){
  if(!pool[id]) return 0;
  const m = mastery[id];
  if(!m || m.seen === 0) return 0;
  return Math.round(m.good / m.seen * 100);
}
```
The hardcoded values in the `MODULES` array (68%, 55%, etc.) should also be computed dynamically.

---

### BUG-03 — All Dashboard stats are hardcoded (never update)
**Visible?** Yes, but only apparent over time  
**Location:** `renderHome()`, lines 966–1070

Every figure on the Dashboard is a static placeholder:
- Cards due today: always **29**
- Overall mastery: always **68%**
- Day streak: always **12**
- Study activity chart: hardcoded M/T/W/T bar heights
- Total cards reviewed: always **342**
- Written Qs answered: always **48**
- Hours studied: always **24h 30m**

None of these update when the user actually studies. The app tracks mastery data in localStorage but none of it feeds back into the dashboard stats.

---

## 🟡 Medium Severity Bugs

### BUG-04 — Daily goal progress bar always shows 0%
**Location:** `renderHome()`, line 1001

```js
// Both branches of the ternary return 0 — the numerator is always 0:
Math.round((state.dailyGoal > 0 ? 0 : 0) / state.dailyGoal * 100)
```
The bar is permanently empty regardless of study time logged. There's also no mechanism to track time studied, so there's nothing to display here yet — but the bug makes it look like a rendering error.

---

### BUG-05 — Planner "today" always highlights Friday (wrong day)
**Location:** `renderPlanner()`, line 1109

```js
<div class="plan-day${di === 4 ? ' today' : ''}">
```
Index 4 is hardcoded as "today". Combined with the hardcoded plan dates (Mon 15 – Sun 22), this means:
- The "today" highlight is always on Friday regardless of the actual day
- The date numbers in each cell don't match the actual current week
- Opened today (Saturday 20 June), the app correctly shows "Sat" highlighted blue in the sidebar countdown, but the planner highlights Friday as today

**Fix:** Compute `defaultPlan()` dynamically from the current week's dates, and find the real today's index by matching day-of-week.

---

### BUG-06 — `callClaude()` actually calls the Gemini API (misleading + potentially broken)
**Location:** `callClaude()`, line 1955

```js
async function callClaude(prompt){
  const key = loadAIKey();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=...`
  );
```
Two problems:
1. The function is named `callClaude` but uses Google's Gemini API. The UI prompts "Add API key" with no indication it's a *Google AI Studio* key — a user who adds a Claude/Anthropic API key will get authentication errors.
2. The model string `gemini-3.1-flash-lite` is not a valid Gemini model name (likely `gemini-1.5-flash-lite` or `gemini-2.0-flash-lite`). API calls will fail with a model-not-found error.

---

### BUG-07 — Duplicate subtopic IDs across CS1A and CS1B in SYLLABUS
**Location:** `SYLLABUS` array, lines 294–325

CS1B's subtopics use the same `id` values as CS1A (`data-aims`, `rv-dist`, `inf-est`, etc.). Since `pool` is a flat object keyed by `id`, enabling/disabling a CS1B subtopic silently affects the same pool entry as the corresponding CS1A subtopic. They can't be independently controlled.

---

## 🟢 Low Severity Bugs

### BUG-08 — Empty `<div class="fc-q">` rendered on flashcard front
**Location:** `renderFlashcards()`, line 1199

When not flipped, the following renders an empty `fc-q` div before the actual question:
```js
<div class="fc-q">${state.fcFlipped ? '<span>Answer</span>' : ''}</div>
```
When `state.fcFlipped` is false, this produces `<div class="fc-q"></div>`. Not visible to the user but creates unnecessary DOM noise and may slightly affect spacing.

### BUG-09 — `.mono` CSS class uses a sans-serif font
**Location:** CSS, line 81

```css
.mono { font-family: 'Hanken Grotesk', sans-serif }
```
A class named `mono` using a proportional sans-serif font is semantically wrong. It's not referenced in visible UI, but if used it would silently fail to apply monospace. Should be `'JetBrains Mono', monospace`.

---

## ✅ Things That Work Well

- **Navigation:** All 5 sidebar nav items (Dashboard, Planner, Flashcards, Practice, Progress) load and render without errors
- **Flashcard flip mechanism:** Click-to-flip works, again/hard/good/easy ratings are rendered correctly after flip, and the "weak queue" review round logic is properly implemented
- **Practice question flow:** Submit → compare → self-grade (Incorrect/Partial/Correct) → next question cycle works cleanly
- **R IDE (CS1B):** WebR integration architecture is solid — 4-panel layout (editor, console, environment, plots) renders correctly, syntax highlighting works, and the "Start R → Run" flow is correctly gated
- **Weekly planner:** Add/remove chip modal and edit-mode toggle render correctly; localStorage persistence is in place
- **Progress tracker:** Collapsible course/topic/subtopic hierarchy with indeterminate checkbox states is correctly implemented; pool toggling and "Select all / Clear all" work
- **MathJax LaTeX rendering:** Set up correctly via CDN; `typesetPromise()` is called after every render so math in questions and answers will render
- **AI question generation:** JSON parsing is robust with multiple fallback strategies for LaTeX backslash escaping; error handling is present
- **Sidebar exam countdown:** Days-to-exam calculation is correct and updates when the exam date is changed in the Planner
- **Data persistence:** localStorage used for study pool, mastery ratings, plan data, and exam date settings
- **Visual design:** Clean, professional aesthetic. Typography, colour system, and spacing are consistent throughout

---

## 💡 Suggested Improvements (not bugs)

1. **Wire mastery data back to the UI** — The `mastery` object is being written to correctly; it just needs to feed `subMastery()` and the module mastery % shown on the Dashboard
2. **Add a time-tracking mechanism** — Even a "session timer" that runs while the user is on a study section would let the daily goal progress bar and activity chart become functional
3. **Generate planner dates dynamically** — Derive the week grid from `new Date()` so dates always reflect the actual current week
4. **Rename `callClaude` → `callAI` and update UI copy** — Label the API key field as "Google AI Studio API key" to avoid confusion with Claude/Anthropic
5. **Verify the Gemini model name** — `gemini-3.1-flash-lite` should be checked against the Gemini API docs; likely needs to be `gemini-1.5-flash-latest` or `gemini-2.0-flash`
6. **Keyboard shortcuts for flashcards** — Spacebar to flip, 1/2/3/4 for ratings would significantly speed up study sessions
7. **Auto-load WebR on CS1B section enter** — Currently requires an extra "⚡ Start R" click; auto-loading in the background when the user navigates to CS1B would be smoother
8. **Disambiguate CS1A vs CS1B subtopic IDs** — Prefix IDs with the module code (e.g. `cs1b-data-aims`) to allow independent pool control
9. **Show a proper empty state for the activity chart** — When no study data exists, a prompt like "Start studying to see your activity" would be clearer than flat bars showing 0

---

## Summary Table

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| BUG-01 | 🔴 High | `${formatExamDate(...)}` renders as raw text in "To exam" stat card | Open |
| BUG-02 | 🔴 High | Mastery tracking data is recorded but never displayed | Open |
| BUG-03 | 🔴 High | All dashboard stats are hardcoded, never update | Open |
| BUG-04 | 🟡 Medium | Daily goal progress bar always 0% (broken calculation) | Open |
| BUG-05 | 🟡 Medium | Planner "today" always highlights Friday; dates don't match current week | Open |
| BUG-06 | 🟡 Medium | `callClaude` calls Gemini with invalid model name; wrong key expected | Open |
| BUG-07 | 🟡 Medium | CS1A and CS1B share duplicate subtopic IDs in SYLLABUS | Open |
| BUG-08 | 🟢 Low | Redundant empty `<div class="fc-q">` on flashcard front face | Open |
| BUG-09 | 🟢 Low | `.mono` CSS class incorrectly uses a proportional font | Open |
