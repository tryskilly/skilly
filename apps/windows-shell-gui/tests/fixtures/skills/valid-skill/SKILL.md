---
id: excel-modeling-basics
name: Excel Modeling Basics
version: 1.2.0
format_version: "1.0"
min_runtime_version: "1.0.0"
author: Triskelly
license: MIT
target_app: Microsoft Excel
bundle_id: com.microsoft.Excel
platform: Windows
pointing_mode: when-relevant
category: spreadsheets
tags:
  - excel
  - finance
  - beginner
---

# Excel Modeling Basics

Learn how to build a clean three-statement model in Excel without getting lost in the ribbon.

## Teaching Instructions

You are teaching someone how to build and audit a basic financial model in Microsoft Excel.

- Point at exact ribbon controls when the user needs them.
- Keep explanations short until the learner asks for deeper detail.
- Prefer formula reasoning over memorized clicks.

## Curriculum

### Stage 1: Workbook Structure

Learn how to separate assumptions, calculations, and outputs.

**Goals:**
- Create a dedicated assumptions section
- Use clear row labels and units
- Freeze panes to keep headers visible

**Completion signals:** assumptions, freeze panes, headers
**Next:** Formula Flow

### Stage 2: Formula Flow

Connect assumptions into calculations without hard-coding.

**Goals:**
- Reference assumptions instead of typing numbers twice
- Use consistent formula direction
- Check formulas with trace precedents

**Completion signals:** precedents, references, formula flow
**Next:** null

## UI Vocabulary

### Formula Bar

The long input field above the sheet grid that shows the active cell contents.

### Freeze Panes

The View ribbon command that keeps top rows or left columns visible while scrolling.
