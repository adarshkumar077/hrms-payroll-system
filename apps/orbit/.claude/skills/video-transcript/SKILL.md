---
name: video-transcript
description: Analyze a local video or screen recording (.mp4/.mov/.mkv/.webm) by extracting frames with ffmpeg and fanning out analysis agents. Use when the user gives a video file path and wants it scanned, transcribed, summarized, or compared against the product.
---

# Video analysis via frame extraction

Self-contained pipeline — no Docker, no hooks, no plugins. Everything runs with npm + the Agent tool. (This replaces the claude-vision plugin skill, which required a hook + custom agent type not installed here.)

## Step 1 — Get ffmpeg (once per machine)

Check for an existing binary first (in this order):
1. `ffmpeg` on PATH
2. `<scratchpad>/ffm/node_modules/ffmpeg-static/ffmpeg.exe` from a previous run

If neither exists, install the static build into the scratchpad (~80 MB, no system changes):

```powershell
npm install ffmpeg-static --prefix "<scratchpad>\ffm" --no-audit --no-fund
# binary: <scratchpad>\ffm\node_modules\ffmpeg-static\ffmpeg.exe
```

## Step 2 — Probe the video

```powershell
& $ff -i "<video path>" -hide_banner
# exits 1 by design; parse "Duration: HH:MM:SS" and resolution from stderr
```

## Step 3 — Extract frames

Pick an interval by duration so you land in the 100–200 frame range:
- ≤ 5 min → 1 frame every 2–3 s
- 5–20 min → 1 frame every 5 s
- 20–60 min → 1 frame every 10–15 s

```powershell
& $ff -y -i "<video path>" -vf "fps=1/5" -q:v 2 "<scratchpad>\frames\f%04d.jpg" -hide_banner -loglevel error
```

Frame N was captured at t = (N−1) × interval seconds — state this in every agent prompt so findings carry timestamps.

## Step 4 — Peek, then fan out

1. Read 2–3 frames yourself (start / middle) to identify what the video is. Tell the user before proceeding.
2. Split frames into contiguous ranges of ~40 and spawn one `general-purpose` agent per range **in a single message** so they run in parallel. Prompt template per agent:

> You are transcribing UI screenshots from a screen recording of <what it is>. Frames are at <frames dir>, named fNNNN.jpg; frame N = t=(N−1)×<interval>s. Your range: fAAAA–fBBBB. Read ALL of them (several in parallel per message). For each frame identify: (1) which screen/page is shown, (2) EVERY visible field label / column header / dropdown value (exact text), (3) every button, tab, filter, status value, (4) panels and widgets. If a frame is nearly identical to the previous, say "same as previous" — but capture anything newly revealed by scrolling. Do not editorialize. Return a dense chronological report with timestamp ranges; dedupe within your report. Your final message is the deliverable.

Adapt clause (2) to the user's actual question (e.g. "describe the actions taken" for a bug repro, "transcribe slide text" for a talk).

## Step 5 — Synthesize

Merge the agents' reports and answer the user's question. If the goal is a gap analysis or review, compare against the codebase/product before writing. Put the full result in your final message (or an Artifact if it's long); save anything worth keeping to a repo file, not the scratchpad.

## Limits

- **No audio.** This pipeline reads pixels only — narration is lost. Screen recordings usually carry the information in on-screen text; if the user needs speech, say so explicitly and ask for a version with captions or a separate transcript.
- Fast scrolling between sampled frames can skip content; if a range looks discontinuous, re-extract just that time span at a denser interval (`-ss <start> -t <len> -vf fps=1`).
- Frames land in the session scratchpad and vanish with it — re-extract per session (it's fast); persist only the analysis.
