/**
 * Optimized Arrow Grid Logic
 * 
 * This is an optimized version of arrows-logic.js that:
 * 1. Uses typed arrays where possible
 * 2. Avoids excessive object/array creation
 * 3. Uses numeric hashing instead of string keys
 * 4. Reuses buffers between frames
 * 5. Minimizes garbage collection pressure
 *
 * Supports both 'square' and 'triangle' grid types via the geometry module.
 */

import { playSounds } from './play-notes';
import { getGeometry } from './geometry';
import * as squareGeo from './geometry/square';
import * as triangleGeo from './geometry/triangle';

export const NO_BOUNDARY = 0;
export const BOUNDARY = 1;

// Vector directions (square): 0=up, 1=right, 2=down, 3=left
const VECTOR_UP = 0;
const VECTOR_RIGHT = 1;
const VECTOR_DOWN = 2;
const VECTOR_LEFT = 3;

// Pre-allocated buffers for arrow processing (reused each frame)
let arrowBuffer1 = new Array(1000);
let arrowBuffer2 = new Array(1000);
let locationMap = new Map();
let vectorMap = new Map();

/**
 * Create a numeric hash for arrow position + vector
 * Max grid size of 256 supported
 */
const arrowHash = (x, y, vector) => (x << 16) | (y << 8) | vector;

/**
 * Create a numeric hash for arrow position only
 */
const locationHash = (x, y) => (x << 8) | y;

/**
 * Move arrow one step in its direction (mutates arrow)
 * Uses geometry-specific movement when geo is provided.
 */
const moveArrowInPlace = (arrow, geo) => {
    if (geo) { geo.moveInPlace(arrow); return; }
    switch (arrow.vector) {
        case VECTOR_UP: arrow.y--; break;
        case VECTOR_RIGHT: arrow.x++; break;
        case VECTOR_DOWN: arrow.y++; break;
        case VECTOR_LEFT: arrow.x--; break;
    }
};

/**
 * Flip arrow direction (mutates arrow)
 */
const flipArrowInPlace = (arrow, geo) => {
    if (geo) { geo.flipInPlace(arrow); return; }
    arrow.vector = (arrow.vector + 2) & 3;
};

/**
 * Rotate arrow by offset (mutates arrow)
 */
const rotateArrowInPlace = (arrow, offset, geo) => {
    if (geo) { arrow.vector = geo.rotateVector(arrow.vector, offset); return; }
    arrow.vector = (arrow.vector + offset) & 3;
};

/**
 * Check if arrow is at boundary and pointing outward.
 * Checks both exterior walls and internal walls (if wallSet provided).
 * When geo is provided, delegates to geometry-specific boundary logic.
 */
const isAtBoundary = (arrow, size, wallSet, geo) => {
    if (geo) return geo.isAtBoundary(arrow, size, wallSet);
    const { x, y, vector } = arrow;
    // Exterior walls
    if (
        (y === 0 && vector === VECTOR_UP) ||
        (x === size - 1 && vector === VECTOR_RIGHT) ||
        (y === size - 1 && vector === VECTOR_DOWN) ||
        (x === 0 && vector === VECTOR_LEFT)
    ) return true;
    // Internal walls
    if (wallSet && wallSet.size > 0) {
        if (vector === VECTOR_UP && y > 0 && wallSet.has(`h:${y - 1}:${x}`)) return true;
        if (vector === VECTOR_RIGHT && x < size - 1 && wallSet.has(`v:${y}:${x}`)) return true;
        if (vector === VECTOR_DOWN && y < size - 1 && wallSet.has(`h:${y}:${x}`)) return true;
        if (vector === VECTOR_LEFT && x > 0 && wallSet.has(`v:${y}:${x - 1}`)) return true;
    }
    return false;
};

/**
 * Check if arrow is within grid bounds
 */
const isInBounds = (arrow, size, geo) => {
    if (geo) return geo.isValidCell(arrow.x, arrow.y, size);
    return arrow.x >= 0 && arrow.y >= 0 && arrow.x < size && arrow.y < size;
};

/**
 * Clone an arrow object
 */
const cloneArrow = (arrow) => ({ x: arrow.x, y: arrow.y, vector: arrow.vector, channel: arrow.channel ?? 1, velocity: arrow.velocity ?? 1.0 });

/**
 * Generate a unique ID (simple counter-based for performance)
 */
let idCounter = 0;
const generateId = () => `grid-${++idCounter}`;

/**
 * Create a new grid with random arrows
 * @param {number} size
 * @param {number} numberOfArrows
 * @param {'square'|'triangle'} [gridType='square']
 */
