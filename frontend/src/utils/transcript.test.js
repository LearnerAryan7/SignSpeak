// Unit tests for transcript and time helpers. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, formatTimestamp } from './formatTime.js';
import { exportFileName, filterMessages, transcriptToCsv, transcriptToText } from './transcript.js';

const messages = [
  { id: 1, type: 'speech', text: 'Open your notebooks', confidence: 0.93, timestamp: new Date(2026, 10, 24, 9, 5, 7) },
  { id: 2, type: 'gesture', text: 'HELLO', confidence: 0.88, timestamp: new Date(2026, 10, 24, 9, 5, 9) },
  { id: 3, type: 'speech', text: 'Water "evaporates", then condenses', confidence: 0, timestamp: new Date(2026, 10, 24, 9, 6, 0) },
];

test('formatDuration shows mm:ss and h:mm:ss', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3725), '1:02:05');
});

test('formatTimestamp uses 24-hour hh:mm:ss', () => {
  assert.match(formatTimestamp(new Date(2026, 0, 1, 15, 4, 9)), /^15:04:09$/);
});

test('filterMessages filters by type', () => {
  assert.deepEqual(filterMessages(messages, { type: 'gesture' }).map((m) => m.id), [2]);
  assert.equal(filterMessages(messages, { type: 'speech' }).length, 2);
  assert.equal(filterMessages(messages).length, 3);
});

test('filterMessages searches case-insensitively', () => {
  assert.deepEqual(filterMessages(messages, { query: '  NOTEBOOK ' }).map((m) => m.id), [1]);
  assert.deepEqual(filterMessages(messages, { type: 'gesture', query: 'water' }), []);
});

test('transcriptToText lists every message with type and time', () => {
  const text = transcriptToText(messages);
  assert.match(text, /3 messages/);
  assert.match(text, /\[09:05:07\] SPEECH: Open your notebooks/);
  assert.match(text, /\[09:05:09\] SIGN GESTURE: HELLO/);
});

test('transcriptToCsv escapes quotes and leaves zero confidence empty', () => {
  const rows = transcriptToCsv(messages).trim().split('\r\n');
  assert.equal(rows[0], 'timestamp,type,text,confidence');
  assert.equal(rows.length, 4);
  assert.match(rows[1], /,speech,Open your notebooks,0\.93$/);
  assert.match(rows[3], /,speech,"Water ""evaporates"", then condenses",$/);
});

test('transcriptToCsv accepts ISO string timestamps (restored from storage)', () => {
  const restored = [{ ...messages[0], timestamp: messages[0].timestamp.toISOString() }];
  assert.match(transcriptToCsv(restored), /Open your notebooks/);
});

test('exportFileName includes the date and extension', () => {
  assert.equal(exportFileName('csv', new Date(2026, 10, 24, 15, 20)), 'signspeak-transcript-2026-11-24-1520.csv');
});
