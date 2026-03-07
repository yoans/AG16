/**
 * Square Grid Geometry
 *
 * Encapsulates all square-grid–specific logic so that arrows-logic,
 * animations, and app.js can delegate to geometry.* without branching.
 */

// ── Constants ────────────────────────────────────────────────────────────

export const DIRECTIONS = 4;
export const DIR_LABELS = ['Up', 'Right', 'Down', 'Left'];
export const DIR_ARROWS = ['↑', '→', '↓', '←'];

// ── Movement ─────────────────────────────────────────────────────────────

const MOVE_DX = [0, 1, 0, -1];
const MOVE_DY = [-1, 0, 1, 0];

export const moveInPlace = (arrow) => {
    arrow.x += MOVE_DX[arrow.vector];
    arrow.y += MOVE_DY[arrow.vector];
};

// ── Flip / Rotation ──────────────────────────────────────────────────────

export const flipVector = (v) => (v + 2) & 3;

export const flipInPlace = (arrow) => {
    arrow.vector = (arrow.vector + 2) & 3;
};

export const rotateVector = (v, offset) => (v + offset) & 3;

export const rotateAmount = (groupSize) => (groupSize - 1) % 4;

export const deduplicateMod = 4;

// ── Bounds ───────────────────────────────────────────────────────────────

export const isValidCell = (x, y, size) =>
    x >= 0 && y >= 0 && x < size && y < size;

export const totalCells = (size) => size * size;

// ── Boundary ─────────────────────────────────────────────────────────────

export const isAtBoundary = (arrow, size, wallSet) => {
    const { x, y, vector } = arrow;
    if (
        (y === 0 && vector === 0) ||
        (x === size - 1 && vector === 1) ||
        (y === size - 1 && vector === 2) ||
        (x === 0 && vector === 3)
    ) return true;
    if (wallSet && wallSet.size > 0) {
        if (vector === 0 && y > 0      && wallSet.has(`h:${y - 1}:${x}`))   return true;
        if (vector === 1 && x < size-1 && wallSet.has(`v:${y}:${x}`))       return true;
        if (vector === 2 && y < size-1 && wallSet.has(`h:${y}:${x}`))       return true;
        if (vector === 3 && x > 0      && wallSet.has(`v:${y}:${x - 1}`))   return true;
    }
    return false;
};

/**
 * boundary axis label used by legacy arrows-logic boundaryKey
 * Returns 'x', 'y', or 'no-boundary'
 */
export const boundaryAxis = (arrow, size, rotations = 0, wallSet) => {
    const v = (arrow.vector + rotations) % 4;
    if (arrow.y === 0      && v === 0) return 'y';
    if (arrow.x === size-1 && v === 1) return 'x';
    if (arrow.y === size-1 && v === 2) return 'y';
    if (arrow.x === 0      && v === 3) return 'x';
    if (wallSet && wallSet.size > 0) {
        if (v === 0 && arrow.y > 0      && wallSet.has(`h:${arrow.y - 1}:${arrow.x}`)) return 'y';
        if (v === 1 && arrow.x < size-1 && wallSet.has(`v:${arrow.y}:${arrow.x}`))     return 'x';
        if (v === 2 && arrow.y < size-1 && wallSet.has(`h:${arrow.y}:${arrow.x}`))     return 'y';
        if (v === 3 && arrow.x > 0      && wallSet.has(`v:${arrow.y}:${arrow.x - 1}`)) return 'x';
    }
    return 'no-boundary';
};

// ── Note Index ───────────────────────────────────────────────────────────

export const getNoteIndex = (arrow, size) => {
    const { x, y, vector } = arrow;
    if (vector === 1 || vector === 3) return y;
    return x;
};

// ── Rendering helpers ────────────────────────────────────────────────────

export const cellToPixel = (x, y, cellSize, border) => ({
    px: border + x * cellSize,
    py: border + y * cellSize,
});

export const pixelToCell = (px, py, cellSize, border) => ({
    x: Math.floor((px - border) / cellSize),
    y: Math.floor((py - border) / cellSize),
});

export const canvasDimensions = (cellSize, size, border) => ({
    w: size * cellSize + border * 2,
    h: size * cellSize + border * 2,
});

/**
 * Animation shift: where an arrow appears at a given percentage through its tick.
 */
export const animationShift = (pos, vector, percentage, cellSize) => {
    const shifts = [
        { dx: 0,                   dy: -percentage * cellSize },
        { dx: percentage * cellSize, dy: 0 },
        { dx: 0,                   dy: percentage * cellSize },
        { dx: -percentage * cellSize, dy: 0 },
    ];
    const s = shifts[vector];
    return { x: pos.x + s.dx, y: pos.y + s.dy };
};

// ── Symmetry vector maps ─────────────────────────────────────────────────

export const SYMMETRY_VECTOR_MAPS = {
    horizontal:       [2, 1, 0, 3],
    vertical:         [0, 3, 2, 1],
    backwardDiagonal: [3, 2, 1, 0],
    forwardDiagonal:  [1, 0, 3, 2],
};

// ── Wall helpers ─────────────────────────────────────────────────────────

/** Valid wall edge types for this geometry */
export const WALL_TYPES = ['h', 'v'];

/**
 * Given pixel coords on a square grid canvas, find nearest internal cell edge.
 * Returns a wall key or null.
 */
export const nearestWallEdge = (px, py, gridSize, canvasSize, border) => {
    const cs = canvasSize / gridSize;
    const gx = px - border;
    const gy = py - border;
    const fx = gx / cs;
    const fy = gy / cs;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const dx = fx - cx;
    const dy = fy - cy;
    const thresh = 0.35;
    const candidates = [];
    if (dy < thresh && cy > 0)          candidates.push({ dist: dy,     key: `h:${cy - 1}:${cx}` });
    if (1 - dy < thresh && cy < gridSize - 1) candidates.push({ dist: 1 - dy, key: `h:${cy}:${cx}` });
    if (dx < thresh && cx > 0)          candidates.push({ dist: dx,     key: `v:${cy}:${cx - 1}` });
    if (1 - dx < thresh && cx < gridSize - 1) candidates.push({ dist: 1 - dx, key: `v:${cy}:${cx}` });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].key;
};
