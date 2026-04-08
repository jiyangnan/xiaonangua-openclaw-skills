import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, tryConnectExisting, findExistingChromeDebugPort, getPageSession, waitForNewTab, clickElement, typeText, evaluate, sleep, type ChromeSession, type CdpConnection } from './cdp.ts';

const WECHAT_URL = 'https://mp.weixin.qq.com/';

interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
}

interface ArticleOptions {
  title: string;
  content?: string;
  htmlFile?: string;
  markdownFile?: string;
  theme?: string;
  author?: string;
  summary?: string;
  images?: string[];
  contentImages?: ImageInfo[];
  submit?: boolean;
  profileDir?: string;
  cdpPort?: number;
  noTailboard?: boolean;
}

async function waitForLogin(session: ChromeSession, timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await evaluate<string>(session, 'window.location.href');
    if (url.includes('/cgi-bin/home')) return true;
    await sleep(2000);
  }
  return false;
}

async function waitForElement(session: ChromeSession, selector: string, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evaluate<boolean>(session, `!!document.querySelector('${selector}')`);
    if (found) return true;
    await sleep(500);
  }
  return false;
}

async function clickMenuByText(session: ChromeSession, text: string): Promise<void> {
  console.log(`[wechat] Clicking "${text}" menu...`);
  const posResult = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const items = document.querySelectorAll('.new-creation__menu .new-creation__menu-item');
        for (const item of items) {
          const title = item.querySelector('.new-creation__menu-title');
          if (title && title.textContent?.trim() === '${text}') {
            item.scrollIntoView({ block: 'center' });
            const rect = item.getBoundingClientRect();
            return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
          }
        }
        return 'null';
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  if (posResult.result.value === 'null') throw new Error(`Menu "${text}" not found`);
  const pos = JSON.parse(posResult.result.value);

  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  await sleep(100);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
}

async function copyImageToClipboard(imagePath: string): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const copyScript = path.join(__dirname, './copy-to-clipboard.ts');
  // Avoid `npx bun` here: npm/npx cache may break with ENOTEMPTY on some machines.
  // Use the installed `bun` directly.
  const result = spawnSync('bun', [copyScript, 'image', imagePath], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Failed to copy image: ${imagePath}`);
}

async function pasteInEditor(session: ChromeSession): Promise<void> {
  const modifiers = process.platform === 'darwin' ? 4 : 2;
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId: session.sessionId });
}

async function sendCopy(cdp?: CdpConnection, sessionId?: string): Promise<void> {
  if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
  } else if (process.platform === 'linux') {
    spawnSync('xdotool', ['key', 'ctrl+c']);
  } else if (cdp && sessionId) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', modifiers: 2, windowsVirtualKeyCode: 67 }, { sessionId });
    await sleep(50);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', modifiers: 2, windowsVirtualKeyCode: 67 }, { sessionId });
  }
}

async function sendPaste(cdp?: CdpConnection, sessionId?: string): Promise<void> {
  // On WeChat editor, macOS CDP key events are flaky for clipboard paste.
  // Prefer osascript (requires Accessibility permission for the running Terminal/Node).
  if (process.platform === 'darwin') {
    // Ensure Chrome is frontmost, otherwise Cmd+V may go to the wrong app.
    spawnSync('osascript', ['-e', 'tell application "Google Chrome" to activate']);
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
    return;
  }

  if (cdp && sessionId) {
    const modifiers = 2;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId });
    await sleep(50);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId });
  } else if (process.platform === 'linux') {
    spawnSync('xdotool', ['key', 'ctrl+v']);
  }
}

function transformWechatHtml(html: string): string {
  let out = html;

  // 1) Insert visible text placeholders BEFORE placeholder <img> tags.
  // WeChat strips <img> tags during paste, but keeps text.
  out = out.replace(
    /<img\s+[^>]*\ssrc=["'](MDTOHTMLIMGPH_\d+)["'][^>]*>/gi,
    (m, ph) => {
      const marker = `<p class="p" style="text-align:center; color:#999; font-size: 14px;">${ph}</p>`;
      return marker + m;
    }
  );

  // 2) Force "Mac terminal" code blocks with header dots (inline styles).
  const termWrapStyle = 'border:1px solid #111827;border-radius:12px;overflow:hidden;margin:16px 0;background:#0b1020;';
  const termHeaderStyle = 'background:#0b1020;padding:10px 12px;display:flex;align-items:center;gap:8px;';
  const dots = '<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#ff5f56;"></span>' +
    '<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#ffbd2e;"></span>' +
    '<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#27c93f;"></span>';

  const preStyle = 'background:#0b1020;color:#E5E7EB;padding:14px 16px;margin:0;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:13px;line-height:1.6;';

  out = out.replace(/<pre(\s[^>]*)?>([\s\S]*?)<\/pre>/gi, (m, attrs = '', inner = '') => {
    // Idempotency: if already wrapped, keep.
    if (m.includes('<!--WECHAT_TERM_WRAPPED-->') || m.includes('WECHAT_TERM_WRAPPED')) return m;

    let preOpen = '';
    if (/\sstyle=/.test(attrs)) {
      preOpen = `<pre${attrs.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => ` style="${existing};${preStyle}"`)}>`;
    } else {
      preOpen = `<pre${attrs} style="${preStyle}">`;
    }

    const header = `<div style="${termHeaderStyle}">${dots}</div>`;
    return `<div style="${termWrapStyle}">${header}${preOpen}<!--WECHAT_TERM_WRAPPED-->${inner}</pre></div>`;
  });

  // Ensure code text inherits light color (WeChat sometimes resets it)
  out = out.replace(/<code([^>]*)style=["']([^"']*)["']/gi, (m, a1, css) => {
    if (/color\s*:/i.test(css)) return m;
    return `<code${a1}style="color:#E5E7EB; ${css}"`;
  });

  // 3) Red theme accents
  const h2Style = 'background:#ef4444;color:#ffffff;padding:6px 10px;border-radius:8px;display:inline-block;font-weight:700;margin:18px 0 10px;';
  out = out.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (_m2, a2 = '', inner2 = '') => {
    if (/\sstyle=/.test(a2)) {
      return `<h2${a2.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => ` style="${existing};${h2Style}"`)}>${inner2}</h2>`;
    }
    return `<h2${a2} style="${h2Style}">${inner2}</h2>`;
  });

  const h3Style = 'border-left:4px solid #ef4444;padding-left:10px;margin:16px 0 8px;font-weight:700;';
  out = out.replace(/<h3(\s[^>]*)?>([\s\S]*?)<\/h3>/gi, (_m3, a3 = '', inner3 = '') => {
    if (/\sstyle=/.test(a3)) {
      return `<h3${a3.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => ` style="${existing};${h3Style}"`)}>${inner3}</h3>`;
    }
    return `<h3${a3} style="${h3Style}">${inner3}</h3>`;
  });

  const bqStyle = 'border-left:4px solid #ef4444;background:#fff1f2;padding:10px 12px;margin:12px 0;border-radius:8px;';
  out = out.replace(/<blockquote(\s[^>]*)?>/gi, (_m4, a4 = '') => {
    if (/\sstyle=/.test(a4)) {
      return `<blockquote${a4.replace(/\sstyle=["']([^"']*)["']/, (_s, existing) => ` style="${existing};${bqStyle}"`)}>`;
    }
    return `<blockquote${a4} style="${bqStyle}">`;
  });

  out = out.replace(/<strong>/gi, '<strong style="color:#b91c1c;">');

  return out;
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

function tailboardMarkdownToHtml(md: string): string {
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

    const imgMatch = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      const src = imgMatch[1]!.trim();
      html.push(`<p style="text-align:center;margin:14px 0;"><img src="${src}" style="max-width:100%;border-radius:10px;" /></p>`);
      i++;
      continue;
    }

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

function extractWechatHtmlFromFile(htmlFilePath: string, opts?: { noTailboard?: boolean; frontmatter?: Record<string, string> }): string {
  const absolutePath = path.isAbsolute(htmlFilePath) ? htmlFilePath : path.resolve(process.cwd(), htmlFilePath);
  let htmlContent = fs.readFileSync(absolutePath, 'utf-8');

  // Most of our converted HTML wraps real content inside <div id="output">...</div>
  const match = htmlContent.match(/<div id="output">([\s\S]*?)<\/div>/);
  if (match) htmlContent = match[1]!;

  const skipTail = !!opts?.noTailboard || (opts?.frontmatter ? shouldSkipTailboard(opts.frontmatter) : false);
  if (!skipTail) {
    const tailMd = loadTailboardMarkdown();
    if (tailMd.trim()) {
      htmlContent = `${htmlContent}\n<hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;"/>\n${tailboardMarkdownToHtml(tailMd)}`;
    }
  }

  return transformWechatHtml(htmlContent);
}

