'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PlayData = require('../play-data.js');

function makePlay() {
  return {
    formatVersion: 2,
    playName: 'Horns Entry',
    courtType: 'half',
    nextFrameId: 3,
    nextPlayerId: 4,
    frames: [
      {
        id: 1,
        notes: 'Start in horns.',
        players: [
          { id: 1, label: '1', isOffense: true, x: 100, y: 300, radius: 15, hasBall: true },
          { id: 2, label: '2', isOffense: true, x: 300, y: 160, radius: 15, hasBall: false },
          { id: 3, label: 'X1', isOffense: false, x: 130, y: 300, radius: 15, hasBall: false }
        ],
        lines: [
          {
            id: 5,
            type: 'pass',
            startPlayerId: 1,
            endPlayerId: 2,
            points: [{ x: 100, y: 300 }, { x: 200, y: 220 }, { x: 300, y: 160 }]
          }
        ]
      },
      {
        id: 2,
        notes: 'Receive and attack.',
        players: [
          { id: 1, label: '1', isOffense: true, x: 100, y: 300, radius: 15, hasBall: false },
          { id: 2, label: '2', isOffense: true, x: 300, y: 160, radius: 15, hasBall: true },
          { id: 3, label: 'X1', isOffense: false, x: 130, y: 300, radius: 15, hasBall: false }
        ],
        lines: [
          {
            id: 5,
            type: 'cut',
            startPlayerId: 2,
            points: [{ x: 300, y: 160 }, { x: 420, y: 240 }]
          },
          {
            type: 'screen',
            startPlayerId: 1,
            points: [{ x: 100, y: 300 }, { x: 145, y: 350 }]
          }
        ]
      }
    ]
  };
}

test('accepts a complete play file', () => {
  assert.equal(PlayData.validatePlayData(makePlay()), true);
});

test('normalizes legacy files with missing format version and frame notes', () => {
  const legacy = makePlay();
  delete legacy.formatVersion;
  delete legacy.frames[0].notes;
  delete legacy.frames[1].notes;

  const normalized = PlayData.normalizePlayData(legacy);
  assert.equal(normalized.formatVersion, 2);
  assert.equal(normalized.frames[0].notes, '');
  assert.equal(normalized.frames[1].notes, '');
  assert.equal(normalized.courtType, 'half');
});

test('migrates version 1 player and path coordinates to the NFHS master court', () => {
  const legacy = makePlay();
  legacy.formatVersion = 1;
  const normalized = PlayData.normalizePlayData(legacy);
  assert.equal(normalized.formatVersion, 2);
  assert.equal(normalized.frames[0].players[0].x, 100 * 1.89);
  assert.equal(normalized.frames[0].players[0].y, 300 * 1.5);
  assert.equal(normalized.frames[0].lines[0].points[1].x, 200 * 1.89);
  assert.equal(normalized.frames[0].lines[0].points[1].y, 220 * 1.5);
});

test('repairs missing and duplicate action IDs across the entire play', () => {
  const normalized = PlayData.normalizePlayData(makePlay());
  const ids = normalized.frames.flatMap(frame => frame.lines.map(line => line.id));

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => Number.isSafeInteger(id) && id > 0));
  assert.ok(normalized.nextPlayerId > 3);
});

test('clamps imported players and route points to the court', () => {
  const play = makePlay();
  play.frames[0].players[0].x = -50;
  play.frames[0].players[0].y = 900;
  play.frames[0].lines[0].points[1] = { x: -20, y: 999 };

  const normalized = PlayData.normalizePlayData(play);
  assert.equal(normalized.frames[0].players[0].x, 15);
  assert.equal(normalized.frames[0].players[0].y, 585);
  assert.equal(normalized.frames[0].lines[0].points[1].x, 0);
  assert.equal(normalized.frames[0].lines[0].points[1].y, 600);
});

test('repairs inconsistent multiple ball holders by keeping one offensive holder', () => {
  const play = makePlay();
  play.frames[0].players[1].hasBall = true;

  const normalized = PlayData.normalizePlayData(play);
  const holders = normalized.frames[0].players.filter(player => player.hasBall);
  assert.equal(holders.length, 1);
  assert.equal(holders[0].label, '2');
});

test('advances next frame and player identifiers beyond imported IDs', () => {
  const play = makePlay();
  play.nextFrameId = 1;
  play.nextPlayerId = 1;

  const normalized = PlayData.normalizePlayData(play);
  assert.equal(normalized.nextFrameId, 3);
  assert.equal(normalized.nextPlayerId, 4);
});

