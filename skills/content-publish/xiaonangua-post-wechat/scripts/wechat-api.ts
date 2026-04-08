import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface WechatConfig {
  appId: string;
  appSecret: string;
}

interface AccessTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
}

interface UploadResponse {
  media_id: string;
  url: string;
  errcode?: number;
  errmsg?: string;
}

interface PublishResponse {
  media_id?: string;
  errcode?: number;
  errmsg?: string;
}

type ArticleType = "news" | "newspic";

interface ArticleOptions {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  thumbMediaId: string;
  articleType: ArticleType;
  imageMediaIds?: string[];
}

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const UPLOAD_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const DRAFT_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";

function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function loadConfig(): WechatConfig {
  const cwdEnvPath = path.join(process.cwd(), ".baoyu-skills", ".env");
  const homeEnvPath = path.join(os.homedir(), ".baoyu-skills", ".env");

  const cwdEnv = loadEnvFile(cwdEnvPath);
  const homeEnv = loadEnvFile(homeEnvPath);

  const appId = process.env.WECHAT_APP_ID || cwdEnv.WECHAT_APP_ID || homeEnv.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET || cwdEnv.WECHAT_APP_SECRET || homeEnv.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Missing WECHAT_APP_ID or WECHAT_APP_SECRET.\n" +
      "Set via environment variables or in .baoyu-skills/.env file."
    );
  }

  return { appId, appSecret };
}

async function fetchAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch access token: ${res.status}`);
  }
  const data = await res.json() as AccessTokenResponse;
  if (data.errcode) {
    throw new Error(`Access token error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.access_token) {
    throw new Error("No access_token in response");
  }
  return data.access_token;
}

async function uploadImage(
  imagePath: string,
  accessToken: string,
  baseDir?: string
): Promise<UploadResponse> {
  let fileBuffer: Buffer;
  let filename: string;
  let contentType: string;

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${imagePath}`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(`Remote image is empty: ${imagePath}`);
    }
    fileBuffer = Buffer.from(buffer);
    const urlPath = imagePath.split("?")[0];
    filename = path.basename(urlPath) || "image.jpg";
    contentType = response.headers.get("content-type") || "image/jpeg";
  } else {
    const resolvedPath = path.isAbsolute(imagePath)
      ? imagePath
      : path.resolve(baseDir || process.cwd(), imagePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Image not found: ${resolvedPath}`);
    }
    const stats = fs.statSync(resolvedPath);
    if (stats.size === 0) {
      throw new Error(`Local image is empty: ${resolvedPath}`);
    }
    fileBuffer = fs.readFileSync(resolvedPath);
    filename = path.basename(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    contentType = mimeTypes[ext] || "image/jpeg";
  }

  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="media"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    "",
    "",
  ].join("\r\n");
  const footer = `\r\n--${boundary}--\r\n`;

  const headerBuffer = Buffer.from(header, "utf-8");
  const footerBuffer = Buffer.from(footer, "utf-8");
  const body = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);

  const url = `${UPLOAD_URL}?access_token=${accessToken}&type=image`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json() as UploadResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Upload failed ${data.errcode}: ${data.errmsg}`);
  }

  if (data.url?.startsWith("http://")) {
    data.url = data.url.replace(/^http:\/\//i, "https://");
  }

  return data;
}

async function uploadImagesInHtml(
  html: string,
  accessToken: string,
  baseDir: string
): Promise<{ html: string; firstMediaId: string; allMediaIds: string[] }> {
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];

  if (matches.length === 0) {
    return { html, firstMediaId: "", allMediaIds: [] };
  }

  let firstMediaId = "";
  let updatedHtml = html;
  const allMediaIds: string[] = [];

  for (const match of matches) {
    const [fullTag, src] = match;
    if (!src) continue;

    if (src.startsWith("https://mmbiz.qpic.cn")) {
      if (!firstMediaId) {
        firstMediaId = src;
      }
      continue;
    }

    const localPathMatch = fullTag.match(/data-local-path=["']([^"']+)["']/);
    const imagePath = localPathMatch ? localPathMatch[1]! : src;

    console.error(`[wechat-api] Uploading image: ${imagePath}`);
    try {
      const resp = await uploadImage(imagePath, accessToken, baseDir);
      const newTag = fullTag
        .replace(/\ssrc=["'][^"']+["']/, ` src="${resp.url}"`)
        .replace(/\sdata-local-path=["'][^"']+["']/, "");
      updatedHtml = updatedHtml.replace(fullTag, newTag);
      allMediaIds.push(resp.media_id);
      if (!firstMediaId) {
        firstMediaId = resp.media_id;
      }
    } catch (err) {
      console.error(`[wechat-api] Failed to upload ${imagePath}:`, err);
    }
  }

  return { html: updatedHtml, firstMediaId, allMediaIds };
}

async function publishToDraft(
  options: ArticleOptions,
  accessToken: string
): Promise<PublishResponse> {
  const url = `${DRAFT_URL}?access_token=${accessToken}`;

  let article: Record<string, unknown>;

  if (options.articleType === "newspic") {
    if (!options.imageMediaIds || options.imageMediaIds.length === 0) {
      throw new Error("newspic requires at least one image");
    }
    article = {
      article_type: "newspic",
      title: options.title,
      content: options.content,
      need_open_comment: 1,
      only_fans_can_comment: 0,
      image_info: {
        image_list: options.imageMediaIds.map(id => ({ image_media_id: id })),
      },
    };
    if (options.author) article.author = options.author;
  } else {
    article = {
      article_type: "news",
      title: options.title,
      content: options.content,
      thumb_media_id: options.thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    };
    if (options.author) article.author = options.author;
    if (options.digest) article.digest = options.digest;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ articles: [article] }),
  });

  const data = await res.json() as PublishResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Publish failed ${data.errcode}: ${data.errmsg}`);
  }

  return data;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, string> = {};
  const lines = match[1]!.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2]! };
}

