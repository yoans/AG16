/**
 * Triangle Grid Geometry
 *
 * Implements 6-direction movement, triangular boundaries, reflection-based
 * flip, and all rendering math for an equilateral-triangle grid.
 */

const SQRT3 = Math.sqrt(3);
const HALF_SQRT3 = SQRT3 / 2;

// ── Constants ────────────────────────────────────────────────────────────

export const DIRECTIONS = 6;
export const DIR_LABELS = ['Up-Right', 'Right', 'Down-Right', 'Down-Left', 'Left', 'Up-Left'];
export const DIR_ARROWS = ['↗', '→', '↘', '↙', '←', '↖'];

// ── Movement ─────────────────────────────────────────────────────────────

//  0: up-right   (+1, -1)
//  1: right       (+1,  0)
//  2: down-right  ( 0, +1)
//  3: down-left   (-1, +1)
//  4: left         (-1,  0)
//  5: up-left      ( 0, -1)
const MOVE_DX = [1, 1, 0, -1, -1, 0];
const MOVE_DY = [-1, 0, 1, 1, 0, -1];

export const moveInPlace = (arrow) => {
    arrow.x += MOVE_DX[arrow.vector];
    arrow.y += MOVE_DY[arrow.vector];
};

// ── Flip / Rotation ──────────────────────────────────────────────────────

/** Reflection-based flip (NOT 180°). Bounces off the wall that was hit. */
const FLIP_TABLE = [2, 5, 4, 1, 0, 3];
// 0→2 (off top), 1→5 (off hyp), 2→4 (off hyp), 3→1 (off left), 4→0 (off left), 5→3 (off top)

export const flipVector = (v) => FLIP_TABLE[v];

export const flipInPlace = (arrow) => {
    arrow.vector = FLIP_TABLE[arrow.vector];
};

export const rotateVector = (v, offset) => (v + offset) % 6;

export const rotateAmount = (groupSize) => (groupSize - 1) % 6;

export const deduplicateMod = 6;

// ── Bounds ───────────────────────────────────────────────────────────────

/** Valid cell: x >= 0, y >= 0, x + y < size */
export const isValidCell = (x, y, size) =>
    x >= 0 && y >= 0 && x + y < size;

export const totalCells = (size) => (size * (size + 1)) / 2;

// ── Boundary ─────────────────────────────────────────────────────────────

/**
 * Check if arrow is at a boundary and heading outward.
 * Three exterior edges: top (y=0), left (x=0), hypotenuse (x+y=size-1).
 * Also checks internal walls if wallSet is provided.
 */
export const isAtBoundary = (arrow, size, wallSet) => {
    const { x, y, vector } = arrow;

    // ── Exterior boundaries ──
    // Top edge: y = 0, heading up-right(0) or up-left(5)
    if (y === 0 && (vector === 0 || vector === 5)) return true;
    // Left edge: x = 0, heading down-left(3) or left(4)
    if (x === 0 && (vector === 3 || vector === 4)) return true;
    // Hypotenuse: x + y = size - 1, heading right(1) or down-right(2)
    if (x + y === size - 1 && (vector === 1 || vector === 2)) return true;

    // ── Internal walls ──
    if (wallSet && wallSet.size > 0) {
        // right / left
        if (vector === 1 && wallSet.has(`r:${y}:${x}`))                               return true;
        if (vector === 4 && x > 0 && wallSet.has(`r:${y}:${x - 1}`))                  return true;
        // down-right / up-left
        if (vector === 2 && wallSet.has(`br:${y}:${x}`))                               return true;
        if (vector === 5 && y > 0 && wallSet.has(`br:${y - 1}:${x}`))                 return true;
        // down-left / up-right
        if (vector === 3 && wallSet.has(`bl:${y}:${x}`))                               return true;
        if (vector === 0 && y > 0 && x + 1 < size && wallSet.has(`bl:${y - 1}:${x + 1}`)) return true;
    }
    return false;
};

/**
 * Identify WHICH boundary was hit — used for note mapping and legacy boundaryKey.
 * Returns 'top', 'hyp', 'left', or null.
 */
export const boundaryEdge = (arrow, size) => {
    const { x, y, vector } = arrow;
    if (y === 0 && (vector === 0 || vector === 5))               return 'top';
    if (x + y === size - 1 && (vector === 1 || vector === 2))    return 'hyp';
    if (x === 0 && (vector === 3 || vector === 4))               return 'left';
    return null;
};

