// Gegenprobe fuer safeNext/splitNext. Dieses Repo hat keinen Test-Runner,
// deshalb ein eigenstaendiges Skript statt eines Frameworks:
//
//   node --experimental-strip-types src/lib/safe-next.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import { safeNext, splitNext } from './safe-next.ts'

// --- erlaubt: repo-interne Pfade ---
assert.equal(safeNext('/zentrale'), '/zentrale')
assert.equal(safeNext('/app?tab=chats'), '/app?tab=chats')
assert.equal(safeNext('/app/du/tagebuch'), '/app/du/tagebuch')
assert.equal(safeNext('/a,b+c*d'), '/a,b+c*d') // harmlose Sonderzeichen bleiben

// --- abgelehnt: fremdes Ziel ---
assert.equal(safeNext('https://evil.example'), null)
assert.equal(safeNext('//evil.example'), null) // protokoll-relativ
assert.equal(safeNext('/\\evil.example'), null) // Backslash als Slash gelesen
assert.equal(safeNext('\\\\evil.example'), null)
assert.equal(safeNext('app'), null) // ohne fuehrenden Slash

// --- abgelehnt: Steuerzeichen, die naive Slash-Pruefungen umgehen ---
assert.equal(safeNext('/\tevil'), null)
assert.equal(safeNext('/\nevil'), null)
assert.equal(safeNext('/\revil'), null)
assert.equal(safeNext('/' + String.fromCharCode(0x0b) + 'evil'), null) // VT
assert.equal(safeNext('/' + String.fromCharCode(0x7f) + 'evil'), null) // DEL

// --- leere Eingaben ---
assert.equal(safeNext(null), null)
assert.equal(safeNext(undefined), null)
assert.equal(safeNext(''), null)

// --- splitNext ---
assert.deepEqual(splitNext('/zentrale'), { pathname: '/zentrale', search: '' })
assert.deepEqual(splitNext('/app?tab=chats'), { pathname: '/app', search: '?tab=chats' })
assert.deepEqual(splitNext('/a?b=1?c=2'), { pathname: '/a', search: '?b=1?c=2' })

console.log('safe-next: alle Faelle ok')