function renderMarkdownToHtml(markdownPath: string, theme: string = "default"): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const renderScript = path.join(__dirname, "md", "render.ts");
  const baseDir = path.dirname(markdownPath);

  console.error(`[wechat-api] Rendering markdown with theme: ${theme}`);
  const result = spawnSync("npx", ["-y", "bun", renderScript, markdownPath, "--theme", theme], {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: baseDir,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "";
    throw new Error(`Render failed: ${stderr}`);
  }

  const htmlPath = markdownPath.replace(/\.md$/i, ".html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not generated: ${htmlPath}`);
  }

  return htmlPath;
}

function extractHtmlContent(htmlPath: string): string {
  const html = fs.readFileSync(htmlPath, "utf-8");
  const match = html.match(/<div id="output">([\s\S]*?)<\/div>\s*<\/body>/);
  if (match) {
    return match[1]!.trim();
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1]!.trim() : html;
}

/**
 * WeChat editor/API content often strips <style>. To keep a consistent look,
 * force critical styles as inline styles.
 *
 * - Mac terminal-like code blocks
 * - Reasonable inline-code highlighting
 */
function tailboardMarkdownToHtml(md: string): string {
  // Very small markdown subset for our tailboard: blockquote, bold, links, images, line breaks.
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];

  const esc = (s: string) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const inline = (s: string) => {
    let out = esc(s);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#b91c1c;">$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;color:#111827;padding:1px 6px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace;font-size:0.95em;">$1</code>');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return out;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Image line: ![alt](url)
    const imgMatch = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      const src = imgMatch[1]!.trim();
      html.push(`<p style="text-align:center;margin:14px 0;"><img src="${src}" style="max-width:100%;border-radius:10px;" /></p>`);
      i++;
      continue;
    }

    // Blockquote group
    if (trimmed.startsWith(">")) {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        bqLines.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i++;
      }
      const content = bqLines.map(l => inline(l)).join('<br/>');
      html.push(`<blockquote style="border-left:4px solid #ef4444;background:#fff1f2;padding:10px 12px;margin:12px 0;border-radius:8px;">${content}</blockquote>`);
      continue;
    }

    if (!trimmed) {
      i++;
      continue;
    }

    html.push(`<p style="margin:10px 0;">${inline(line)}</p>`);
    i++;
  }

  return html.join("\n");
}