/**
 * Legacy-compatible boundaryKey (returns an axis label or 'no-boundary').
 * For triangles we map: top → 'y', left → 'x', hyp → 'z'.
 */
export const boundaryAxis = (arrow, size, rotations = 0, wallSet) => {
    // rotations parameter: in triangle mode we apply it modulo 6
    const v = (arrow.vector + rotations) % 6;
    const a = { ...arrow, vector: v };

    if (a.y === 0 && (v === 0 || v === 5))            return 'y';    // top
    if (a.x === 0 && (v === 3 || v === 4))             return 'x';    // left
    if (a.x + a.y === size - 1 && (v === 1 || v === 2)) return 'z';  // hypotenuse

    if (wallSet && wallSet.size > 0) {
        if (v === 1 && wallSet.has(`r:${a.y}:${a.x}`))                                return 'z';
        if (v === 4 && a.x > 0 && wallSet.has(`r:${a.y}:${a.x - 1}`))                return 'z';
        if (v === 2 && wallSet.has(`br:${a.y}:${a.x}`))                                return 'z';
        if (v === 5 && a.y > 0 && wallSet.has(`br:${a.y - 1}:${a.x}`))               return 'z';
        if (v === 3 && wallSet.has(`bl:${a.y}:${a.x}`))                                return 'z';
        if (v === 0 && a.y > 0 && a.x + 1 < size && wallSet.has(`bl:${a.y - 1}:${a.x + 1}`)) return 'z';
    }
    return 'no-boundary';
};

// ── Note Index ───────────────────────────────────────────────────────────

/** Which position along the struck edge determines the note. */
export const getNoteIndex = (arrow, size) => {
    const { x, y, vector } = arrow;
    if (y === 0 && (vector === 0 || vector === 5))            return x;  // top edge
    if (x + y === size - 1 && (vector === 1 || vector === 2)) return y;  // hypotenuse
    if (x === 0 && (vector === 3 || vector === 4))             return y;  // left edge
    return 0;
};

// ── Rendering helpers ────────────────────────────────────────────────────

/**
 * Convert cell (x, y) to pixel position (top-left corner of the cell's
 * bounding box in the triangular grid).
 */
export const cellToPixel = (x, y, cellSize, border) => ({
    px: border + x * cellSize + y * cellSize / 2,
    py: border + y * cellSize * HALF_SQRT3,
});

/**
 * Pixel position → nearest cell index.
 */
export const pixelToCell = (px, py, cellSize, border) => {
    const rawY = (py - border) / (cellSize * HALF_SQRT3);
    const y = Math.floor(rawY);
    const rawX = (px - border - y * cellSize / 2) / cellSize;
    const x = Math.floor(rawX);
    return { x, y };
};

/**
 * Canvas dimensions for a triangular grid of the given size.
 * The triangle sits with a horizontal top edge, point down.
 * Actually we use a top-right triangle: top row has `size` cells,
 * bottom row has 1 cell. Width = size * cellSize (with the row offsets).
 * Height = (size) * cellSize * √3/2.
 */
export const canvasDimensions = (cellSize, size, border) => {
    const w = size * cellSize + border * 2;
    const h = size * cellSize * HALF_SQRT3 + border * 2;
    return { w, h };
};

/**
 * Animation shift for 6 directions.
 */
export const animationShift = (pos, vector, percentage, cellSize) => {
    const p = percentage;
    const cs = cellSize;
    const shifts = [
        { dx:  p * cs / 2,  dy: -p * cs * HALF_SQRT3 },       // 0: up-right
        { dx:  p * cs,       dy:  0 },                          // 1: right
        { dx:  p * cs / 2,  dy:  p * cs * HALF_SQRT3 },       // 2: down-right
        { dx: -p * cs / 2,  dy:  p * cs * HALF_SQRT3 },       // 3: down-left
        { dx: -p * cs,       dy:  0 },                          // 4: left
        { dx: -p * cs / 2,  dy: -p * cs * HALF_SQRT3 },       // 5: up-left
    ];
    const s = shifts[vector];
    return { x: pos.x + s.dx, y: pos.y + s.dy };
};

// ── Symmetry vector maps ─────────────────────────────────────────────────