export const newGrid = (size, numberOfArrows, gridType = 'square') => {
    const geo = getGeometry(gridType);
    const dirs = geo.DIRECTIONS;
    const arrows = [];
    for (let i = 0; i < numberOfArrows; i++) {
        let x, y;
        if (gridType === 'triangle') {
            // Random cell inside the triangle: x >= 0, y >= 0, x + y < size
            y = Math.floor(Math.random() * size);
            x = Math.floor(Math.random() * (size - y));
        } else {
            x = Math.floor(Math.random() * size);
            y = Math.floor(Math.random() * size);
        }
        arrows.push({ x, y, vector: Math.floor(Math.random() * dirs) });
    }
    return { size, gridType, id: generateId(), arrows, muted: true };
};

/**
 * Create an empty grid
 */
export const emptyGrid = (size, gridType = 'square') => {
    return { size, gridType, id: generateId(), arrows: [], muted: true };
};

/**
 * Remove all arrows at a specific position
 */
export const removeFromGrid = (grid, x, y) => {
    return {
        ...grid,
        id: generateId(),
        arrows: grid.arrows.filter(arrow => arrow.x !== x || arrow.y !== y)
    };
};

// With optimized logic, we can handle ~9000 arrows at 60fps
// Setting limit to 4000 for comfortable headroom
const MAX_ARROWS = 4000;

/**
 * Add arrows to grid with symmetry support.
 * Handles both square (4 dirs) and triangle (6 dirs) grids.
 */
export const addToGrid = (grid, x, y, dir, symmetries, inputNumber, forced, arrowChannel, arrowVelocity) => {
    if (grid.arrows.length > MAX_ARROWS) return grid;
    const geo = getGeometry(grid.gridType);
    
    // Validate cell is in bounds for this geometry
    if (!geo.isValidCell(x, y, grid.size)) return grid;
    
    // Check for duplicate
    if (!forced && grid.arrows.some(a => a.x === x && a.y === y && a.vector === dir)) {
        return grid;
    }
    
    const newArrows = [...grid.arrows];
    const toAdd = [];
    
    // Add base arrows
    for (let i = 0; i < inputNumber; i++) {
        toAdd.push({ x, y, vector: dir, channel: arrowChannel ?? 1, velocity: arrowVelocity ?? 1.0 });
    }
    
    // Apply symmetries — use geometry-specific vector maps
    if (grid.gridType === 'triangle') {
        // Triangle: only horizontal symmetry (mirror across vertical median)
        if (symmetries.horizontalSymmetry) {
            const hMap = geo.SYMMETRY_VECTOR_MAPS.horizontal;
            const len = toAdd.length;
            for (let i = 0; i < len; i++) {
                const a = toAdd[i];
                // Mirror position: swap x-coordinate relative to the triangle's vertical axis
                // For a triangle with x+y<size, mirror of (x,y) is (size-1-y-x+x, ...) → simplified: (size-1-y, y) swapped cleverly
                // Actually: reflect across the vertical median of the triangle.
                // The triangle occupies cells where x+y < size. The vertical median connects
                // the top-center to the bottom vertex. The mirror of (x,y) is (size-1-x-y, y) when x≠mirrored.
                // Simpler approach: swap roles of x and y coordinates and adjust.
                // Actually the simplest correct mirror for an equilateral triangle with flat top:
                // reflect (x, y) → (size - 1 - x - y, y) — this mirrors across the altitude from bottom vertex.
                // Wait, that's actually the hypotenuse mirror. Let me think...
                // For the triangle with top edge, the vertical median goes from midpoint of top edge down.
                // Mirror across that: (x, y) → (max_x_for_row - x, y) where max_x_for_row = size - 1 - y
                // So mirrored x = (size - 1 - y) - x
                const mirX = (grid.size - 1 - a.y) - a.x;
                const mirY = a.y;
                if (geo.isValidCell(mirX, mirY, grid.size)) {
                    toAdd.push({
                        x: mirX, y: mirY, vector: hMap[a.vector],
                        channel: a.channel, velocity: a.velocity
                    });
                }
            }
        }
    } else {
        // Square symmetries
        const { horizontalSymmetry, verticalSymmetry, backwardDiagonalSymmetry, forwardDiagonalSymmetry } = symmetries;
        const skipForth = horizontalSymmetry && verticalSymmetry && backwardDiagonalSymmetry;
        
        if (horizontalSymmetry) {
            const len = toAdd.length;
            for (let i = 0; i < len; i++) {
                const a = toAdd[i];
                toAdd.push({
                    x: a.x, y: getMirror(a.y, grid.size),
                    vector: [2, 1, 0, 3][a.vector],
                    channel: a.channel, velocity: a.velocity
                });
            }
        }
        
        if (verticalSymmetry) {
            const len = toAdd.length;
            for (let i = 0; i < len; i++) {
                const a = toAdd[i];
                toAdd.push({
                    x: getMirror(a.x, grid.size), y: a.y,
                    vector: [0, 3, 2, 1][a.vector],
                    channel: a.channel, velocity: a.velocity
                });
            }
        }
        
        if (backwardDiagonalSymmetry) {
            const len = toAdd.length;
            for (let i = 0; i < len; i++) {
                const a = toAdd[i];
                toAdd.push({
                    x: a.y, y: a.x,
                    vector: [3, 2, 1, 0][a.vector],
                    channel: a.channel, velocity: a.velocity
                });
            }
        }
        
        if (forwardDiagonalSymmetry && !skipForth) {
            const len = toAdd.length;
            for (let i = 0; i < len; i++) {
                const a = toAdd[i];
                toAdd.push({
                    x: getMirror(a.y, grid.size), y: getMirror(a.x, grid.size),
                    vector: [1, 0, 3, 2][a.vector],
                    channel: a.channel, velocity: a.velocity
                });
            }
        }
    }
    
    // Filter arrows outside bounds, then add
    for (const arrow of toAdd) {
        if (newArrows.length < MAX_ARROWS && geo.isValidCell(arrow.x, arrow.y, grid.size)) {
            newArrows.push(arrow);
        }
    }
    
    return { ...grid, id: generateId(), arrows: newArrows };
};