function applyWechatInlineStyles(html: string): string {
  let out = html;

  // 1) Code blocks: wrap <pre>...</pre> into a "Mac terminal" container with header dots.
  // WeChat strips <style> a lot, so everything must be inline.
  const termWrapStyle = [
    "border:1px solid #111827",
    "border-radius:12px",
    "overflow:hidden",
    "margin:16px 0",
    "background:#0b1020",
  ].join(";");

  const termHeaderStyle = [
    "background:#0b1020",
    "padding:10px 12px",
    "display:flex",
    "align-items:center",
    "gap:8px",
  ].join(";");

  const dot = (color: string) =>
    `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${color};"></span>`;

  const preStyle = [
    "background:#0b1020",
    "color:#E5E7EB",
    "padding:14px 16px",
    "margin:0",
    "overflow-x:auto",
    "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace",
    "font-size:13px",
    "line-height:1.6",
  ].join(";");

  out = out.replace(/<pre(\s[^>]*)?>([\s\S]*?)<\/pre>/gi, (_m, attrs = "", inner = "") => {
    // Idempotency: avoid double wrapping
    if (inner.includes("<!--WECHAT_TERM_WRAPPED-->")) return `<pre${attrs}>${inner}</pre>`;

    const header = `<div style="${termHeaderStyle}">${dot("#ff5f56")}${dot("#ffbd2e")}${dot("#27c93f")}</div>`;

    const hasStyle = /\sstyle=/.test(attrs);
    let preOpen = "";
    if (hasStyle) {
      preOpen = `<pre${attrs.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => {
        const merged = `${existing};${preStyle}`.replace(/;;+/g, ";");
        return ` style="${merged}"`;
      })}>`;
    } else {
      preOpen = `<pre${attrs || ""} style="${preStyle}">`;
    }

    // Put an HTML comment marker (won't render) for idempotency.
    return `<div style="${termWrapStyle}">${header}${preOpen}<!--WECHAT_TERM_WRAPPED-->${inner}</pre></div>`;
  });

  // 2) Red theme accents (inline)
  // WeChat tends to keep inline styles, so do it here.
  const h2Style = [
    "background:#ef4444",
    "color:#ffffff",
    "padding:6px 10px",
    "border-radius:8px",
    "display:inline-block",
    "font-weight:700",
    "margin:18px 0 10px",
  ].join(";");

  out = out.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (_m, attrs = "", inner = "") => {
    if (/\sstyle=/.test(attrs)) {
      return `<h2${attrs.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => {
        const merged = `${existing};${h2Style}`.replace(/;;+/g, ";");
        return ` style=\"${merged}\"`;
      })}>${inner}</h2>`;
    }
    return `<h2${attrs || ""} style=\"${h2Style}\">${inner}</h2>`;
  });

  // H3: red left border, like section callout
  const h3Style = [
    "border-left:4px solid #ef4444",
    "padding-left:10px",
    "margin:16px 0 8px",
    "font-weight:700",
  ].join(";");
  out = out.replace(/<h3(\s[^>]*)?>([\s\S]*?)<\/h3>/gi, (_m, attrs = "", inner = "") => {
    if (/\sstyle=/.test(attrs)) {
      return `<h3${attrs.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => {
        const merged = `${existing};${h3Style}`.replace(/;;+/g, ";");
        return ` style=\"${merged}\"`;
      })}>${inner}</h3>`;
    }
    return `<h3${attrs || ""} style=\"${h3Style}\">${inner}</h3>`;
  });

  // Blockquote: red border + light red bg
  const bqStyle = [
    "border-left:4px solid #ef4444",
    "background:#fff1f2",
    "padding:10px 12px",
    "margin:12px 0",
    "border-radius:8px",
  ].join(";");
  out = out.replace(/<blockquote(\s[^>]*)?>/gi, (m, attrs = "") => {
    if (/\sstyle=/.test(attrs)) {
      return `<blockquote${attrs.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => {
        const merged = `${existing};${bqStyle}`.replace(/;;+/g, ";");
        return ` style=\"${merged}\"`;
      })}>`;
    }
    return `<blockquote${attrs || ""} style=\"${bqStyle}\">`;
  });

  // Strong: subtle red emphasis
  out = out.replace(/<strong>/gi, '<strong style="color:#b91c1c;">');

  // 3) Inline code: <code>...</code> that is NOT inside a <pre>
  // (Best-effort heuristic: style code tags, but avoid double-styling code inside pre)
  const inlineCodeStyle = [
    "background:#f3f4f6",
    "color:#111827",
    "padding:1px 6px",
    "border-radius:6px",
    "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace",
    "font-size:0.95em",
  ].join(";");

  // Temporarily protect code blocks
  const blocks: string[] = [];
  out = out.replace(/<pre[\s\S]*?<\/pre>/gi, (block) => {
    blocks.push(block);
    return `__WECHAT_PRE_BLOCK_${blocks.length - 1}__`;
  });

  out = out.replace(/<code(\s[^>]*)?>/gi, (m, attrs = "") => {
    if (/\sstyle=/.test(attrs)) return `<code${attrs}>`;
    return `<code${attrs || ""} style="${inlineCodeStyle}">`;
  });

  // Restore code blocks
  out = out.replace(/__WECHAT_PRE_BLOCK_(\d+)__/g, (_m, idx) => blocks[Number(idx)]!);

  return out;
}

