#!/usr/bin/env node
/**
 * AETHER Web — Local-only command center
 * Listens only on 127.0.0.1:3000
 */

const express = require('express');
const path = require('path');
const { spawn } = require('node:child_process');
const Groq = require('groq-sdk');

const app = express();
const PORT = 3000;
const HOST = '127.0.0.1';

// Exact allow-list
const AUTHORIZED_APPS = {
  spotify: 'Spotify',
  discord: 'Discord',
  chrome: 'Google Chrome',
  safari: 'Safari',
  vscode: 'Visual Studio Code',
  notes: 'Notes',
  calculator: 'Calculator'
};

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory conversation (resets when server restarts)
let conversation = [
  {
    role: 'system',
    content: `You are AETHER, a calm, precise, and lightly witty personal AI that lives inside a local command-center website.

You can:
- Hold intelligent conversation
- Refer to the notes and tasks the user manages in the browser
- Talk about the approved applications (but you never launch them yourself)

You cannot:
- Control the computer
- Open files, browse the web, send messages, or perform any external action
- Launch applications (the website handles that through a separate confirmed button flow)

Approved applications the user can open via the interface:
Spotify, Discord, Google Chrome, Safari, Visual Studio Code, Notes, Calculator.

Stay concise, helpful, and in character. Never claim to have opened an app.`
  }
];

// ---------- Chat endpoint ----------
app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY is not set on the server.' });
    }

    const userMessage = (req.body.message || '').trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'Empty message.' });
    }

    conversation.push({ role: 'user', content: userMessage });

    // Keep history reasonable
    if (conversation.length > 19) {
      conversation = [conversation[0], ...conversation.slice(-18)];
    }

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: conversation,
      temperature: 0.65,
      max_tokens: 1200
    });

    const reply = completion.choices[0]?.message?.content?.trim()
      || 'I lost the thread for a moment. Please try again.';

    conversation.push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to reach the model.' });
  }
});

// ---------- Safe app-open endpoint ----------
app.post('/api/open-app', (req, res) => {
  const key = (req.body.app || '').toLowerCase().trim();

  // Server-side validation against the exact allow-list
  if (!AUTHORIZED_APPS.hasOwnProperty(key)) {
    return res.status(400).json({
      error: 'App not authorized.',
      approved: Object.keys(AUTHORIZED_APPS)
    });
  }

  const appName = AUTHORIZED_APPS[key];

  try {
    const child = spawn('open', ['-a', appName], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    res.json({ success: true, app: appName });
  } catch (err) {
    console.error('Launch error:', err.message);
    res.status(500).json({ error: 'Failed to launch application.' });
  }
});

// ---------- Status endpoint (optional, for the UI) ----------
app.get('/api/status', (req, res) => {
  res.json({
    aiLinked: Boolean(process.env.GROQ_API_KEY),
    approvedApps: Object.keys(AUTHORIZED_APPS).length
  });
});

// Start server — local only
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║         AETHER WEB  ONLINE           ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  →  http://127.0.0.1:${PORT}`);
  console.log('');
  if (!process.env.GROQ_API_KEY) {
    console.log('  ⚠  GROQ_API_KEY is missing!');
    console.log('     export GROQ_API_KEY="your_key_here"');
    console.log('');
  }
  console.log('  Keep this Terminal window open.');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');
});