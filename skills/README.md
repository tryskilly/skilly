# Skilly Skills

Open-source curricula for learning macOS apps. Each skill is a single Markdown file (`SKILL.md`) that contains everything an AI tutor — or a human reader — needs to teach an app from scratch: pre-requisites, mental models, step-by-step lessons, common mistakes, and pointers into the official documentation.

**33 hours of curriculum. Apache-2.0 / MIT.** Read them on GitHub or use them with the Skilly companion app for live voice + screen tutoring.

| Skill | Hours | Difficulty | Source | License |
|-------|-------|------------|--------|---------|
| [Blender Fundamentals](./blender-fundamentals/SKILL.md) | 8 | Beginner | Blender 5.1 Manual | Apache-2.0 |
| [After Effects Basics](./after-effects-basics/SKILL.md) | 6 | Beginner | Adobe Help Center (v26.0) | Apache-2.0 |
| [DaVinci Resolve Basics](./davinci-resolve-basics/SKILL.md) | 7 | Beginner | Blackmagic Design docs (v19–20) | Apache-2.0 |
| [Figma Basics](./figma-basics/SKILL.md) | 6 | Beginner | Figma Help Center (UI3) | MIT |
| [Premiere Pro Basics](./premiere-pro-basics/SKILL.md) | 6 | Beginner | Adobe Help Center | Apache-2.0 |

## How to use these skills

### Read them as a curriculum

Every `SKILL.md` is plain Markdown and stands on its own. Open the file on GitHub and read it like a textbook — you'll get a structured tour of the app, the mental models you need before you start, the common beginner mistakes, and pointers into the official docs.

### Use them with Skilly (Mac companion app)

Install [Skilly](https://tryskilly.app) (free 15-minute trial, no credit card). It reads these `SKILL.md` files at runtime and turns them into a live voice tutor that watches your screen and walks you through each lesson out loud. The same Markdown you can read here is what powers the tutor.

### Author your own

The format is documented in [SPEC.md](./SPEC.md). Add a new folder under `skills/`, drop a `SKILL.md` in it, follow the spec, and open a PR — your skill will be available to every Skilly user.

## Writing a new skill

1. Pick an app that doesn't yet have a skill. Good candidates: Logic Pro, Final Cut Pro, Sketch, Notion, Excel, Pages, Xcode, Cinema 4D, Houdini, Figma FigJam, Adobe Illustrator, Photoshop, Lightroom.
2. Read the [SPEC.md](./SPEC.md) for the format requirements.
3. Source content from the **official documentation** for that app — it's the only way to keep the curriculum accurate as the app updates. Cite the source in your skill's intro paragraph.
4. Test it: install Skilly and load your skill. The tutor should be able to answer questions about the app accurately. If it improvises, your `Teaching Instructions` section is too vague.
5. Open a PR.

## License

Each skill carries its own license header (most are Apache-2.0; Figma is MIT). The format itself is permissive — fork it, rename it, ship your own runtime. The hope is that the SKILL.md format becomes a portable standard that any AI agent (Claude, GPT, local models) can read.

## Roadmap

- [ ] Logic Pro
- [ ] Final Cut Pro
- [ ] Xcode
- [ ] Notion
- [ ] Excel
- [ ] Sketch
- [ ] Cinema 4D
- [ ] Houdini

Want one of these? [Open an issue](https://github.com/tryskilly/skilly/issues) and tell us which app + what you'd want it to teach. PRs welcome.