async function copyHtmlFromBrowser(
  cdp: CdpConnection,
  htmlFilePath: string,
  opts?: { noTailboard?: boolean; frontmatter?: Record<string, string> }
): Promise<void> {
  // Read HTML file and prepare for clipboard copy
  const htmlContent = extractWechatHtmlFromFile(htmlFilePath, opts);

  // Create a simple HTML file for clipboard
  const tempHtml = `/tmp/wechat-publish-${Date.now()}.html`;
  fs.writeFileSync(tempHtml, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${htmlContent}</body></html>`, 'utf-8');

  const fileUrl = `file://${tempHtml}`;
  console.log(`[wechat] Opening HTML file in new tab: ${fileUrl}`);

  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: fileUrl });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await sleep(3000);

  console.log('[wechat] Selecting content...');
  await cdp.send<{ result: { value: unknown } }>('Runtime.evaluate', {
    expression: `
      (function() {
        document.body.style.fontSize = '16px';
        const range = document.createRange();
        range.selectNodeContents(document.body);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      })()
    `,
    returnByValue: true,
  }, { sessionId });
  await sleep(1000);

  console.log('[wechat] Copying content...');
  await sendCopy(cdp, sessionId);
  await sleep(2000);

  console.log('[wechat] Closing HTML tab...');
  await cdp.send('Target.closeTarget', { targetId });
  await sleep(1000);
}