// Mirror across the vertical median of the triangle (horizontal/left-right symmetry)
export const SYMMETRY_VECTOR_MAPS = {
    horizontal: [3, 5, 4, 0, 2, 1],   // left-right mirror
    // The triangle has 3-fold symmetry; keeping just horizontal for now.
    // vertical and diagonal mirrors don't apply the same way as square.
};

// ── Wall helpers ─────────────────────────────────────────────────────────

export const WALL_TYPES = ['r', 'br', 'bl'];

/**
 * Given pixel coords on a triangle grid canvas, find nearest internal cell edge.
 * Returns a wall key like "r:y:x", "br:y:x", "bl:y:x", or null.
 */
export const nearestWallEdge = (px, py, gridSize, canvasSize, border, cellSize) => {
    // Convert pixel to cell
    const cell = pixelToCell(px, py, cellSize, border);
    const { x, y } = cell;
    if (!isValidCell(x, y, gridSize)) return null;

    // Get cell centre in pixels
    const cp = cellToPixel(x, y, cellSize, border);
    const cx = cp.px + cellSize / 2;
    const cy = cp.py + cellSize * HALF_SQRT3 / 3;

    // Check each edge
    const candidates = [];

    // Right edge: shared with (x+1, y)
    if (x + 1 + y < gridSize) {
        const np = cellToPixel(x + 1, y, cellSize, border);
        const nx = np.px + cellSize / 2;
        const ny = np.py + cellSize * HALF_SQRT3 / 3;
        const mx = (cx + nx) / 2;
        const my = (cy + ny) / 2;
        const d = Math.hypot(px - mx, py - my);
        candidates.push({ dist: d, key: `r:${y}:${x}` });
    }

    // Bottom-right (down-right): shared with (x, y+1)
    if (y + 1 < gridSize && x + y + 1 < gridSize) {
        const np = cellToPixel(x, y + 1, cellSize, border);
        const nx = np.px + cellSize / 2;
        const ny = np.py + cellSize * HALF_SQRT3 / 3;
        const mx = (cx + nx) / 2;
        const my = (cy + ny) / 2;
        const d = Math.hypot(px - mx, py - my);
        candidates.push({ dist: d, key: `br:${y}:${x}` });
    }

    // Bottom-left (down-left): shared with cell at (x-1, y+1) if valid
    if (x > 0 && y + 1 < gridSize && (x - 1) + (y + 1) < gridSize) {
        const np = cellToPixel(x - 1, y + 1, cellSize, border);
        const nx = np.px + cellSize / 2;
        const ny = np.py + cellSize * HALF_SQRT3 / 3;
        const mx = (cx + nx) / 2;
        const my = (cy + ny) / 2;
        const d = Math.hypot(px - mx, py - my);
        candidates.push({ dist: d, key: `bl:${y}:${x}` });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    // Only return if close enough (threshold: cellSize * 0.6)
    if (candidates[0].dist > cellSize * 0.6) return null;
    return candidates[0].key;
};

/**
 * Draw a hexagon marker at a given center.
 */
export const drawHexMarker = (sketch, cx, cy, radius) => {
    sketch.beginShape();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        sketch.vertex(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
    sketch.endShape(sketch.CLOSE);
};

/**
 * Draw a directional arrow (small triangle) rotated to match one of 6 directions.
 */
export const drawTriangleArrow = (sketch, cx, cy, size, vector) => {
    const angle = -Math.PI / 6 + vector * Math.PI / 3;
    sketch.push();
    sketch.translate(cx, cy);
    sketch.rotate(angle);
    sketch.triangle(0, -size * 0.4, size * 0.35, size * 0.2, -size * 0.35, size * 0.2);
    sketch.pop();
};

/**
 * Check if a pixel point is inside the triangular grid area.
 */
export const pointInTriangle = (px, py, canvasW, canvasH, border) => {
    // The triangle has a flat top edge and a point at the bottom-center.
    // Top-left: (border, border)
    // Top-right: (canvasW - border, border)
    // Bottom-center: (canvasW/2, canvasH - border)
    const x = px;
    const y = py;
    const x0 = border, y0 = border;
    const x1 = canvasW - border, y1 = border;
    const x2 = canvasW / 2, y2 = canvasH - border;

    const d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const a = ((x - x0) * (y2 - y0) - (x2 - x0) * (y - y0)) / d;
    const b = ((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)) / d;
    const c = 1 - a - b;
    return a >= 0 && b >= 0 && c >= 0;
};