test('rejects an empty or malformed frame collection', () => {
  assert.throws(() => PlayData.validatePlayData({ frames: [] }), /between 1 and/);
  assert.throws(() => PlayData.validatePlayData({ frames: [null] }), /Frame 1 is invalid/);
});

test('rejects player references that do not exist in the frame', () => {
  const play = makePlay();
  play.frames[0].lines[0].startPlayerId = 99;
  assert.throws(() => PlayData.validatePlayData(play), /missing starting player/);
});

test('rejects malformed action types and non-finite coordinates', () => {
  const badType = makePlay();
  badType.frames[0].lines[0].type = 'teleport';
  assert.throws(() => PlayData.validatePlayData(badType), /unsupported type/);

  const badCoordinate = makePlay();
  badCoordinate.frames[0].players[0].x = null;
  assert.throws(() => PlayData.validatePlayData(badCoordinate), /invalid coordinates/);
});

test('rejects duplicate frame IDs and reused player IDs with different labels', () => {
  const duplicateFrames = makePlay();
  duplicateFrames.frames[1].id = 1;
  assert.throws(() => PlayData.validatePlayData(duplicateFrames), /duplicate ID/);

  const duplicatePlayerIdentity = makePlay();
  duplicatePlayerIdentity.frames[1].players[0].label = '4';
  assert.throws(() => PlayData.validatePlayData(duplicatePlayerIdentity), /assigned to more than one player/);
});

test('enforces reasonable path and file metadata limits', () => {
  const tooManyPoints = makePlay();
  tooManyPoints.frames[0].lines[0].points = Array.from({ length: 251 }, () => ({ x: 100, y: 100 }));
  assert.throws(() => PlayData.validatePlayData(tooManyPoints), /invalid path/);

  assert.equal(PlayData.MAX_FILE_BYTES, 5 * 1024 * 1024);
});


test('advances movement actions into the next frame and starts with no copied lines', () => {
  const play = makePlay();
  const nextFrame = PlayData.createNextFrame(play.frames[1], 3);
  const movedPlayer = nextFrame.players.find(player => player.id === 2);

  assert.equal(movedPlayer.x, 420);
  assert.equal(movedPlayer.y, 240);
  assert.deepEqual(nextFrame.lines, []);
  assert.equal(nextFrame.notes, '');
  assert.equal(nextFrame.id, 3);
});

test('applies a single pass result and transfers possession to the receiver', () => {
  const play = makePlay();
  const nextFrame = PlayData.createNextFrame(play.frames[0], 3);
  const holders = nextFrame.players.filter(player => player.hasBall);

  assert.equal(holders.length, 1);
  assert.equal(holders[0].id, 2);
});

test('a shot clears possession in the following frame', () => {
  const play = makePlay();
  const frame = play.frames[0];
  frame.lines = [{
    id: 21,
    type: 'shoot',
    startPlayerId: 1,
    points: [{ x: 100, y: 300 }, { x: 200, y: 180 }]
  }];

  const nextFrame = PlayData.createNextFrame(frame, 3);
  assert.equal(nextFrame.players.some(player => player.hasBall), false);
});

test('a pass can transfer possession to a defensive player', () => {
  const play = makePlay();
  play.frames[0].lines[0].endPlayerId = 3;
  const normalized = PlayData.normalizePlayData(play);
  const nextFrame = PlayData.createNextFrame(normalized.frames[0], 3);
  const holder = nextFrame.players.find(player => player.hasBall);

  assert.equal(holder.label, 'X1');
  assert.equal(holder.isOffense, false);
});

test('when multiple ball actions are present, the final action determines possession', () => {
  const play = makePlay();
  play.frames[0].lines.push({
    id: 6,
    type: 'pass',
    startPlayerId: 2,
    endPlayerId: 3,
    points: [{ x: 300, y: 160 }, { x: 130, y: 300 }]
  });

  const nextFrame = PlayData.createNextFrame(play.frames[0], 3);
  const holders = nextFrame.players.filter(player => player.hasBall);

  assert.equal(holders.length, 1);
  assert.equal(holders[0].label, 'X1');
});

test('rejects attempts to advance an invalid frame', () => {
  assert.throws(() => PlayData.createNextFrame(null, 2), /invalid frame/);
  assert.throws(() => PlayData.createNextFrame({ players: [], lines: [] }, 0), /positive integer/);
});
