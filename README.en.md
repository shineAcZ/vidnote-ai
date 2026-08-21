# VidNote AI

**English** | [简体中文](README.md)

Turn Bilibili and YouTube subtitles into well-structured Markdown notes with timestamps that link back to the original video.

VidNote AI is a local-first, open-source browser extension. It reads video subtitles, displays the complete transcript in a sidebar, and generates video notes through DeepSeek or another OpenAI-compatible API configured by the user. Notes can be saved and read in the browser or exported for use in Obsidian.

> This project is currently in public testing and has not yet been published in browser extension stores. Please read the installation and privacy sections before installing a development build.

## Why VidNote AI?

- More than a short summary: turn a transcript into a detailed, readable walkthrough of the video.
- Keep every claim traceable: timestamps in transcripts and notes jump back to the corresponding moment.
- Handle long videos: generate from the entire transcript or use chunked parallel processing with recovery.
- Control the prompt: use built-in detailed-note and concise-summary templates, edit them, or create your own.
- Local-first storage: transcripts, jobs, settings, and notes stay in the current browser by default.
- Bring your own API key: choose your own model and provider; the extension does not proxy AI requests.

## Features

### Subtitle extraction

- Automatically reads subtitles exposed by Bilibili and YouTube pages.
- Lets you choose between available subtitle tracks.
- Imports local SRT and VTT files.
- Provides a full transcript, keyword search, and current-position marker.
- Jumps to the corresponding video position when a timestamp is clicked.
- Reloads the current page and selected subtitle track before generation to reduce cross-video mistakes.

### AI-generated notes

- Supports DeepSeek and OpenAI-style `/chat/completions` APIs.
- Lets you enable or disable DeepSeek thinking mode.
- Shows streamed output, elapsed time, the current stage, and per-chunk progress.
- Supports one-shot and chunked parallel generation strategies.
- Attempts to continue automatically when output reaches the model's length limit.
- Retries with backoff after 429, 503, and temporary network errors.
- Supports pausing, resuming, and preserving completed chunk progress.

### Reading, storage, and export

- Saves multiple notes for the same video, with collapse, copy, export, and delete controls.
- Provides heading navigation and links within a note.
- Renders common Markdown elements, including headings, lists, tables, blockquotes, task lists, links, and code blocks.
- Adds language labels and copy controls to code blocks.
- Supports light, dark, and system themes.
- Exports timestamp links compatible with Obsidian Media Extended.

## Supported platforms

| Browser | Status | Source directory |
|---|---|---|
| Google Chrome | Supported via development installation | [`chromium/`](chromium/) |
| Microsoft Edge | Supported via development installation | [`chromium/`](chromium/) |
| Firefox Desktop 140+ | Supported via temporary installation or a Mozilla-signed build | [`firefox/`](firefox/) |

Chrome and Edge share the Chromium build. Firefox uses a separate manifest and its native sidebar implementation.

## Install a development build