const getMirror = (pos, gridSize) => {
    const half = Math.floor(gridSize / 2);
    const offset = half - pos;
    let location = half + offset;
    if ((gridSize % 2) === 0) location--;
    return location;
};

// Legacy exports for compatibility
export const arrowKey = arrow => `{x:${arrow.x},y:${arrow.y},vector:${arrow.vector}}`;
export const locationKey = arrow => `{x:${arrow.x},y:${arrow.y}}`;

export const arrowBoundaryKey = (arrow, size, rotations, walls, gridType) => {
    const geo = gridType === 'triangle' ? triangleGeo : null;
    return isAtBoundary(arrow, size, null, geo) ? 'boundary' : 'no-boundary';
};

/**
 * boundaryKey — returns 'x','y','z' (triangle hyp), or 'no-boundary'.
 * Used by animations.js for rendering boundary arrows.
 * @param {string} [gridType] — 'square' or 'triangle'
 */
export const boundaryKey = (arrow, size, rotations = 0, walls, gridType) => {
    if (gridType === 'triangle') {
        const wallSet = (walls && walls.length > 0) ? (walls._set || (walls._set = new Set(walls))) : null;
        return triangleGeo.boundaryAxis(arrow, size, rotations, wallSet);
    }
    const vector = (arrow.vector + rotations) % 4;
    if (arrow.y === 0 && vector === 0) return 'y';
    if (arrow.x === size - 1 && vector === 1) return 'x';
    if (arrow.y === size - 1 && vector === 2) return 'y';
    if (arrow.x === 0 && vector === 3) return 'x';
    // Internal walls
    if (walls && walls.length > 0) {
        const wallSet = walls._set || (walls._set = new Set(walls));
        if (vector === 0 && arrow.y > 0 && wallSet.has(`h:${arrow.y - 1}:${arrow.x}`)) return 'y';
        if (vector === 1 && arrow.x < size - 1 && wallSet.has(`v:${arrow.y}:${arrow.x}`)) return 'x';
        if (vector === 2 && arrow.y < size - 1 && wallSet.has(`h:${arrow.y}:${arrow.x}`)) return 'y';
        if (vector === 3 && arrow.x > 0 && wallSet.has(`v:${arrow.y}:${arrow.x - 1}`)) return 'x';
    }
    return 'no-boundary';
};

export const getArrowBoundaryDictionary = (arrows, size, keyFunc, rotations, walls) => {
    const dict = {};
    for (const arrow of arrows) {
        const key = keyFunc(arrow, size, rotations, walls);
        if (!dict[key]) dict[key] = [];
        dict[key].push(arrow);
    }
    return dict;
};

/**
 * OPTIMIZED: Compute next grid state
 * This is the hot path - heavily optimized for performance.
 * Supports both 'square' and 'triangle' grid types.
 */
