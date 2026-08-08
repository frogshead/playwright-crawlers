"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const dotenv_1 = require("dotenv");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const reactions_db_1 = require("./reactions_db");
/**
 * For each job post that received a positive reaction, scrape the job posting
 * and the candidate's CV, generate a tailored application (resume + short cover
 * letter) as markdown, save it under ./data/resumes/, and post it back to the
 * Telegram channel.
 *
 * Tailoring uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise it
 * falls back to a structured draft that bundles the CV and job posting so the
 * work isn't lost.
 */
const CRAWLER_NAME = 'resume-generator';
const logger = (0, logger_1.createLogger)(CRAWLER_NAME);
const CV_URL = process.env.CV_URL || 'https://viitamäki.fi/cv_en.html';
const RESUME_DIR = process.env.NODE_ENV === 'production' ? './data/resumes' : './data/resumes';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const HEADLESS = true;
/** Fetch the visible text of a page using a headless browser (handles IDN, JS). */
async function fetchPageText(url) {
    const browser = await playwright_1.chromium.launch({ headless: HEADLESS });
    try {
        const page = await browser.newPage();
        await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        // Prefer the <main> content to drop site nav/footer boilerplate; fall back
        // to the full body if <main> is missing or suspiciously short.
        let text = '';
        const mainCount = await page.locator('main').count();
        if (mainCount > 0) {
            text = await page.locator('main').first().innerText().catch(() => '');
        }
        if (!text || text.trim().length < 200) {
            text = await page.locator('body').innerText();
        }
        return (text || '').replace(/\n{3,}/g, '\n\n').trim();
    }
    finally {
        await browser.close();
    }
}
/** Call the Anthropic Messages API via fetch (no SDK dependency). */
async function generateWithLLM(cvText, jobText, jobUrl) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        return null;
    const prompt = `You are helping a candidate apply for a job. Using the candidate's CV and the job posting below, write a tailored, one-page application as GitHub-flavored markdown.

Requirements:
- Match the language of the JOB POSTING (Finnish posting -> Finnish output, English -> English).
- Start with a short, specific cover letter (3-4 paragraphs) connecting the candidate's real experience to this role's requirements. Do NOT invent skills not present in the CV.
- Follow with a concise tailored resume: summary, most-relevant skills, and the most-relevant experience for THIS role.
- Be concrete, reference specifics from the posting, and keep it honest to the CV.

=== CANDIDATE CV ===
${cvText}

=== JOB POSTING (${jobUrl}) ===
${jobText}`;
    // fetch is a Node 18+ global but not in the ES2020 lib typings; access via globalThis.
    const fetchFn = globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        logger.error('global fetch not available (requires Node 18+)');
        return null;
    }
    try {
        const res = await fetchFn('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!res.ok) {
            logger.error('Anthropic API error', { status: res.status, body: await res.text() });
            return null;
        }
        const data = await res.json();
        const text = data?.content?.[0]?.text;
        return typeof text === 'string' ? text : null;
    }
    catch (error) {
        logger.error('Anthropic API call failed', { error: error?.message || String(error) });
        return null;
    }
}
/** Fallback draft when no LLM is available: bundle CV + posting for manual editing. */
function buildFallbackDraft(cvText, jobText, jobUrl) {
    return `# Application draft

> Auto-generated draft (no ANTHROPIC_API_KEY set, so this was not tailored automatically).
> Job: ${jobUrl}

## Job posting

${jobText}

## Candidate CV (source: ${CV_URL})

${cvText}
`;
}
/**
 * Resume generation only makes sense for job postings. The flag (reply/reaction)
 * mechanism is generic across all crawler posts, so we skip non-job URLs (e.g.
 * tori.fi / fillaritori.fi marketplace listings).
 */
function isJobUrl(url) {
    return /duunitori\.fi\/tyopaikat/.test(url)
        || /tyomarkkinatori\.fi/.test(url)
        || /mol\.fi/.test(url);
}
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/https?:\/\//, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'job';
}
async function processPost(cvText, post) {
    logger.info('Generating application', { messageId: post.message_id, url: post.url, reactions: post.reaction_count });
    const jobText = await fetchPageText(post.url);
    if (!jobText || jobText.length < 50) {
        logger.warn('Job posting text too short, skipping', { url: post.url, length: jobText.length });
        return;
    }
    let markdown = await generateWithLLM(cvText, jobText, post.url);
    const tailored = markdown != null;
    if (!markdown) {
        logger.warn('Falling back to non-tailored draft (no LLM available)');
        markdown = buildFallbackDraft(cvText, jobText, post.url);
    }
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `${date}-${slugify(post.url)}.md`;
    const filePath = path.join(RESUME_DIR, fileName);
    await fs_1.promises.mkdir(RESUME_DIR, { recursive: true });
    await fs_1.promises.writeFile(filePath, markdown, 'utf-8');
    logger.info('Saved resume', { filePath, tailored });
    if ((0, utils_1.isTelegramConfigured)()) {
        const caption = `📄 Application draft for a liked job post${tailored ? '' : ' (untailored — set ANTHROPIC_API_KEY)'}\n${post.url}`;
        try {
            await (0, utils_1.sendTelegramDocument)(filePath, caption.slice(0, 1024));
        }
        catch (error) {
            logger.error('Failed to send resume document, sending notice instead', { error: error?.message });
            await (0, utils_1.sendTelegramMessage)(`Generated application for ${post.url} but failed to upload the file.`).catch(() => { });
        }
    }
    else {
        logger.warn('Telegram not configured; resume saved locally only', { filePath });
    }
}
(async () => {
    (0, dotenv_1.config)();
    const db = await (0, reactions_db_1.openDb)();
    const posts = await (0, reactions_db_1.getLikedPostsNeedingResume)(db);
    if (posts.length === 0) {
        logger.info('No liked posts awaiting an application');
        await db.close();
        return;
    }
    logger.info('Liked posts to process', { count: posts.length });
    let cvText;
    try {
        cvText = await fetchPageText(CV_URL);
        logger.info('Fetched CV', { url: CV_URL, length: cvText.length });
    }
    catch (error) {
        logger.error('Failed to fetch CV; aborting', { url: CV_URL, error: error?.message || String(error) });
        await db.close();
        process.exit(1);
    }
    for (const post of posts) {
        if (!isJobUrl(post.url)) {
            logger.info('Skipping non-job post (resume only applies to job postings)', { messageId: post.message_id, url: post.url });
            await (0, reactions_db_1.markResumeStatus)(db, post.message_id, 'skipped');
            continue;
        }
        try {
            await processPost(cvText, post);
            await (0, reactions_db_1.markResumeStatus)(db, post.message_id, 'done');
        }
        catch (error) {
            logger.error('Failed to process post', { url: post.url, error: error?.message || String(error) });
            await (0, reactions_db_1.markResumeStatus)(db, post.message_id, 'error');
        }
    }
    await db.close();
    logger.info('Resume generation complete');
})();
