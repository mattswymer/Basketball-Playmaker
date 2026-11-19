(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 800;
  const HEIGHT = 600;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_FRAMES = 500;
  const MAX_POINTS = 250;
  const PLAYER_LABEL = /^(?:[1-5]|X[1-5])$/;
  const ACTION_TYPES = new Set(['cut', 'move', 'dribble', 'screen', 'pass', 'shoot']);

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function coordinate(value) {
    return Number.isFinite(value) && Math.abs(value) <= 100000;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function validatePlayData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Play file must contain a JSON object');
    }
    if (!Array.isArray(data.frames) || data.frames.length < 1 || data.frames.length > MAX_FRAMES) {
      throw new Error('Play must contain between 1 and ' + MAX_FRAMES + ' frames');
    }
    if (data.playName !== undefined && typeof data.playName !== 'string') {
      throw new Error('Play name must be text');
    }
    if (data.courtType !== undefined && !['half', 'full'].includes(data.courtType)) {
      throw new Error('Court type must be half or full');
    }
    if (data.formatVersion !== undefined && data.formatVersion !== 1) {
      throw new Error('This play file uses an unsupported format version');
    }
    ['nextFrameId', 'nextPlayerId'].forEach(key => {
      if (data[key] !== undefined && !positiveInteger(data[key])) {
        throw new Error(key + ' must be a positive integer');
      }
    });

    const frameIds = new Set();
    const playerLabelsById = new Map();

    data.frames.forEach((frame, frameIndex) => {
      const number = frameIndex + 1;
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
        throw new Error('Frame ' + number + ' is invalid');
      }
      if (!positiveInteger(frame.id) || frameIds.has(frame.id)) {
        throw new Error('Frame ' + number + ' has a missing, invalid, or duplicate ID');
      }
      frameIds.add(frame.id);
      if (frame.notes !== undefined && typeof frame.notes !== 'string') {
        throw new Error('Notes in frame ' + number + ' must be text');
      }
      if (!Array.isArray(frame.players) || frame.players.length > 10) {
        throw new Error('Players in frame ' + number + ' are invalid');
      }
      if (!Array.isArray(frame.lines)) {
        throw new Error('Actions in frame ' + number + ' are invalid');
      }

      const playersById = new Map();
      const labels = new Set();
      frame.players.forEach((player, playerIndex) => {
        if (!player || typeof player !== 'object' || Array.isArray(player)) {
          throw new Error('Player ' + (playerIndex + 1) + ' in frame ' + number + ' is invalid');
        }
        if (!positiveInteger(player.id)) {
          throw new Error('Player in frame ' + number + ' has an invalid ID');
        }
        if (typeof player.label !== 'string' || !PLAYER_LABEL.test(player.label) || labels.has(player.label)) {
          throw new Error('Player labels in frame ' + number + ' must be unique values from 1–5 and X1–X5');
        }
        if (!coordinate(player.x) || !coordinate(player.y)) {
          throw new Error('Player ' + player.label + ' in frame ' + number + ' has invalid coordinates');
        }
        if (player.radius !== undefined &&
            (!Number.isFinite(player.radius) || player.radius <= 0 || player.radius > 100)) {
          throw new Error('Player ' + player.label + ' in frame ' + number + ' has an invalid radius');
        }
        if (player.hasBall !== undefined && typeof player.hasBall !== 'boolean') {
          throw new Error('Ball possession for player ' + player.label + ' is invalid');
        }
        if (player.isOffense !== undefined && typeof player.isOffense !== 'boolean') {
          throw new Error('Player type for player ' + player.label + ' is invalid');
        }
        const offense = !player.label.startsWith('X');
        if (player.isOffense !== undefined && player.isOffense !== offense) {
          throw new Error('Player ' + player.label + ' has an inconsistent offense/defense designation');
        }
        const knownLabel = playerLabelsById.get(player.id);
        if (knownLabel && knownLabel !== player.label) {
          throw new Error('Player ID ' + player.id + ' is assigned to more than one player');
        }
        playerLabelsById.set(player.id, player.label);
        playersById.set(player.id, player);
        labels.add(player.label);
      });

      frame.lines.forEach((line, lineIndex) => {
        if (!line || typeof line !== 'object' || Array.isArray(line)) {
          throw new Error('Action ' + (lineIndex + 1) + ' in frame ' + number + ' is invalid');
        }
        if (line.id !== undefined && !positiveInteger(line.id)) {
          throw new Error('Action ' + (lineIndex + 1) + ' in frame ' + number + ' has an invalid ID');
        }
        if (!ACTION_TYPES.has(line.type)) {
          throw new Error('Action ' + (lineIndex + 1) + ' in frame ' + number + ' has an unsupported type');
        }
        if (!positiveInteger(line.startPlayerId) || !playersById.has(line.startPlayerId)) {
          throw new Error('Action ' + (lineIndex + 1) + ' in frame ' + number + ' references a missing starting player');
        }
        if (line.endPlayerId !== undefined && line.endPlayerId !== null &&
            (!positiveInteger(line.endPlayerId) || !playersById.has(line.endPlayerId))) {
          throw new Error('Action ' + (lineIndex + 1) + ' in frame ' + number + ' references a missing destination player');
        }
        if (!Array.isArray(line.points) || line.points.length < 2 || line.points.length > MAX_POINTS) {
          throw new Error('Action ' + (lineIndex + 1) + ' in frame ' + number + ' has an invalid path');
        }
        line.points.forEach((point, pointIndex) => {
          if (!point || !coordinate(point.x) || !coordinate(point.y)) {
            throw new Error('Path point ' + (pointIndex + 1) + ' in frame ' + number + ' has invalid coordinates');
          }
        });
      });
    });
    return true;
  }

  function normalizePlayData(data) {
    validatePlayData(data);
    const frames = data.frames.map(frame => ({
      id: frame.id,
      notes: frame.notes || '',
      players: frame.players.map(player => {
        const radius = Number.isFinite(player.radius) ? Math.min(player.radius, 50) : 15;
        const safeRadius = Math.min(radius, WIDTH / 2, HEIGHT / 2);
        return {
          id: player.id,
          label: player.label,
          isOffense: !player.label.startsWith('X'),
          x: clamp(player.x, safeRadius, WIDTH - safeRadius),
          y: clamp(player.y, safeRadius, HEIGHT - safeRadius),
          radius,
          hasBall: Boolean(player.hasBall)
        };
      }),
      lines: frame.lines.map(line => ({
        ...line,
        points: line.points.map(point => ({
          x: clamp(point.x, 0, WIDTH),
          y: clamp(point.y, 0, HEIGHT)
        }))
      }))
    }));

    // Repair missing or duplicate line IDs from older files.
    const usedLineIds = new Set();
    let nextLineId = frames.reduce((max, frame) =>
      frame.lines.reduce((inner, line) => Math.max(inner, line.id || 0), max), 0) + 1;
    frames.forEach(frame => frame.lines.forEach(line => {
      if (!line.id || usedLineIds.has(line.id)) line.id = nextLineId++;
      usedLineIds.add(line.id);
    }));

    // Keep at most one ball holder in each frame when repairing older files.
    frames.forEach(frame => {
      const holders = frame.players.filter(player => player.hasBall);
      holders.slice(0, -1).forEach(player => { player.hasBall = false; });
    });

    const maxFrameId = frames.reduce((max, frame) => Math.max(max, frame.id), 0);
    const maxPlayerId = frames.reduce((max, frame) =>
      frame.players.reduce((inner, player) => Math.max(inner, player.id), max), 0);
    return {
      formatVersion: 1,
      playName: data.playName || '',
      courtType: data.courtType || 'half',
      frames,
      nextFrameId: Math.max(data.nextFrameId || 1, maxFrameId + 1),
      nextPlayerId: Math.max(data.nextPlayerId || 1, maxPlayerId + 1)
    };
  }

  function createNextFrame(currentFrame, nextFrameId) {
    if (!currentFrame || !Array.isArray(currentFrame.players) || !Array.isArray(currentFrame.lines)) {
      throw new Error('Cannot advance an invalid frame');
    }
    if (!positiveInteger(nextFrameId)) throw new Error('Next frame ID must be a positive integer');

    const players = JSON.parse(JSON.stringify(currentFrame.players));
    const nextFrame = {
      id: nextFrameId,
      notes: '',
      players,
      lines: []
    };

    currentFrame.lines.forEach(line => {
      if (!line || !Array.isArray(line.points) || line.points.length < 2 || !line.startPlayerId) return;
      const actor = players.find(player => player.id === line.startPlayerId);
      if (!actor) return;

      if (['cut', 'move', 'dribble', 'screen'].includes(line.type)) {
        const endpoint = line.points[line.points.length - 1];
        const radius = Number.isFinite(actor.radius) ? actor.radius : 15;
        actor.x = clamp(endpoint.x, radius, WIDTH - radius);
        actor.y = clamp(endpoint.y, radius, HEIGHT - radius);
      }
    });

    // Apply a single possession result per frame. Multiple ball actions are
    // uncommon, but choosing the final one avoids creating two ball holders.
    const ballAction = currentFrame.lines.slice().reverse().find(line =>
      line && (line.type === 'pass' || line.type === 'shoot')
    );
    if (ballAction) {
      players.forEach(player => { player.hasBall = false; });
      if (ballAction.type === 'pass' && ballAction.endPlayerId) {
        const receiver = players.find(player => player.id === ballAction.endPlayerId);
        if (receiver) receiver.hasBall = true;
      }
    }

    return nextFrame;
  }

  return { validatePlayData, normalizePlayData, createNextFrame, MAX_FILE_BYTES };
});