async function injectHtmlDirectly(session: ChromeSession): Promise<void> {
  console.log('[wechat] Injecting HTML directly into editor...');
  
  // Wait a bit
  await sleep(2000);
  
  // Try to inject HTML directly into the editor
  const result = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
    expression: `
      (function() {
        // Try multiple ways to find and inject into editor
        let editor = null;
        
        // Method 1: Look in iframes (WeChat editor is in an iframe)
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            editor = doc.querySelector('#ueditor_0') || doc.querySelector('.edit_area') || doc.querySelector('.weui-desktop-editor__content') || doc.querySelector('[contenteditable="true"]');
            if (editor) {
              // Inject HTML
              if (window.__wechatHtmlContent__) {
                editor.innerHTML = window.__wechatHtmlContent__;
                return 'injected_in_iframe';
              }
            }
          } catch(e) {
            // Cross-origin, try next
          }
        }
        
        // Method 2: Direct selectors
        editor = document.querySelector('#ueditor_0') || document.querySelector('.edit_area') || document.querySelector('.weui-desktop-editor__content');
        if (editor && window.__wechatHtmlContent__) {
          editor.innerHTML = window.__wechatHtmlContent__;
          return 'injected_direct';
        }
        
        // Method 3: Try execCommand
        if (window.__wechatHtmlContent__) {
          document.execCommand('insertHTML', false, window.__wechatHtmlContent__);
          return 'injected_execCommand';
        }
        
        return 'not_found';
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });
  
  console.log('[wechat] Injection result:', result.result?.value);
  
  await sleep(2000);
}

async function pasteFromClipboardInEditor(session: ChromeSession): Promise<void> {
  console.log('[wechat] Pasting content...');
  
  // Wait before pasting to avoid "process running" error
  await sleep(2000);
  
  await sendPaste(session.cdp, session.sessionId);
  
  // Wait after pasting
  await sleep(3000);
  
  // Check if paste was successful by looking for errors
  const errorCheck = await session.cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
    expression: `
      !!document.querySelector('.weui-desktop-toast, .wx-warning, [class*="toast"][class*="error"])
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });
  
  if (errorCheck.result?.value) {
    console.log('[wechat] Warning detected, retrying...');
    await sleep(3000);
    await sendPaste(session.cdp, session.sessionId);
    await sleep(3000);
  }
  
  console.log('[wechat] Paste completed');
}

async function parseMarkdownWithPlaceholders(markdownPath: string, theme?: string): Promise<{ title: string; author: string; summary: string; htmlPath: string; contentImages: ImageInfo[] }> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const mdToWechatScript = path.join(__dirname, 'md-to-wechat.ts');
  const args = [mdToWechatScript, markdownPath];
  if (theme) args.push('--theme', theme);

  // Avoid `npx bun` ENOTEMPTY races: use bun directly
  const result = spawnSync('bun', args, { stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`Failed to parse markdown: ${stderr}`);
  }

  const output = result.stdout.toString();
  return JSON.parse(output);
}

function parseHtmlMeta(htmlPath: string): { title: string; author: string; summary: string; contentImages: ImageInfo[] } {
  const content = fs.readFileSync(htmlPath, 'utf-8');

  let title = '';
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1]!;

  let author = '';
  const authorMatch = content.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
    || content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']author["']/i);
  if (authorMatch) author = authorMatch[1]!;

  let summary = '';
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    || content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (descMatch) summary = descMatch[1]!;

  if (!summary) {
    const firstPMatch = content.match(/<p[^>]*>([^<]+)<\/p>/i);
    if (firstPMatch) {
      const text = firstPMatch[1]!.replace(/<[^>]+>/g, '').trim();
      if (text.length > 20) {
        summary = text.length > 120 ? text.slice(0, 117) + '...' : text;
      }
    }
  }

  const mdPath = htmlPath.replace(/\.html$/i, '.md');
  if (fs.existsSync(mdPath)) {
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    const fmMatch = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const lines = fmMatch[1]!.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let value = line.slice(colonIdx + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (key === 'title' && !title) title = value;
          if (key === 'author' && !author) author = value;
          if ((key === 'description' || key === 'summary') && !summary) summary = value;
        }
      }
    }
  }

  const contentImages: ImageInfo[] = [];
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const matches = [...content.matchAll(imgRegex)];
  for (const match of matches) {
    const [fullTag, src] = match;
    if (!src || src.startsWith('http')) continue;
    const localPathMatch = fullTag.match(/data-local-path=["']([^"']+)["']/);
    if (localPathMatch) {
      contentImages.push({
        placeholder: src,
        localPath: localPathMatch[1]!,
        originalPath: src,
      });
    }
  }

  return { title, author, summary, contentImages };
}

async function selectAndReplacePlaceholder(session: ChromeSession, placeholder: string): Promise<boolean> {
  const result = await session.cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const editor = document.querySelector('.ProseMirror');
        if (!editor) return false;

        const placeholder = ${JSON.stringify(placeholder)};
        const sel = window.getSelection();
        if (!sel) return false;

        // Prefer matching <img src="PLACEHOLDER"> (markdown-to-html uses this)
        const img = editor.querySelector('img[src="' + placeholder.replaceAll('"','\\"') + '"]');
        if (img) {
          img.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const range = document.createRange();
          range.selectNode(img);
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }

        // Fallback: placeholder as text node
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          let searchStart = 0;
          let idx;
          // Search for exact match (not prefix of longer placeholder like XIMGPH_1 in XIMGPH_10)
          while ((idx = text.indexOf(placeholder, searchStart)) !== -1) {
            const afterIdx = idx + placeholder.length;
            const charAfter = text[afterIdx];
            // Exact match if next char is not a digit
            if (charAfter === undefined || !/\\d/.test(charAfter)) {
              node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });

              const range = document.createRange();
              range.setStart(node, idx);
              range.setEnd(node, idx + placeholder.length);
              sel.removeAllRanges();
              sel.addRange(range);
              return true;
            }
            searchStart = afterIdx;
          }
        }
        return false;
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  return result.result.value;
}