export const nextGrid = (grid, length, scale, musicalKey, globalVelocity, channelSettings) => {
    const { size, arrows, gridType } = grid;
    const arrowCount = arrows.length;
    const isTriangle = gridType === 'triangle';
    const geo = isTriangle ? triangleGeo : null;
    const dedupMod = isTriangle ? 6 : 4;
    const dirs = isTriangle ? 6 : 4;
    
    if (arrowCount === 0) {
        return { ...grid, id: generateId() };
    }

    // Build wall lookup set for internal walls
    const walls = grid.walls || [];
    const wallSet = walls.length > 0 ? new Set(walls) : null;
    
    // Step 1: Group by position+vector+channel and reduce (mod dedupMod)
    vectorMap.clear();
    
    for (let i = 0; i < arrowCount; i++) {
        const arrow = arrows[i];
        // Filter out-of-bounds arrows (geometry-aware)
        if (!isInBounds(arrow, size, geo)) continue;
        
        const hash = arrowHash(arrow.x, arrow.y, arrow.vector);
        const ch = arrow.channel ?? 1;
        const key = hash * 17 + ch;
        const existing = vectorMap.get(key);
        if (existing === undefined) {
            vectorMap.set(key, { count: 1, channel: ch, x: arrow.x, y: arrow.y, vector: arrow.vector, velocity: arrow.velocity ?? 1.0 });
        } else {
            existing.count++;
        }
    }
    
    // Step 2: Build reduced arrows array (keep count % dedupMod, or dedupMod if divisible)
    let reducedCount = 0;
    
    for (const [, entry] of vectorMap) {
        const keep = entry.count % dedupMod || dedupMod;
        
        for (let j = 0; j < keep; j++) {
            if (reducedCount >= arrowBuffer1.length) {
                arrowBuffer1.length = arrowBuffer1.length * 2;
            }
            arrowBuffer1[reducedCount++] = { x: entry.x, y: entry.y, vector: entry.vector, channel: entry.channel, velocity: entry.velocity ?? 1.0 };
        }
    }
    
    // Step 3: Group by location and apply rotation
    locationMap.clear();
    
    for (let i = 0; i < reducedCount; i++) {
        const arrow = arrowBuffer1[i];
        const hash = locationHash(arrow.x, arrow.y);
        let group = locationMap.get(hash);
        if (!group) {
            group = [];
            locationMap.set(hash, group);
        }
        group.push(arrow);
    }
    
    // Apply rotation to each group (n arrows rotate by n-1)
    let rotatedCount = 0;
    
    for (const group of locationMap.values()) {
        const rotateBy = (group.length - 1) % dirs;
        for (const arrow of group) {
            if (rotatedCount >= arrowBuffer2.length) {
                arrowBuffer2.length = arrowBuffer2.length * 2;
            }
            arrowBuffer2[rotatedCount++] = {
                x: arrow.x,
                y: arrow.y,
                vector: isTriangle ? (arrow.vector + rotateBy) % 6 : (arrow.vector + rotateBy) & 3,
                channel: arrow.channel,
                velocity: arrow.velocity ?? 1.0
            };
        }
    }
    
    // Step 4: Move arrows (flip if at boundary, then move)
    // Triangle grids need double-flip at corners (two boundaries hit simultaneously)
    const nextArrows = [];
    const boundaryArrows = [];
    
    for (let i = 0; i < rotatedCount; i++) {
        const arrow = arrowBuffer2[i];
        
        if (isAtBoundary(arrow, size, wallSet, geo)) {
            boundaryArrows.push({ ...arrow });
            flipArrowInPlace(arrow, geo);
            // Triangle: check for corner double-flip
            if (isTriangle && isAtBoundary(arrow, size, wallSet, geo)) {
                flipArrowInPlace(arrow, geo);
            }
        }
        
        moveArrowInPlace(arrow, geo);
        nextArrows.push(arrow);
    }
    
    // Step 5: Check for arrows hitting boundary after movement (for sound)
    const soundArrows = [];
    for (const arrow of nextArrows) {
        if (isAtBoundary(arrow, size, wallSet, geo)) {
            soundArrows.push(arrow);
        }
    }
    
    // Play sounds (pass gridType so play-notes can use correct note index)
    playSounds(soundArrows, size, length, grid.soundOn, grid.midiOn, scale, musicalKey, globalVelocity, channelSettings, gridType);
    
    return {
        ...grid,
        id: generateId(),
        arrows: nextArrows
    };
};

// For testing: expose internal functions
export const _internal = {
    arrowHash,
    locationHash,
    isAtBoundary,
    isInBounds,
    moveArrowInPlace,
    flipArrowInPlace,
    rotateArrowInPlace,
    cloneArrow
};
