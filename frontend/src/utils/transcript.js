// Transcript helpers for the Transcripts page: filtering and export.
// A message is { id, type: 'speech' | 'gesture', text, confidence, timestamp }.

import { formatTimestamp } from './formatTime.js';

const TYPE_LABEL = { speech: 'SPEECH', gesture: 'SIGN GESTURE' };

/** Filter by type ('all' | 'speech' | 'gesture') and a case-insensitive search. */
export function filterMessages(messages, { type = 'all', query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return messages.filter(
    (message) =>
      (type === 'all' || message.type === type) &&
      (!needle || message.text.toLowerCase().includes(needle))
  );
}

export function transcriptToText(messages, title = 'SignSpeak Classroom Transcript') {
  const lines = messages.map(
    (m) => `[${formatTimestamp(new Date(m.timestamp))}] ${TYPE_LABEL[m.type] ?? m.type}: ${m.text}`
  );
  return [title, `${messages.length} messages`, '', ...lines, ''].join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function transcriptToCsv(messages) {
  const rows = [['timestamp', 'type', 'text', 'confidence']];
  for (const m of messages) {
    rows.push([
      new Date(m.timestamp).toISOString(),
      m.type,
      m.text,
      m.confidence ? Number(m.confidence).toFixed(2) : '',
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** e.g. "signspeak-transcript-2026-11-24-1520.txt" */
export function exportFileName(extension, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `signspeak-transcript-${stamp}.${extension}`;
}

/** Trigger a browser download. */
export function downloadText(fileName, content, mimeType = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