Download a package from [GitHub Releases](https://github.com/shineAcZ/vidnote-ai/releases). If no Release is available yet, clone the repository and load the appropriate source directory directly.

### Chrome

1. Download and extract the Chromium package, or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Select the extracted directory that contains `manifest.json`; when loading from source, select `chromium/`.
6. Open a supported video page and click the VidNote AI toolbar icon.

### Microsoft Edge

1. Download and extract the Chromium package, or clone this repository.
2. Open `edge://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Select the extracted directory that contains `manifest.json`; when loading from source, select `chromium/`.

### Firefox

For development and testing:

1. Open `about:debugging`.
2. Select **This Firefox**.
3. Select **Load Temporary Add-on**.
4. Choose `firefox/manifest.json`.

Temporary extensions disappear after Firefox restarts. Regular Firefox users need a Mozilla-signed XPI; an XPI whose filename contains `unsigned` is not a production installation package.

## Quick start

1. Open the VidNote AI sidebar and go to **Settings**.
2. Select an AI provider and enter the API URL, API key, and model name.
3. Select **Save settings**. The extension saves the configuration and tests the connection automatically.
4. Open a Bilibili or YouTube video with subtitles.
5. Open **Full transcript** and verify that the selected language and content are correct.
6. Open **AI notes**, choose a prompt template, and start generating.
7. Read, copy, or export the completed Markdown note.

We recommend creating a dedicated API key for the extension and applying budget or usage limits in the provider's dashboard. Third-party AI APIs may incur charges.

## AI provider compatibility

DeepSeek is supported by default. You can also configure another service that exposes an OpenAI-compatible Chat Completions API.

A common DeepSeek API base URL is:

```text
https://api.deepseek.com
```

A custom provider normally requires:

- API URL.
- API key.
- Model name.
- Generation parameters such as maximum output length and temperature.

Context length, output limits, concurrency limits, and thinking-mode parameters vary by provider. Refer to the documentation for the service you use.

## Generation strategies

### One-shot generation

This is the default strategy. As long as the transcript fits within the model's context window, the extension sends it as one generation job.

Best for:

- Short and medium-length videos.
- Notes that benefit from a more consistent overall structure.
- Models with large context windows and output limits.

### Chunked parallel generation

When **Use chunked generation strategy** is enabled in a prompt's settings, the extension splits the transcript, processes chunks in parallel, and merges the ordered results into a final note.

Best for:

- Very long videos.
- Models with smaller context windows.
- Reducing elapsed time through controlled parallelism.

Higher concurrency is not always faster. It increases burst token usage and the chance of provider rate limits. When rate limiting occurs, the extension reduces the effective request rate and retries automatically.

## Timestamps and Obsidian

During generation, the extension uses a consistent internal timestamp marker:

```markdown
{{t:4|00:00:04}}
```

On export, it is converted to an Obsidian Media Extended link such as:

```markdown
[00:00:04](obsidian://mx-open?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV123&t=4)
```

After installing and configuring Media Extended in Obsidian, select a timestamp to open the corresponding point in the original video.

## Data and privacy

VidNote AI does not operate an AI proxy server and does not include advertising, telemetry, or third-party analytics SDKs.

```text
Video page ──read subtitles──> Local browser storage
                                      │
                            User starts generation
                                      │
                                      ▼
                            User-selected AI API
                                      │
                                      ▼
                           Local note ──> Markdown export
```

- API settings are stored in the browser extension's local storage.
- Transcripts, jobs, and notes are stored in local IndexedDB.
- Necessary data is sent to the selected AI provider only when testing a connection or when the user starts note generation.
- Locally saved notes normally remain available after refreshing the page or reopening the sidebar.
- Uninstalling the extension or clearing extension data may delete local content. Export important notes first.
- Never post API keys, cookies, full copyrighted transcripts, or other sensitive information in Issues, screenshots, or commits.

Read the complete [Privacy Policy](PRIVACY.md).

## Permissions

<details>
<summary>View the extension permission explanations</summary>

| Permission | Purpose |
|---|---|
| `activeTab` | Identifies the active video tab and performs user-requested interactions |
| `storage` | Saves settings and prompt templates |
| `downloads` | Exports Markdown files |
| `sidePanel` (Chromium) | Displays the interface in the Chrome and Edge side panel |
| `webRequest` | Temporarily identifies YouTube subtitle URLs requested by the player; it does not modify requests or read cookies |
| Bilibili and YouTube host access | Reads video information and subtitles and performs timestamp navigation |
| DeepSeek host access | Calls the DeepSeek API configured by the user |
| Optional HTTPS and localhost access | Requested when the user configures another compatible API |

</details>

## Known limitations

- Video websites may change their players or subtitle endpoints, requiring compatibility updates.
- Some YouTube subtitles depend on short-lived tokens, login state, or regional policies and may not always be readable.
- Firefox's native sidebar open state belongs to the browser window and does not map perfectly to an individual tab.
- AI output quality, speed, cost, and availability depend on the selected model and provider.
- Cloud sync is not currently available. Notes do not automatically move between browsers, profiles, or devices.

If you encounter a problem, first confirm that the video player itself can display subtitles, then submit a reproducible report through [GitHub Issues](https://github.com/shineAcZ/vidnote-ai/issues).

## Development

The project has no production dependencies. Running tests requires Node.js 18 or later.

```bash
git clone git@github.com:shineAcZ/vidnote-ai.git
cd vidnote-ai
```

Run the Chromium smoke test:

```bash
cd chromium
npm test
```

Run the Firefox smoke test:

```bash
cd firefox
npm test
```

Project structure:

```text
.
├─ chromium/          Chrome and Edge extension
├─ firefox/           Firefox extension
├─ docs/              Maintenance and publishing documentation
├─ PRIVACY.md         Privacy policy
├─ LICENSE            MIT License
├─ README.en.md       English README
└─ README.md          Simplified Chinese README
```

See [`docs/STORE_SUBMISSION.md`](docs/STORE_SUBMISSION.md) for extension-store packaging, review, and publishing notes.

## Contributing and feedback

Bug reports, compatibility feedback, documentation improvements, and feature suggestions are welcome.

When opening an issue, please include whenever possible:

- Browser name and version.
- VidNote AI version.
- Video platform and subtitle type.
- A publicly accessible test video URL.
- Clear reproduction steps.
- Redacted error details and screenshots.

Do not submit API keys, cookies, account credentials, or full copyrighted transcripts. When processing video content with this project, follow the video platform's rules and applicable copyright requirements.

## Disclaimer

VidNote AI is an independent open-source project and is not officially affiliated with or endorsed by Bilibili, YouTube, Google, Microsoft, Mozilla, DeepSeek, OpenAI, Obsidian, or the developers of Media Extended. All related names and trademarks belong to their respective owners.

## License

This project is open source under the [MIT License](LICENSE).