async function pressDeleteKey(session: ChromeSession): Promise<void> {
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
}

async function placeCursorAfterText(session: ChromeSession, snippet: string): Promise<boolean> {
  const result = await session.cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
    expression: `
      (function(){
        const editor=document.querySelector('.ProseMirror');
        if(!editor) return false;
        const snippet=${JSON.stringify(snippet)};
        const walker=document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while((node=walker.nextNode())){
          const t=(node.textContent||'');
          const idx=t.indexOf(snippet);
          if(idx!==-1){
            const range=document.createRange();
            range.setStart(node, idx + snippet.length);
            range.collapse(true);
            const sel=window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            node.parentElement?.scrollIntoView({block:'center'});
            return true;
          }
        }
        return false;
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });
  return result.result.value;
}

async function removeExtraEmptyLineAfterImage(session: ChromeSession): Promise<boolean> {
  const removed = await evaluate<boolean>(session, `
    (function() {
      const editor = document.querySelector('.ProseMirror');
      if (!editor) return false;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;

      let node = sel.anchorNode;
      if (!node) return false;
      let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!element || !editor.contains(element)) return false;

      const isEmptyParagraph = (el) => {
        if (!el || el.tagName !== 'P') return false;
        const text = (el.textContent || '').trim();
        if (text.length > 0) return false;
        return el.querySelectorAll('img, figure, video, iframe').length === 0;
      };

      const hasImage = (el) => {
        if (!el) return false;
        return !!el.querySelector('img, figure img, picture img');
      };

      const placeCursorAfter = (el) => {
        if (!el) return;
        const range = document.createRange();
        range.setStartAfter(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      };

      // Case 1: caret is inside an empty paragraph right after an image block.
      const emptyPara = element.closest('p');
      if (emptyPara && editor.contains(emptyPara) && isEmptyParagraph(emptyPara)) {
        const prev = emptyPara.previousElementSibling;
        if (prev && hasImage(prev)) {
          emptyPara.remove();
          placeCursorAfter(prev);
          return true;
        }
      }

      // Case 2: caret is on the image block itself; remove the next empty paragraph.
      const imageBlock = element.closest('figure, p');
      if (imageBlock && editor.contains(imageBlock) && hasImage(imageBlock)) {
        const next = imageBlock.nextElementSibling;
        if (next && isEmptyParagraph(next)) {
          next.remove();
          placeCursorAfter(imageBlock);
          return true;
        }
      }

      return false;
    })()
  `);

  if (removed) console.log('[wechat] Removed extra empty line after image.');
  return removed;
}

export async function postArticle(options: ArticleOptions): Promise<void> {
  const { title, content, htmlFile, markdownFile, theme, author, summary, images = [], submit = false, profileDir, cdpPort } = options;
  let { contentImages = [] } = options;
  let frontmatter: Record<string, string> = {};
  let effectiveTitle = title || '';
  let effectiveAuthor = author || '';
  let effectiveSummary = summary || '';
  let effectiveHtmlFile = htmlFile;

  if (markdownFile) {
    console.log(`[wechat] Parsing markdown: ${markdownFile}`);
    const parsed = await parseMarkdownWithPlaceholders(markdownFile, theme);
    effectiveTitle = effectiveTitle || parsed.title;
    effectiveAuthor = effectiveAuthor || parsed.author;
    effectiveSummary = effectiveSummary || parsed.summary;
    effectiveHtmlFile = parsed.htmlPath;
    contentImages = parsed.contentImages;

    // Best-effort: read original markdown frontmatter for tailboard toggles
    try {
      const mdContent = fs.readFileSync(markdownFile, 'utf-8');
      const fm = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fm) {
        for (const line of fm[1]!.split('\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
            frontmatter[k] = v;
          }
        }
      }
    } catch {}

    console.log(`[wechat] Title: ${effectiveTitle || '(empty)'}`);
    console.log(`[wechat] Author: ${effectiveAuthor || '(empty)'}`);
    console.log(`[wechat] Summary: ${effectiveSummary || '(empty)'}`);
    console.log(`[wechat] Found ${contentImages.length} images to insert`);
  } else if (htmlFile && fs.existsSync(htmlFile)) {
    console.log(`[wechat] Parsing HTML: ${htmlFile}`);
    const meta = parseHtmlMeta(htmlFile);
    effectiveTitle = effectiveTitle || meta.title;
    effectiveAuthor = effectiveAuthor || meta.author;
    effectiveSummary = effectiveSummary || meta.summary;
    effectiveHtmlFile = htmlFile;
    if (meta.contentImages.length > 0) {
      contentImages = meta.contentImages;
    }

    // Read sibling markdown frontmatter if exists (for no-tail switches)
    try {
      const mdPath = htmlFile.replace(/\.html$/i, '.md');
      if (fs.existsSync(mdPath)) {
        const mdContent = fs.readFileSync(mdPath, 'utf-8');
        const fm = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fm) {
          for (const line of fm[1]!.split('\n')) {
            const idx = line.indexOf(':');
            if (idx > 0) {
              const k = line.slice(0, idx).trim();
              const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
              frontmatter[k] = v;
            }
          }
        }
      }
    } catch {}

    console.log(`[wechat] Title: ${effectiveTitle || '(empty)'}`);
    console.log(`[wechat] Author: ${effectiveAuthor || '(empty)'}`);
    console.log(`[wechat] Summary: ${effectiveSummary || '(empty)'}`);
    console.log(`[wechat] Found ${contentImages.length} images to insert`);
  }

  if (effectiveTitle && effectiveTitle.length > 64) throw new Error(`Title too long: ${effectiveTitle.length} chars (max 64)`);
  if (!content && !effectiveHtmlFile) throw new Error('Either --content, --html, or --markdown is required');

  let cdp: CdpConnection;
  let chrome: ReturnType<typeof import('node:child_process').spawn> | null = null;

  // Try connecting to existing Chrome: explicit port > auto-detect > launch new
  const portToTry = cdpPort ?? await findExistingChromeDebugPort();
  if (portToTry) {
    const existing = await tryConnectExisting(portToTry);
    if (existing) {
      console.log(`[cdp] Connected to existing Chrome on port ${portToTry}`);
      cdp = existing;
    } else {
      console.log(`[cdp] Port ${portToTry} not available, launching new Chrome...`);
      const launched = await launchChrome(WECHAT_URL, profileDir);
      cdp = launched.cdp;
      chrome = launched.chrome;
    }
  } else {
    const launched = await launchChrome(WECHAT_URL, profileDir);
    cdp = launched.cdp;
    chrome = launched.chrome;
  }

  try {
    console.log('[wechat] Waiting for page load...');
    await sleep(3000);

    let session: ChromeSession;
    if (!chrome) {
      // Reusing existing Chrome: find an already-logged-in tab (has token in URL)
      const allTargets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
      const loggedInTab = allTargets.targetInfos.find(t => t.type === 'page' && t.url.includes('mp.weixin.qq.com') && t.url.includes('token='));
      const wechatTab = loggedInTab || allTargets.targetInfos.find(t => t.type === 'page' && t.url.includes('mp.weixin.qq.com'));

      if (wechatTab) {
        console.log(`[wechat] Reusing existing tab: ${wechatTab.url.substring(0, 80)}...`);
        const { sessionId: reuseSid } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: wechatTab.targetId, flatten: true });
        await cdp.send('Page.enable', {}, { sessionId: reuseSid });
        await cdp.send('Runtime.enable', {}, { sessionId: reuseSid });
        await cdp.send('DOM.enable', {}, { sessionId: reuseSid });
        session = { cdp, sessionId: reuseSid, targetId: wechatTab.targetId };

        // Navigate to home if not already there
        const currentUrl = await evaluate<string>(session, 'window.location.href');
        if (!currentUrl.includes('/cgi-bin/home')) {
          console.log('[wechat] Navigating to home...');
          await evaluate(session, `window.location.href = '${WECHAT_URL}cgi-bin/home?t=home/index'`);
          await sleep(5000);
        }
      } else {
        // No WeChat tab found, create one
        console.log('[wechat] No WeChat tab found, opening...');
        await cdp.send('Target.createTarget', { url: WECHAT_URL });
        await sleep(5000);
        session = await getPageSession(cdp, 'mp.weixin.qq.com');
      }
    } else {
      session = await getPageSession(cdp, 'mp.weixin.qq.com');
    }

    const url = await evaluate<string>(session, 'window.location.href');
    if (!url.includes('/cgi-bin/')) {
      console.log('[wechat] Not logged in. Please scan QR code...');
      const loggedIn = await waitForLogin(session);
      if (!loggedIn) throw new Error('Login timeout');
    }
    console.log('[wechat] Logged in.');
    await sleep(2000);

    // If we're already on the editor page, skip home menu flow.
    const currentUrl2 = await evaluate<string>(session, 'window.location.href');
    const alreadyInEditor = currentUrl2.includes('appmsg_edit') || await evaluate<boolean>(session, `!!document.querySelector('#title') && !!document.querySelector('.ProseMirror')`);

    if (!alreadyInEditor) {
      // Wait for menu to be ready (retry once with page reload if needed)
      let menuReady = await waitForElement(session, '.new-creation__menu', 30_000);
      if (!menuReady) {
        console.log('[wechat] Menu not found. Trying to reuse an existing editor tab...');

        // Prefer reusing an already-open editor tab (more reliable than opening direct URL)
        try {
          const editorSession = await getPageSession(cdp, 'appmsg_edit');
          if (editorSession) {
            session = editorSession;
            console.log('[wechat] Reusing existing editor tab (appmsg_edit).');
          }
        } catch (e) {
          // ignore
        }

        // If still not in editor, then open direct editor URL as fallback
        if (!(await evaluate<boolean>(session, `!!document.querySelector('#title') && !!document.querySelector('.ProseMirror')`))) {
          console.log('[wechat] No usable editor tab found. Opening editor URL...');

          const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
          const initialIds = new Set(targets.targetInfos.map(t => t.targetId));

          const editorUrl = `${WECHAT_URL}cgi-bin/appmsg?t=media/appmsg_edit&action=edit&isNew=1&lang=zh_CN`;
          await cdp.send('Target.createTarget', { url: editorUrl });
          await sleep(4000);

          const editorTargetId = await waitForNewTab(cdp, initialIds, 'mp.weixin.qq.com');
          console.log('[wechat] Editor tab opened (direct URL).');

          const { sessionId: editorSessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: editorTargetId, flatten: true });
          session = { cdp, sessionId: editorSessionId, targetId: editorTargetId };

          await cdp.send('Page.enable', {}, { sessionId: editorSessionId });
          await cdp.send('Runtime.enable', {}, { sessionId: editorSessionId });
          await cdp.send('DOM.enable', {}, { sessionId: editorSessionId });

          await sleep(8000);
        }
      } else {
        const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
        const initialIds = new Set(targets.targetInfos.map(t => t.targetId));

        await clickMenuByText(session, '文章');
        await sleep(3000);

        const editorTargetId = await waitForNewTab(cdp, initialIds, 'mp.weixin.qq.com');
        console.log('[wechat] Editor tab opened.');

        const { sessionId: editorSessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: editorTargetId, flatten: true });
        session = { cdp, sessionId: editorSessionId, targetId: editorTargetId };

        await cdp.send('Page.enable', {}, { sessionId: editorSessionId });
        await cdp.send('Runtime.enable', {}, { sessionId: editorSessionId });
        await cdp.send('DOM.enable', {}, { sessionId: editorSessionId });

        await sleep(8000);
      }

      await sleep(3000);
    } else {
      console.log('[wechat] Already in editor; skipping home menu flow.');
    }

    await cdp.send('Page.enable', {}, { sessionId: session.sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId: session.sessionId });
    await cdp.send('DOM.enable', {}, { sessionId: session.sessionId });

    await sleep(3000);

    // Ensure editor DOM is ready (WeChat sometimes loads editor asynchronously)
    const titleReady = await waitForElement(session, '#title', 30_000);
    let editorReady = await waitForElement(session, '.ProseMirror', 30_000);
    if (!titleReady || !editorReady) {
      console.warn('[wechat] Editor not ready, reloading editor once...');
      await evaluate(session, `window.location.reload()`);
      await sleep(8000);
      await waitForElement(session, '#title', 30_000);
      editorReady = await waitForElement(session, '.ProseMirror', 30_000);
    }
    if (!editorReady) throw new Error('Editor did not load (.ProseMirror missing)');

    if (effectiveTitle) {
      console.log('[wechat] Filling title...');
      await evaluate(session, `document.querySelector('#title').value = ${JSON.stringify(effectiveTitle)}; document.querySelector('#title').dispatchEvent(new Event('input', { bubbles: true }));`);
    }

    if (effectiveAuthor) {
      console.log('[wechat] Filling author...');
      await evaluate(session, `document.querySelector('#author').value = ${JSON.stringify(effectiveAuthor)}; document.querySelector('#author').dispatchEvent(new Event('input', { bubbles: true }));`);
    }

    await sleep(500);

    if (effectiveTitle) {
      const actualTitle = await evaluate<string>(session, `document.querySelector('#title')?.value || ''`);
      if (actualTitle === effectiveTitle) {
        console.log('[wechat] Title verified OK.');
      } else {
        console.warn(`[wechat] Title verification failed. Expected: "${effectiveTitle}", got: "${actualTitle}"`);
      }
    }

    console.log('[wechat] Clicking on editor...');
    await clickElement(session, '.ProseMirror');
    await sleep(600);

    console.log('[wechat] Ensuring editor focus...');
    await clickElement(session, '.ProseMirror');
    await sleep(400);

    // Force focus + caret into ProseMirror (avoid Cmd+V going to title/summary or nowhere)
    await evaluate(session, `(function(){
      const el = document.querySelector('.ProseMirror');
      if (!el) return false;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return true;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    })()`);
    await sleep(300);

    if (effectiveHtmlFile && fs.existsSync(effectiveHtmlFile)) {
      console.log(`[wechat] Copying HTML content from: ${effectiveHtmlFile}`);
      await copyHtmlFromBrowser(cdp, effectiveHtmlFile, { noTailboard: !!options.noTailboard, frontmatter });
      await sleep(2000);

      // Go back to editor tab and paste
      console.log('[wechat] Pasting into editor...');

      const tryPasteOnce = async () => {
        // Re-focus caret every time before paste
        await evaluate(session, `(function(){
          const el = document.querySelector('.ProseMirror');
          if (!el) return false;
          el.focus();
          const sel = window.getSelection();
          if (!sel) return true;
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        })()`);
        await sleep(200);
        await pasteFromClipboardInEditor(session);
        await sleep(4500);
        return await evaluate<number>(session, `(document.querySelector('.ProseMirror')?.innerText || '').trim().length`);
      };

      let len = await tryPasteOnce();
      if (len < 200) {
        console.warn(`[wechat] Body too short after paste (textLength=${len}). Retrying paste...`);
        await sleep(1500);
        len = await tryPasteOnce();
      }
      if (len < 200) {
        console.warn(`[wechat] Body still too short (textLength=${len}). Reloading editor then retrying once...`);
        await evaluate(session, `window.location.reload()`);
        await sleep(8000);
        // Ensure editor exists again
        await waitForElement(session, '.ProseMirror', 30_000);
        await clickElement(session, '.ProseMirror');
        await sleep(500);
        len = await tryPasteOnce();
      }

      if (len >= 200) {
        console.log(`[wechat] Body content verified OK. textLength=${len}`);
      } else {
        console.warn(`[wechat] Body content verification failed. textLength=${len}. Trying JS insertHTML fallback (no clipboard)...`);

        try {
          const fullHtml = fs.readFileSync(effectiveHtmlFile, 'utf-8');
          const m = fullHtml.match(/<section\s+class="container"[\s\S]*?<\/section>/i);
          const bodyHtml = (m ? m[0] : fullHtml).replace(/<script[\s\S]*?<\/script>/gi, '');

          await evaluate(session, `(function(){
            const el = document.querySelector('.ProseMirror');
            if (!el) return false;
            el.focus();
            // Clear existing content
            document.execCommand('selectAll');
            document.execCommand('delete');
            // Insert HTML
            return document.execCommand('insertHTML', false, ${JSON.stringify(bodyHtml)});
          })()`);
          await sleep(5000);
          len = await evaluate<number>(session, `(document.querySelector('.ProseMirror')?.innerText || '').trim().length`);
          console.log(`[wechat] Body textLength after insertHTML fallback=${len}`);
        } catch (e) {
          console.warn('[wechat] insertHTML fallback failed:', e);
        }
      }

      if (contentImages.length > 0) {
        console.log(`[wechat] Inserting ${contentImages.length} images...`);
        for (let i = 0; i < contentImages.length; i++) {
          const img = contentImages[i]!;
          console.log(`[wechat] [${i + 1}/${contentImages.length}] Processing: ${img.placeholder}`);

          let found = await selectAndReplacePlaceholder(session, img.placeholder);
          if (!found) {
            console.warn(`[wechat] Placeholder not found: ${img.placeholder} (will try anchor insertion)`);

            // WeChat sometimes strips <img> tags with placeholder src during paste.
            // As a fallback, insert images by anchoring near known surrounding text.
            if (img.originalPath.includes('openclaw-two-agents-notion-diagram')) {
              found = await placeCursorAfterText(session, '下面这张图你看懂了');
            } else if (img.originalPath.includes('小南瓜自拍照')) {
              found = await placeCursorAfterText(session, '我是小南瓜，下次再见');
            }

            if (!found) {
              console.warn(`[wechat] Anchor insertion failed for: ${img.originalPath}`);
              continue;
            }
          }

          await sleep(500);

          console.log(`[wechat] Copying image: ${path.basename(img.localPath)}`);
          await copyImageToClipboard(img.localPath);
          await sleep(300);

          if (!img.originalPath.includes('openclaw-two-agents-notion-diagram') && !img.originalPath.includes('小南瓜自拍照')) {
            // If we selected a placeholder node, delete it; for anchor insertion we skip delete.
            console.log('[wechat] Deleting placeholder with Backspace...');
            await pressDeleteKey(session);
            await sleep(200);
          }

          // Wait for image node to actually appear (WeChat may upload asynchronously)
          const countImgs = async () => await evaluate<number>(session, `document.querySelectorAll('.ProseMirror img, .ProseMirror figure img').length`);
          const imgCountBefore = await countImgs();

          const tryPasteImageOnce = async () => {
            // Re-focus caret before each paste
            await evaluate(session, `(function(){
              const el = document.querySelector('.ProseMirror');
              if (!el) return false;
              el.focus();
              return true;
            })()`);
            await sleep(200);
            await pasteFromClipboardInEditor(session);
          };

          console.log('[wechat] Pasting image...');
          await tryPasteImageOnce();

          // Wait until image count increases; if not, retry paste a few times
          let imgCountNow = imgCountBefore;
          for (let attempt = 0; attempt < 3; attempt++) {
            for (let t = 0; t < 10; t++) {
              await sleep(1500);
              imgCountNow = await countImgs();
              if (imgCountNow > imgCountBefore) break;
            }
            if (imgCountNow > imgCountBefore) break;
            console.warn(`[wechat] Image did not appear after paste (attempt ${attempt + 1}/3). Retrying...`);
            await tryPasteImageOnce();
          }

          console.log(`[wechat] Image count: ${imgCountBefore} -> ${imgCountNow}`);
          if (imgCountNow <= imgCountBefore) {
            console.warn('[wechat] Image still not visible after retries. Will continue, but draft may miss images.');
          }

          // Extra buffer for upload to settle before we mutate layout / save
          await sleep(3000);
          await removeExtraEmptyLineAfterImage(session);
        }
        // Verify images actually appeared in DOM before saving
        const finalImgCount = await evaluate<number>(session, `document.querySelectorAll('.ProseMirror img, .ProseMirror figure img').length`);
        console.log(`[wechat] Final image count in editor: ${finalImgCount}`);
        if (finalImgCount < contentImages.length) {
          throw new Error(`Image verification failed: expected >=${contentImages.length}, got ${finalImgCount}`);
        }

        console.log('[wechat] All images inserted.');
      }
    } else if (content) {
      for (const img of images) {
        if (fs.existsSync(img)) {
          console.log(`[wechat] Pasting image: ${img}`);
          await copyImageToClipboard(img);
          await sleep(500);
          await pasteInEditor(session);
          await sleep(2000);
          await removeExtraEmptyLineAfterImage(session);
        }
      }

      console.log('[wechat] Typing content...');
      await typeText(session, content);
      await sleep(1000);

      const editorHasContent = await evaluate<boolean>(session, `
        (function() {
          const editor = document.querySelector('.ProseMirror');
          if (!editor) return false;
          const text = editor.innerText?.trim() || '';
          return text.length > 0;
        })()
      `);
      if (editorHasContent) {
        console.log('[wechat] Body content verified OK.');
      } else {
        console.warn('[wechat] Body content verification failed: editor appears empty after typing.');
      }
    }

    if (effectiveSummary) {
      console.log(`[wechat] Filling summary (after content paste): ${effectiveSummary}`);
      await evaluate(session, `
        (function() {
          const el = document.querySelector('#js_description');
          if (!el) return;
          el.focus();
          el.select();
          el.value = ${JSON.stringify(effectiveSummary)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        })()
      `);
      await sleep(500);

      const actualSummary = await evaluate<string>(session, `document.querySelector('#js_description')?.value || ''`);
      if (actualSummary === effectiveSummary) {
        console.log('[wechat] Summary verified OK.');
      } else {
        console.warn(`[wechat] Summary verification failed. Expected: "${effectiveSummary}", got: "${actualSummary}"`);
      }
    }

    console.log('[wechat] Saving as draft...');
    await evaluate(session, `document.querySelector('#js_submit button').click()`);
    await sleep(3000);

    const saved = await evaluate<boolean>(session, `!!document.querySelector('.weui-desktop-toast')`);
    if (saved) {
      console.log('[wechat] Draft saved successfully!');
    } else {
      console.log('[wechat] Waiting for save confirmation...');
      await sleep(5000);
    }

    // Post-save verification (DOM read-back)
    const finalLen = await evaluate<number>(session, `(document.querySelector('.ProseMirror')?.innerText || '').trim().length`);
    console.log(`[wechat] Post-save body textLength=${finalLen}`);

    // If body is still suspiciously short, retry paste+save once.
    if (finalLen < 500) {
      console.warn('[wechat] Post-save verification failed (body too short). Retrying paste+save once...');
      await clickElement(session, '.ProseMirror');
      await sleep(500);
      await pasteFromClipboardInEditor(session);
      await sleep(6000);

      const retryLen = await evaluate<number>(session, `(document.querySelector('.ProseMirror')?.innerText || '').trim().length`);
      console.log(`[wechat] Body textLength after retry=${retryLen}`);

      console.log('[wechat] Saving as draft (retry)...');
      await evaluate(session, `document.querySelector('#js_submit button').click()`);
      await sleep(3000);
      await sleep(5000);

      const finalLen2 = await evaluate<number>(session, `(document.querySelector('.ProseMirror')?.innerText || '').trim().length`);
      console.log(`[wechat] Post-save body textLength after retry=${finalLen2}`);

      if (finalLen2 < 500) {
        throw new Error(`Post-save verification failed: body text too short (${finalLen2}). Likely paste did not reach editor.`);
      }
    }

    console.log('[wechat] Done. Browser window left open.');
  } finally {
    cdp.close();
  }
}

function printUsage(): never {
  console.log(`Post article to WeChat Official Account

Usage:
  npx -y bun wechat-article.ts [options]

Options:
  --title <text>     Article title (auto-extracted from markdown)
  --content <text>   Article content (use with --image)
  --html <path>      HTML file to paste (alternative to --content)
  --markdown <path>  Markdown file to convert and post (recommended)
  --theme <name>     Theme for markdown (default, grace, simple)
  --author <name>    Author name (default: 宝玉)
  --summary <text>   Article summary
  --image <path>     Content image, can repeat (only with --content)
  --submit           Save as draft
  --no-tail          Do not append 小南瓜尾板
  --profile <dir>    Chrome profile directory
  --cdp-port <port>  Connect to existing Chrome debug port instead of launching new instance

Examples:
  npx -y bun wechat-article.ts --markdown article.md
  npx -y bun wechat-article.ts --markdown article.md --theme grace --submit
  npx -y bun wechat-article.ts --title "标题" --content "内容" --image img.png
  npx -y bun wechat-article.ts --title "标题" --html article.html --submit

Markdown mode:
  Images in markdown are converted to placeholders. After pasting HTML,
  each placeholder is selected, scrolled into view, deleted, and replaced
  with the actual image via paste.
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  const images: string[] = [];
  let title: string | undefined;
  let content: string | undefined;
  let htmlFile: string | undefined;
  let markdownFile: string | undefined;
  let theme: string | undefined;
  let author: string | undefined;
  let summary: string | undefined;
  let submit = false;
  let profileDir: string | undefined;
  let cdpPort: number | undefined;
  let noTailboard = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--title' && args[i + 1]) title = args[++i];
    else if (arg === '--content' && args[i + 1]) content = args[++i];
    else if (arg === '--html' && args[i + 1]) htmlFile = args[++i];
    else if (arg === '--markdown' && args[i + 1]) markdownFile = args[++i];
    else if (arg === '--theme' && args[i + 1]) theme = args[++i];
    else if (arg === '--author' && args[i + 1]) author = args[++i];
    else if (arg === '--summary' && args[i + 1]) summary = args[++i];
    else if (arg === '--image' && args[i + 1]) images.push(args[++i]!);
    else if (arg === '--submit') submit = true;
    else if (arg === '--no-tail' || arg === '--no-tailboard') noTailboard = true;
    else if (arg === '--profile' && args[i + 1]) profileDir = args[++i];
    else if (arg === '--cdp-port' && args[i + 1]) cdpPort = parseInt(args[++i]!, 10);
  }

  if (!markdownFile && !htmlFile && !title) { console.error('Error: --title is required (or use --markdown/--html)'); process.exit(1); }
  if (!markdownFile && !htmlFile && !content) { console.error('Error: --content, --html, or --markdown is required'); process.exit(1); }

  await postArticle({ title: title || '', content, htmlFile, markdownFile, theme, author, summary, images, submit, profileDir, cdpPort, noTailboard });
}

await main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