function printUsage(): never {
  console.log(`Publish article to WeChat Official Account draft using API

Usage:
  npx -y bun wechat-api.ts <file> [options]

Arguments:
  file                Markdown (.md) or HTML (.html) file

Options:
  --type <type>       Article type: news (文章, default) or newspic (图文)
  --title <title>     Override title
  --author <name>     Author name (max 16 chars)
  --summary <text>    Article summary/digest (max 128 chars)
  --theme <name>      Theme name for markdown (default, grace, simple). Default: default
  --cover <path>      Cover image path (local or URL)
  --dry-run           Parse and render only, don't publish
  --no-tail           Do not append 小南瓜尾板
  --help              Show this help

Frontmatter Fields (markdown):
  title               Article title
  author              Author name
  digest/summary      Article summary
  featureImage/coverImage/cover/image   Cover image path

Comments:
  Comments are enabled by default, open to all users.

Environment Variables:
  WECHAT_APP_ID       WeChat App ID
  WECHAT_APP_SECRET   WeChat App Secret

Config File Locations (in priority order):
  1. Environment variables
  2. <cwd>/.baoyu-skills/.env
  3. ~/.baoyu-skills/.env

Example:
  npx -y bun wechat-api.ts article.md
  npx -y bun wechat-api.ts article.md --theme grace --cover cover.png
  npx -y bun wechat-api.ts article.md --author "Author Name" --summary "Brief intro"
  npx -y bun wechat-api.ts article.html --title "My Article"
  npx -y bun wechat-api.ts images/ --type newspic --title "Photo Album"
  npx -y bun wechat-api.ts article.md --dry-run
`);
  process.exit(0);
}

interface CliArgs {
  filePath: string;
  isHtml: boolean;
  articleType: ArticleType;
  title?: string;
  author?: string;
  summary?: string;
  theme: string;
  cover?: string;
  dryRun: boolean;
  noTailboard: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  }

  const args: CliArgs = {
    filePath: "",
    isHtml: false,
    articleType: "news",
    theme: "default",
    dryRun: false,
    noTailboard: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--type" && argv[i + 1]) {
      const t = argv[++i]!.toLowerCase();
      if (t === "news" || t === "newspic") {
        args.articleType = t;
      }
    } else if (arg === "--title" && argv[i + 1]) {
      args.title = argv[++i];
    } else if (arg === "--author" && argv[i + 1]) {
      args.author = argv[++i];
    } else if (arg === "--summary" && argv[i + 1]) {
      args.summary = argv[++i];
    } else if (arg === "--theme" && argv[i + 1]) {
      args.theme = argv[++i]!;
    } else if (arg === "--cover" && argv[i + 1]) {
      args.cover = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--no-tail" || arg === "--no-tailboard") {
      args.noTailboard = true;
    } else if (arg.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      i++;
    } else if (!arg.startsWith("-")) {
      args.filePath = arg;
    }
  }

  if (!args.filePath) {
    console.error("Error: File path required");
    process.exit(1);
  }

  args.isHtml = args.filePath.toLowerCase().endsWith(".html");

  return args;
}

function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1]!;
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1]!.replace(/<[^>]+>/g, "").trim();
  return "";
}

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
}

function shouldSkipTailboard(frontmatter: Record<string, string>): boolean {
  return truthy(frontmatter.no_tail) || truthy(frontmatter.no_tailboard) || truthy(frontmatter.skip_tail) || truthy(frontmatter.skip_tailboard);
}

function loadTailboardMarkdown(): string {
  const p = "/Users/ferdinandji/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/公众号模板/小南瓜尾板.md";
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  } catch {}
  return "";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const filePath = path.resolve(args.filePath);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const baseDir = path.dirname(filePath);
  let title = args.title || "";
  let author = args.author || "";
  let digest = args.summary || "";
  let htmlPath: string;
  let htmlContent: string;
  let frontmatter: Record<string, string> = {};

  if (args.isHtml) {
    htmlPath = filePath;
    htmlContent = extractHtmlContent(htmlPath);
    const mdPath = filePath.replace(/\.html$/i, ".md");
    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, "utf-8");
      const parsed = parseFrontmatter(mdContent);
      frontmatter = parsed.frontmatter;
      if (!title && frontmatter.title) title = frontmatter.title;
      if (!author) author = frontmatter.author || "";
      if (!digest) digest = frontmatter.digest || frontmatter.summary || frontmatter.description || "";
    }
    if (!title) {
      title = extractHtmlTitle(fs.readFileSync(htmlPath, "utf-8"));
    }
    console.error(`[wechat-api] Using HTML file: ${htmlPath}`);
  } else {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.frontmatter;
    const body = parsed.body;

    title = title || frontmatter.title || "";
    if (!title) {
      const h1Match = body.match(/^#\s+(.+)$/m);
      if (h1Match) title = h1Match[1]!;
    }
    if (!author) author = frontmatter.author || "";
    if (!digest) digest = frontmatter.digest || frontmatter.summary || frontmatter.description || "";

    console.error(`[wechat-api] Theme: ${args.theme}`);
    htmlPath = renderMarkdownToHtml(filePath, args.theme);
    console.error(`[wechat-api] HTML generated: ${htmlPath}`);
    htmlContent = extractHtmlContent(htmlPath);
  }

  // Tailboard: append by default; user can disable via CLI (--no-tail) or frontmatter.
  const skipTail = args.noTailboard || shouldSkipTailboard(frontmatter);
  if (!skipTail) {
    const tailMd = loadTailboardMarkdown();
    if (tailMd.trim()) {
      console.error('[wechat-api] Appending 小南瓜尾板...');
      htmlContent = `${htmlContent}\n<hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;"/>\n${tailboardMarkdownToHtml(tailMd)}`;
    }
  } else {
    console.error('[wechat-api] Tailboard disabled.');
  }

  if (!title) {
    console.error("Error: No title found. Provide via --title, frontmatter, or <title> tag.");
    process.exit(1);
  }

  console.error(`[wechat-api] Title: ${title}`);
  if (author) console.error(`[wechat-api] Author: ${author}`);
  if (digest) console.error(`[wechat-api] Digest: ${digest.slice(0, 50)}...`);
  console.error(`[wechat-api] Type: ${args.articleType}`);

  if (args.dryRun) {
    console.log(JSON.stringify({
      articleType: args.articleType,
      title,
      author: author || undefined,
      digest: digest || undefined,
      htmlPath,
      contentLength: htmlContent.length,
    }, null, 2));
    return;
  }

  const config = loadConfig();
  console.error("[wechat-api] Fetching access token...");
  const accessToken = await fetchAccessToken(config.appId, config.appSecret);

  // Ensure critical styles survive WeChat sanitization
  htmlContent = applyWechatInlineStyles(htmlContent);

  console.error("[wechat-api] Uploading images...");
  const { html: processedHtml, firstMediaId, allMediaIds } = await uploadImagesInHtml(
    htmlContent,
    accessToken,
    baseDir
  );
  htmlContent = processedHtml;

  let thumbMediaId = "";
  const coverPath = args.cover ||
    frontmatter.featureImage ||
    frontmatter.coverImage ||
    frontmatter.cover ||
    frontmatter.image;

  if (coverPath) {
    console.error(`[wechat-api] Uploading cover: ${coverPath}`);
    const coverResp = await uploadImage(coverPath, accessToken, baseDir);
    thumbMediaId = coverResp.media_id;
  } else if (firstMediaId) {
    if (firstMediaId.startsWith("https://")) {
      console.error(`[wechat-api] Uploading first image as cover: ${firstMediaId}`);
      const coverResp = await uploadImage(firstMediaId, accessToken, baseDir);
      thumbMediaId = coverResp.media_id;
    } else {
      thumbMediaId = firstMediaId;
    }
  }

  if (args.articleType === "news" && !thumbMediaId) {
    console.error("Error: No cover image. Provide via --cover, frontmatter.featureImage, or include an image in content.");
    process.exit(1);
  }

  if (args.articleType === "newspic" && allMediaIds.length === 0) {
    console.error("Error: newspic requires at least one image in content.");
    process.exit(1);
  }

  console.error("[wechat-api] Publishing to draft...");
  const result = await publishToDraft({
    title,
    author: author || undefined,
    digest: digest || undefined,
    content: htmlContent,
    thumbMediaId,
    articleType: args.articleType,
    imageMediaIds: args.articleType === "newspic" ? allMediaIds : undefined,
  }, accessToken);

  console.log(JSON.stringify({
    success: true,
    media_id: result.media_id,
    title,
    articleType: args.articleType,
  }, null, 2));

  console.error(`[wechat-api] Published successfully! media_id: ${result.media_id}`);
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
