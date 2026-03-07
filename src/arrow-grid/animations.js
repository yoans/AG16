import p5 from 'p5';
import {
    BOUNDARY,
    NO_BOUNDARY,
    getArrowBoundaryDictionary,
    locationKey,
    arrowBoundaryKey,
    boundaryKey
} from './arrows-logic';
import { getGeometry } from './geometry';
import * as triangleGeo from './geometry/triangle';
import * as squareGeo from './geometry/square';

let stateDrawing;
let previousTime;

// Elastic pause: when paused, arrows decelerate to rest instead of snapping
let pauseEaseFrom = 0;     // percentage captured at moment of pause
let pauseEaseStart = 0;    // timestamp when pause happened
const PAUSE_EASE_MS = 180; // duration of deceleration (ms)

// Collision burst particles
let particles = [];
let lastBurstStep = -1;
const spawnBurst = (cx, cy, cellSz, channel) => {
    const count = 8;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = cellSz * (0.6 + Math.random() * 0.5);
        particles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            decay: 0.02 + Math.random() * 0.02,
            size: cellSz * (0.15 + Math.random() * 0.2),
            channel: channel ?? 0
        });
    }
};

let mouseX = 1;
let mouseY = 1;
let mouseXstart = 1;
let mouseYstart = 1;
let cellSize = 1;
let thisArrowAdder = () => {};
let thisWallToggler = () => {};
let thisWallPlacer = () => {};
let thisWallRemover = () => {};
let mouseIsPressed;
let gridCanvasSize = 320;
const gridCanvasBorderSize = 2;
let sketchInstance = null;

// Theme colors — channel-based
import { getChannelColor, getChannelPreviewColor, getChannelParticleColor } from './channels';

const wallColor = [102, 126, 234, 220]; // fallback
const getWallColor = () => {
    if (stateDrawing && stateDrawing.arrowChannel) {
        const c = getChannelParticleColor(stateDrawing.arrowChannel);
        return [c[0], c[1], c[2], 220];
    }
    return wallColor;
};

// Map arrow.noteLength (ms) to a visual "fill fraction" 0.0–1.0
// Short notes (32nd = 63ms) → small inner mark, long notes → full fill
const NOTE_LENGTH_MIN = 63;
const NOTE_LENGTH_MAX = 4000;
const getNoteLengthFraction = (noteLengthMs) => {
    if (!noteLengthMs) return 0.5; // default for arrows without noteLength
    const clamped = Math.max(NOTE_LENGTH_MIN, Math.min(NOTE_LENGTH_MAX, noteLengthMs));
    return Math.log(clamped / NOTE_LENGTH_MIN) / Math.log(NOTE_LENGTH_MAX / NOTE_LENGTH_MIN);
};

const getArrowColor = (channel, velocity) => {
    return getChannelColor(channel, velocity);
};
const getPreviewColor = () => {
    if (stateDrawing && stateDrawing.arrowChannel) {
        return getChannelPreviewColor(stateDrawing.arrowChannel);
    }
    return getChannelPreviewColor(1);
};
const getParticleColor = (channel) => {
    return getChannelParticleColor(channel);
};
const convertPixelToIndex = pixel => Math.floor(
    (pixel - gridCanvasBorderSize) / cellSize
);

/** Convert pixel to cell for the current grid geometry */
const convertPixelToCell = (px, py) => {
    if (stateDrawing && stateDrawing.grid && stateDrawing.grid.gridType === 'triangle') {
        return triangleGeo.pixelToCell(px, py, cellSize, gridCanvasBorderSize);
    }
    return { x: convertPixelToIndex(px), y: convertPixelToIndex(py) };
};

/** Check if cell coords are valid for current grid */
const isCellInBounds = (cx, cy) => {
    if (!stateDrawing || !stateDrawing.grid) return false;
    const geo = getGeometry(stateDrawing.grid.gridType);
    return geo.isValidCell(cx, cy, stateDrawing.grid.size);
};

// const nat = () => chance.natural({
//     min: 0,
//     max: 255,
// });
const mouseIsInSketch = () => mouseX > 0 + gridCanvasBorderSize &&
        mouseX < gridCanvasSize - gridCanvasBorderSize &&
        mouseY > 0 + gridCanvasBorderSize &&
        mouseY < gridCanvasSize - gridCanvasBorderSize
    ;

const isLandscapePhoneViewport = () => window.innerWidth > window.innerHeight && window.innerHeight <= 500;

const isSliderPopupOpen = () => {
    if (!stateDrawing) return false;
    return stateDrawing.activePopup === 'speed'
        || stateDrawing.activePopup === 'gridSize'
    || stateDrawing.activePopup === 'arrowVol'
    || stateDrawing.activePopup === 'masterVol'
        || typeof stateDrawing.activePopup === 'number';
};

const shouldBlockCanvasInputForSlider = () => isLandscapePhoneViewport() && isSliderPopupOpen();

export const getAdderWithMousePosition = (arrowAdder) => (e) => {
    thisArrowAdder = arrowAdder;
    if (mouseIsInSketch()) {
        const cell = convertPixelToCell(mouseX, mouseY);
        arrowAdder(cell.x, cell.y, e);
    } else {
    }
};
export const setWallToggler = (wallToggler) => {
    thisWallToggler = wallToggler;
};
export const setWallPlacer = (wallPlacer) => {
    thisWallPlacer = wallPlacer;
};
export const setWallRemover = (wallRemover) => {
    thisWallRemover = wallRemover;
};

/**
 * Given pixel coordinates on the canvas, find the nearest internal cell edge.
 * Returns a wall key like "h:y:x" or "v:y:x", or null if no valid edge.
 * "h:y:x" = horizontal wall on the BOTTOM edge of cell (x,y)
 * "v:y:x" = vertical wall on the RIGHT edge of cell (x,y)
 */
const nearestWallEdge = (px, py, gridSize) => {
    const cs = (gridCanvasSize * 1.0) / (1.0 * gridSize);
    // Position relative to grid interior
    const gx = px - gridCanvasBorderSize;
    const gy = py - gridCanvasBorderSize;
    // Cell indices (float)
    const fx = gx / cs;
    const fy = gy / cs;
    // Integer cell
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    // Fractional position within cell [0..1)
    const dx = fx - cx;
    const dy = fy - cy;
    // Distance to each edge of THIS cell
    const distTop = dy;
    const distBottom = 1 - dy;
    const distLeft = dx;
    const distRight = 1 - dx;
    const edgeThreshold = 0.35; // how close to edge counts
    const candidates = [];
    // Top edge → horizontal wall above this cell = bottom of cell (cx, cy-1)
    if (distTop < edgeThreshold && cy > 0) candidates.push({ dist: distTop, key: `h:${cy - 1}:${cx}` });
    // Bottom edge → horizontal wall below this cell
    if (distBottom < edgeThreshold && cy < gridSize - 1) candidates.push({ dist: distBottom, key: `h:${cy}:${cx}` });
    // Left edge → vertical wall left of this cell = right of cell (cx-1, cy)
    if (distLeft < edgeThreshold && cx > 0) candidates.push({ dist: distLeft, key: `v:${cy}:${cx - 1}` });
    // Right edge → vertical wall right of this cell
    if (distRight < edgeThreshold && cx < gridSize - 1) candidates.push({ dist: distRight, key: `v:${cy}:${cx}` });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].key;
};

/** Geometry-aware nearest wall edge */
const nearestWallEdgeGeo = (px, py, gridSize) => {
    if (stateDrawing && stateDrawing.grid && stateDrawing.grid.gridType === 'triangle') {
        return triangleGeo.nearestWallEdge(px, py, gridSize, gridCanvasSize, gridCanvasBorderSize, cellSize);
    }
    return nearestWallEdge(px, py, gridSize);
};
export const setUpCanvas = (state) => {
    stateDrawing = state;
    previousTime = new Date();
    const triangleDrawingArray = [
        (topLeft, cellSize, sketch) => sketch.triangle(
            topLeft.x + (cellSize / 2.0), topLeft.y,
            topLeft.x + cellSize, topLeft.y + cellSize,
            topLeft.x, topLeft.y + cellSize
        ),
        (topLeft, cellSize, sketch) => sketch.triangle(
            topLeft.x, topLeft.y,
            topLeft.x + cellSize, topLeft.y + (cellSize / 2.0),
            topLeft.x, topLeft.y + cellSize
        ),
        (topLeft, cellSize, sketch) => sketch.triangle(
            topLeft.x, topLeft.y,
            topLeft.x + cellSize, topLeft.y,
            topLeft.x + (cellSize / 2.0), topLeft.y + cellSize
        ),
        (topLeft, cellSize, sketch) => sketch.triangle(
            topLeft.x + cellSize, topLeft.y,
            topLeft.x + cellSize, topLeft.y + cellSize,
            topLeft.x, topLeft.y + (cellSize / 2.0)
        )
    ];
    const triangleRotatingArray = [

        (cellSize, sketch, percentage) => sketch.triangle(
            cellSize / 2.0, -(cellSize * percentage),
            cellSize, cellSize - (cellSize * percentage),
            0, cellSize - (cellSize * percentage)
        ),
        (cellSize, sketch, percentage) => sketch.triangle(
            0 + cellSize * percentage, cellSize - (cellSize * percentage),
            (cellSize / 2) + (cellSize * percentage * 1.5), 0.5 * cellSize * percentage,
            cellSize, cellSize
        ),
        (cellSize, sketch, percentage) => sketch.quad(
            0, cellSize,
            cellSize / 2, cellSize * percentage,
            cellSize, cellSize,
            cellSize / 2, cellSize + cellSize * percentage),
        (cellSize, sketch, percentage) => sketch.triangle(
            0, cellSize,
            (cellSize / 2) - (1.5 * cellSize * percentage), 0.5 * cellSize * percentage,
            cellSize - (cellSize * percentage), cellSize - (cellSize * percentage))
    ];
    const translateAndRotate = (topLeft, sketch, vector, cellSize) => {
        const xShift = vector === 1 || vector === 2 ? cellSize : 0;
        const yShift = vector === 2 || vector === 3 ? cellSize : 0;
        sketch.translate(topLeft.x + xShift, topLeft.y + yShift);
        sketch.angleMode(sketch.DEGREES);
        sketch.rotate(90 * vector);
    };
    const timeShift = ({ x, y }, vector, shiftAmount) => {
        const shifted = [
            { x, y: y - shiftAmount },
            { x: x + shiftAmount, y },
            { x, y: y + shiftAmount },
            { x: x - shiftAmount, y },
        ];
        return shifted[vector];
    };

    const drawingContext = (sketch) => {
        sketchInstance = sketch;
        // Persistent state across frames (must NOT be inside sketch.draw)
        let lastClickTime = 0;
        let lastDragWall = null;

        // eslint-disable-next-line no-param-reassign
        sketch.setup = () => {
            sketch.createCanvas(gridCanvasSize + gridCanvasBorderSize * 2, gridCanvasSize + gridCanvasBorderSize * 2).parent('sketch-holder').id('arrows-animation');
            
            // ── Event handlers (set once in setup, not every frame) ──
            const handleCanvasClick = (e, fromTouch) => {
                if (shouldBlockCanvasInputForSlider()) return;
                // Update mouse state from sketch at event time
                mouseX = sketch.mouseX;
                mouseY = sketch.mouseY;
                mouseIsPressed = sketch.mouseIsPressed;
                // Debounce double-fires from p5 event system
                const now = Date.now();
                if (now - lastClickTime < 100) return;
                lastClickTime = now;
                mouseXstart=mouseX;
                mouseYstart=mouseY;
                if (fromTouch && !mouseIsPressed) return;
                if (!mouseIsInSketch()) return;
                // Block canvas interaction when a modal/overlay is open
                if (stateDrawing.showSaveManager || stateDrawing.showIntro || stateDrawing.showInfo || stateDrawing.showPrivacy) return;
                if (stateDrawing.deleting) {
                    // Erase mode: remove based on eraseTarget
                    const target = stateDrawing.eraseTarget || 'both';
                    if (target === 'arrows' || target === 'both') {
                        const cell = convertPixelToCell(mouseX, mouseY);
                        thisArrowAdder(cell.x, cell.y, e, true);
                    }
                    if (target === 'walls' || target === 'both') {
                        const wallKey = nearestWallEdgeGeo(mouseX, mouseY, stateDrawing.grid.size);
                        if (wallKey) thisWallRemover(wallKey);
                    }
                } else if (stateDrawing.drawMode === 'wall') {
                    if (!stateDrawing.wallClosest && stateDrawing.wallSides && stateDrawing.wallSides.size > 0) {
                        // Specific side(s) mode: place walls on all selected sides of the clicked cell
                        const cell = convertPixelToCell(mouseX, mouseY);
                        if (isCellInBounds(cell.x, cell.y)) {
                            thisWallPlacer(cell.x, cell.y, stateDrawing.wallSides);
                        }
                    } else {
                        // Closest mode: toggle nearest edge
                        const wallKey = nearestWallEdgeGeo(mouseX, mouseY, stateDrawing.grid.size);
                        if (wallKey) thisWallToggler(wallKey);
                    }
                } else {
                    const cell = convertPixelToCell(mouseX, mouseY);
                    thisArrowAdder(cell.x, cell.y, e, true);
                }
            }
            const setMouseStart = (e) => handleCanvasClick(e, false);
            const setTouchStart = (e) => handleCanvasClick(e, true);
            const sameAsStart = ()=>{
                const cell = convertPixelToCell(mouseX, mouseY);
                const cellStart = convertPixelToCell(mouseXstart, mouseYstart);
                return cellStart.x === cell.x && cellStart.y === cell.y;
            };
            const setMouseEnd = (e) => {
                mouseXstart=-1000;
                mouseYstart=-1000;
                lastDragWall = null;
            }
            
            sketch.touchStarted = setTouchStart;
            sketch.touchEnded = setMouseEnd;
            sketch.mousePressed = setMouseStart;
            sketch.mouseReleased = setMouseEnd;

            // Prevent page scrolling ONLY when touching/dragging on the canvas
            const canvasEl = document.getElementById('arrows-animation');
            if (canvasEl) {
                canvasEl.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
                canvasEl.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
            }

            const onDrag = (e) =>{
                if (shouldBlockCanvasInputForSlider()) return;
                // Block canvas interaction when a modal/overlay is open
                if (stateDrawing.showSaveManager || stateDrawing.showIntro || stateDrawing.showInfo || stateDrawing.showPrivacy) return;
                if(mouseIsPressed && mouseIsInSketch()){
                    if (stateDrawing.deleting) {
                        // Erase mode on drag: remove based on eraseTarget
                        const target = stateDrawing.eraseTarget || 'both';
                        if (target === 'arrows' || target === 'both') {
                            if (!sameAsStart()) {
                                const cell = convertPixelToCell(mouseX, mouseY);
                                thisArrowAdder(cell.x, cell.y, e);
                            }
                        }
                        if (target === 'walls' || target === 'both') {
                            const wallKey = nearestWallEdgeGeo(mouseX, mouseY, stateDrawing.grid.size);
                            if (wallKey && wallKey !== lastDragWall) {
                                lastDragWall = wallKey;
                                thisWallRemover(wallKey);
                            }
                        }
                        if (e.preventDefault) e.preventDefault();
                    } else if (stateDrawing.drawMode === 'wall') {
                        if (!stateDrawing.wallClosest && stateDrawing.wallSides && stateDrawing.wallSides.size > 0) {
                            const cell = convertPixelToCell(mouseX, mouseY);
                            if (isCellInBounds(cell.x, cell.y)) {
                                const dragKey = `sides:${cell.x}:${cell.y}`;
                                if (dragKey !== lastDragWall) {
                                    lastDragWall = dragKey;
                                    thisWallPlacer(cell.x, cell.y, stateDrawing.wallSides);
                                }
                            }
                            if (e.preventDefault) e.preventDefault();
                        } else {
                            const wallKey = nearestWallEdgeGeo(mouseX, mouseY, stateDrawing.grid.size);
                            if (wallKey && wallKey !== lastDragWall) {
                                lastDragWall = wallKey;
                                thisWallToggler(wallKey);
                            }
                            if (e.preventDefault) e.preventDefault();
                        }
                    } else if (!sameAsStart()) {
                        const cell = convertPixelToCell(mouseX, mouseY);
                        thisArrowAdder(cell.x, cell.y, e);
                        e.preventDefault()
                    }
                }
            }
            sketch.mouseDragged = onDrag;
            sketch.touchMoved = onDrag;
        };
        // eslint-disable-next-line no-param-reassign
        sketch.draw = () => {
            mouseX = sketch.mouseX;
            mouseY = sketch.mouseY;
            mouseIsPressed = sketch.mouseIsPressed;
            
            const isTriangleMode = stateDrawing.grid.gridType === 'triangle';
            const geo = getGeometry(stateDrawing.grid.gridType);
            const gridType = stateDrawing.grid.gridType || 'square';
            
            // draw grid background & border
            sketch.push();
            sketch.strokeWeight(0);
            sketch.fill(18, 18, 31, 255); // --bg-card match
            if (isTriangleMode) {
                // Triangular background
                const cw = gridCanvasSize + gridCanvasBorderSize * 2;
                const ch = gridCanvasSize + gridCanvasBorderSize * 2;
                sketch.triangle(
                    cw / 2, gridCanvasBorderSize,                    // top-center... actually flat-top triangle
                    gridCanvasBorderSize, gridCanvasBorderSize,       // top-left
                    cw - gridCanvasBorderSize, gridCanvasBorderSize   // top-right
                );
                // For a flat-top equilateral triangle pointing down:
                sketch.rect(gridCanvasBorderSize, gridCanvasBorderSize, gridCanvasSize, gridCanvasSize);
            } else {
                sketch.rect(gridCanvasBorderSize, gridCanvasBorderSize, gridCanvasSize, gridCanvasSize);
            }
            sketch.noFill();
            sketch.strokeWeight(gridCanvasBorderSize*2);
            const wc = getWallColor();
            sketch.stroke(wc[0], wc[1], wc[2], 100); // channel-colored border
            if (isTriangleMode) {
                // Draw triangular border
                const b = gridCanvasBorderSize;
                const sz = stateDrawing.grid.size;
                cellSize = (gridCanvasSize * 1.0) / (1.0 * sz);
                const triW = sz * cellSize;
                const triH = sz * cellSize * (Math.sqrt(3) / 2);
                sketch.triangle(
                    b, b,                           // top-left
                    b + triW, b,                    // top-right
                    b + triW / 2, b + triH          // bottom-center
                );
            } else {
                sketch.rect(0, 0, gridCanvasSize+gridCanvasBorderSize*2, gridCanvasSize+gridCanvasBorderSize*2);
            }
            sketch.pop();

            //draw grid lines / markers
            cellSize = (gridCanvasSize * 1.0) / (1.0 * stateDrawing.grid.size);
            sketch.push();
            sketch.stroke(255, 255, 255, 20); // Subtle white lines
            sketch.strokeWeight(1);
            if (isTriangleMode) {
                // Draw hexagon markers at each valid cell
                const sz = stateDrawing.grid.size;
                sketch.noStroke();
                sketch.fill(255, 255, 255, 15);
                const markerR = cellSize * 0.2;
                for (let y = 0; y < sz; y++) {
                    for (let x = 0; x < sz - y; x++) {
                        const cp = triangleGeo.cellToPixel(x, y, cellSize, gridCanvasBorderSize);
                        const cx = cp.px + cellSize / 2;
                        const cy = cp.py + cellSize * (Math.sqrt(3) / 2) / 3;
                        triangleGeo.drawHexMarker(sketch, cx, cy, markerR);
                    }
                }
            } else {
                for (var i=1; i<stateDrawing.grid.size; i++) {
                    // horizontal
                    sketch.line(1+gridCanvasBorderSize, 1+gridCanvasBorderSize + i * cellSize, gridCanvasSize, 1 + i * cellSize);
                    // vertical
                    sketch.line(1+gridCanvasBorderSize + i * cellSize, 1+gridCanvasBorderSize, 1 + i * cellSize, gridCanvasSize,);
                }
            }
            sketch.pop();

            // Draw internal walls
            const walls = stateDrawing.grid.walls || [];
            if (walls.length > 0) {
                sketch.push();
                const wc = getWallColor();
                sketch.stroke(wc[0], wc[1], wc[2], 220); // channel-colored walls
                sketch.strokeWeight(gridCanvasBorderSize * 1.5);
                sketch.strokeCap(sketch.SQUARE);
                if (isTriangleMode) {
                    // Triangle wall rendering
                    const sz = stateDrawing.grid.size;
                    const SQRT3_2 = Math.sqrt(3) / 2;
                    for (const wallKey of walls) {
                        const parts = wallKey.split(':');
                        const type = parts[0];
                        const wy = parseInt(parts[1]);
                        const wx = parseInt(parts[2]);
                        const cp = triangleGeo.cellToPixel(wx, wy, cellSize, gridCanvasBorderSize);
                        const cx = cp.px;
                        const cy = cp.py;
                        if (type === 'r') {
                            // Right edge: wall between (wx,wy) and (wx+1,wy)
                            sketch.line(cx + cellSize, cy, cx + cellSize / 2, cy + cellSize * SQRT3_2);
                        } else if (type === 'br') {
                            // Bottom-right: wall between (wx,wy) and (wx,wy+1)
                            sketch.line(cx + cellSize / 2, cy + cellSize * SQRT3_2, cx, cy + cellSize * SQRT3_2); // approximation
                        } else if (type === 'bl') {
                            // Bottom-left: diagonal edge
                            sketch.line(cx, cy, cx + cellSize / 2, cy + cellSize * SQRT3_2);
                        }
                    }
                } else {
                    for (const wallKey of walls) {
                        const parts = wallKey.split(':');
                        const type = parts[0];
                        const wy = parseInt(parts[1]);
                        const wx = parseInt(parts[2]);
                        if (type === 'h') {
                            const px = gridCanvasBorderSize + wx * cellSize;
                            const py = gridCanvasBorderSize + (wy + 1) * cellSize;
                            sketch.line(px, py, px + cellSize, py);
                        } else {
                            const px = gridCanvasBorderSize + (wx + 1) * cellSize;
                            const py = gridCanvasBorderSize + wy * cellSize;
                            sketch.line(px, py, px, py + cellSize);
                        }
                    }
                }
                sketch.pop();
            }

            // Draw hover previews based on draw mode
            if (mouseIsInSketch() && !stateDrawing.deleting) {
                const hoverCell = convertPixelToCell(mouseX, mouseY);
                const hoverCellX = hoverCell.x;
                const hoverCellY = hoverCell.y;
                const inBounds = isCellInBounds(hoverCellX, hoverCellY);
                const sz = stateDrawing.grid.size;

                // Symmetry mirror helper
                const mirrorPos = (pos) => {
                    const half = Math.floor(sz / 2);
                    const offset = half - pos;
                    let loc = half + offset;
                    if ((sz % 2) === 0) loc--;
                    return loc;
                };

                // Compute all symmetry-mirrored placements of {x, y, dir/sides}
                const getSymmetricPlacements = (ox, oy, data, flipMaps) => {
                    // data is either { dir } for arrows or { sides } for walls
                    let placements = [{ x: ox, y: oy, ...data }];
                    const hs = stateDrawing.horizontalSymmetry;
                    const vs = stateDrawing.verticalSymmetry;
                    const bd = stateDrawing.backwardDiagonalSymmetry;
                    const fd = stateDrawing.forwardDiagonalSymmetry;
                    const skipForth = hs && vs && bd;

                    if (hs) {
                        const len = placements.length;
                        for (let i = 0; i < len; i++) {
                            const p = placements[i];
                            placements.push({ x: p.x, y: mirrorPos(p.y), ...(flipMaps.h(p)) });
                        }
                    }
                    if (vs) {
                        const len = placements.length;
                        for (let i = 0; i < len; i++) {
                            const p = placements[i];
                            placements.push({ x: mirrorPos(p.x), y: p.y, ...(flipMaps.v(p)) });
                        }
                    }
                    if (bd) {
                        const len = placements.length;
                        for (let i = 0; i < len; i++) {
                            const p = placements[i];
                            placements.push({ x: p.y, y: p.x, ...(flipMaps.bd(p)) });
                        }
                    }
                    if (fd && !skipForth) {
                        const len = placements.length;
                        for (let i = 0; i < len; i++) {
                            const p = placements[i];
                            placements.push({ x: mirrorPos(p.y), y: mirrorPos(p.x), ...(flipMaps.fd(p)) });
                        }
                    }
                    return placements;
                };

                // Helper to draw a wall line for a given cell+side
                const drawWallPreviewLine = (cx, cy, side) => {
                    if (side === 'top' && cy > 0) {
                        const px = gridCanvasBorderSize + cx * cellSize;
                        const py = gridCanvasBorderSize + cy * cellSize;
                        sketch.line(px, py, px + cellSize, py);
                    }
                    if (side === 'bottom' && cy < sz - 1) {
                        const px = gridCanvasBorderSize + cx * cellSize;
                        const py = gridCanvasBorderSize + (cy + 1) * cellSize;
                        sketch.line(px, py, px + cellSize, py);
                    }
                    if (side === 'left' && cx > 0) {
                        const px = gridCanvasBorderSize + cx * cellSize;
                        const py = gridCanvasBorderSize + cy * cellSize;
                        sketch.line(px, py, px, py + cellSize);
                    }
                    if (side === 'right' && cx < sz - 1) {
                        const px = gridCanvasBorderSize + (cx + 1) * cellSize;
                        const py = gridCanvasBorderSize + cy * cellSize;
                        sketch.line(px, py, px, py + cellSize);
                    }
                };

                if (stateDrawing.drawMode === 'wall') {
                    const flipH  = { top:'bottom', bottom:'top', left:'left',  right:'right' };
                    const flipV  = { top:'top',    bottom:'bottom', left:'right', right:'left' };
                    const flipBD = { top:'left',   bottom:'right',  left:'top',   right:'bottom' };
                    const flipFD = { top:'right',  bottom:'left',   left:'bottom', right:'top' };
                    const wallFlips = {
                        h:  (p) => ({ sides: p.sides.map(s => flipH[s]) }),
                        v:  (p) => ({ sides: p.sides.map(s => flipV[s]) }),
                        bd: (p) => ({ sides: p.sides.map(s => flipBD[s]) }),
                        fd: (p) => ({ sides: p.sides.map(s => flipFD[s]) }),
                    };

                    if (!stateDrawing.wallClosest && stateDrawing.wallSides && stateDrawing.wallSides.size > 0 && inBounds) {
                        const baseSides = [...stateDrawing.wallSides];
                        const placements = getSymmetricPlacements(hoverCellX, hoverCellY, { sides: baseSides }, wallFlips);
                        sketch.push();
                        const wcp = getWallColor();
                        sketch.stroke(wcp[0], wcp[1], wcp[2], 80);
                        sketch.strokeWeight(gridCanvasBorderSize * 1.5);
                        sketch.strokeCap(sketch.SQUARE);
                        for (const p of placements) {
                            if (p.x >= 0 && p.x < sz && p.y >= 0 && p.y < sz) {
                                for (const side of p.sides) {
                                    drawWallPreviewLine(p.x, p.y, side);
                                }
                            }
                        }
                        sketch.pop();
                    } else {
                        // Closest mode: preview nearest edge + symmetry mirrors
                        const previewKey = nearestWallEdge(mouseX, mouseY, stateDrawing.grid.size);
                        if (previewKey) {
                            const parts = previewKey.split(':');
                            const type = parts[0];
                            const wy = parseInt(parts[1]);
                            const wx = parseInt(parts[2]);
                            // Convert to cell+side
                            let baseSide;
                            let baseCX = wx, baseCY = wy;
                            if (type === 'h') { baseSide = 'bottom'; }
                            else { baseSide = 'right'; }
                            const placements = getSymmetricPlacements(baseCX, baseCY, { sides: [baseSide] }, wallFlips);
                            sketch.push();
                            const wcc = getWallColor();
                            sketch.stroke(wcc[0], wcc[1], wcc[2], 80);
                            sketch.strokeWeight(gridCanvasBorderSize * 1.5);
                            sketch.strokeCap(sketch.SQUARE);
                            for (const p of placements) {
                                if (p.x >= 0 && p.x < sz && p.y >= 0 && p.y < sz) {
                                    for (const side of p.sides) {
                                        drawWallPreviewLine(p.x, p.y, side);
                                    }
                                }
                            }
                            sketch.pop();
                        }
                    }
                } else if (stateDrawing.drawMode === 'arrow' && inBounds) {
                    // Arrow mode: show ghost arrow preview with symmetry
                    if (isTriangleMode) {
                        // Triangle mode: 6 directions, no symmetry preview for now (just the base arrow)
                        const dir = stateDrawing.inputDirection;
                        sketch.push();
                        sketch.strokeWeight(0);
                        sketch.fill(...getPreviewColor());
                        const cp = triangleGeo.cellToPixel(hoverCellX, hoverCellY, cellSize, gridCanvasBorderSize);
                        const cx = cp.px + cellSize / 2;
                        const cy = cp.py + cellSize * (Math.sqrt(3) / 2) / 3;
                        triangleGeo.drawTriangleArrow(sketch, cx, cy, cellSize, dir);
                        // Horizontal symmetry mirror
                        if (stateDrawing.horizontalSymmetry) {
                            const mirX = (sz - 1 - hoverCellY) - hoverCellX;
                            const mirY = hoverCellY;
                            if (geo.isValidCell(mirX, mirY, sz)) {
                                const mcp = triangleGeo.cellToPixel(mirX, mirY, cellSize, gridCanvasBorderSize);
                                const mcx = mcp.px + cellSize / 2;
                                const mcy = mcp.py + cellSize * (Math.sqrt(3) / 2) / 3;
                                triangleGeo.drawTriangleArrow(sketch, mcx, mcy, cellSize, triangleGeo.SYMMETRY_VECTOR_MAPS.horizontal[dir]);
                            }
                        }
                        sketch.pop();
                    } else {
                        // Square mode: 4 directions with full symmetry preview
                        const arrowFlips = {
                            h:  (p) => ({ dir: [2, 1, 0, 3][p.dir] }),
                            v:  (p) => ({ dir: [0, 3, 2, 1][p.dir] }),
                            bd: (p) => ({ dir: [3, 2, 1, 0][p.dir] }),
                            fd: (p) => ({ dir: [1, 0, 3, 2][p.dir] }),
                        };
                        const dir = stateDrawing.inputDirection;
                        const placements = getSymmetricPlacements(hoverCellX, hoverCellY, { dir }, arrowFlips);
                        sketch.push();
                        sketch.strokeWeight(0);
                        sketch.fill(...getPreviewColor());
                        for (const p of placements) {
                            if (p.x >= 0 && p.x < sz && p.y >= 0 && p.y < sz) {
                                const topLeft = {
                                    x: gridCanvasBorderSize + p.x * cellSize,
                                    y: gridCanvasBorderSize + p.y * cellSize
                                };
                                triangleDrawingArray[p.dir](topLeft, cellSize, sketch);
                            }
                        }
                        sketch.pop();
                    }
                }
            }

            const convertIndexToPixel = index => (index * cellSize) + gridCanvasBorderSize;
            const convertArrowToTopLeft = xy => (
                {
                    x: convertIndexToPixel(xy.x),
                    y: convertIndexToPixel(xy.y)
                }
            );
            /** Get cell-center pixel position (geometry-aware) */
            const convertArrowToCenter = (arrow) => {
                if (isTriangleMode) {
                    const cp = triangleGeo.cellToPixel(arrow.x, arrow.y, cellSize, gridCanvasBorderSize);
                    return { x: cp.px + cellSize / 2, y: cp.py + cellSize * (Math.sqrt(3) / 2) / 3 };
                }
                return { x: convertIndexToPixel(arrow.x) + cellSize / 2, y: convertIndexToPixel(arrow.y) + cellSize / 2 };
            };
            const timeDiff = new Date().getTime() - previousTime.getTime();
            let percentage;
            if (stateDrawing.playing) {
                const possiblePercentage = timeDiff / (1.0 * stateDrawing.noteLength);
                percentage = Math.min(possiblePercentage, 1);
            } else if (pauseEaseFrom > 0) {
                // Elastic ease-out: decelerate from paused position to rest
                const elapsed = new Date().getTime() - pauseEaseStart;
                const t = Math.min(elapsed / PAUSE_EASE_MS, 1);
                // Cubic ease-out for natural inertia feel
                const ease = 1 - Math.pow(1 - t, 3);
                percentage = pauseEaseFrom * (1 - ease);
                if (t >= 1) pauseEaseFrom = 0;
            } else {
                percentage = 0;
            }
            const boundaryDictionary = getArrowBoundaryDictionary(
                stateDrawing.grid.arrows || [],
                stateDrawing.grid.size,
                (arrow, size, rotations, walls) => boundaryKey(arrow, size, rotations, walls, gridType),
                undefined,
                stateDrawing.grid.walls || []
            );
            const boundaryDictionaryX = boundaryDictionary['x'] || [];
            const boundaryDictionaryY = boundaryDictionary['y'] || [];
            const boundaryDictionaryZ = boundaryDictionary['z'] || [];  // triangle hypotenuse
            // Spawn burst particles at wall collisions at start of new grid step
            if (stateDrawing.playing && stateDrawing.showCollisions && lastBurstStep !== stateDrawing.gridStep) {
                lastBurstStep = stateDrawing.gridStep;
                // Cap total particles to avoid lag at high speed
                if (particles.length < 300) {
                // Since arrows have already bounced, find arrows that just came FROM a wall
                // i.e., arrows at edge cells pointing inward (they were flipped)
                const allBoundary = [...boundaryDictionaryX, ...boundaryDictionaryY, ...boundaryDictionaryZ];
                allBoundary.forEach((arrow) => {
                    if (isTriangleMode) {
                        // Triangle mode: position burst at cell center
                        const center = convertArrowToCenter(arrow);
                        spawnBurst(center.x, center.y, cellSize, arrow.channel);
                    } else {
                        // Square mode
                        let bx = convertIndexToPixel(arrow.x) + cellSize / 2;
                        let by = convertIndexToPixel(arrow.y) + cellSize / 2;
                        // Shift burst toward the wall the arrow is heading to
                        if (arrow.vector === 0) by = convertIndexToPixel(arrow.y);          // top wall
                        if (arrow.vector === 2) by = convertIndexToPixel(arrow.y) + cellSize; // bottom wall
                        if (arrow.vector === 3) bx = convertIndexToPixel(arrow.x);          // left wall
                        if (arrow.vector === 1) bx = convertIndexToPixel(arrow.x) + cellSize; // right wall
                        spawnBurst(bx, by, cellSize, arrow.channel);
                    }
                });
                }
            }

            // Update and draw particles
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx * 0.12;
                p.y += p.vy * 0.12;
                p.vx *= 0.92;
                p.vy *= 0.92;
                p.life -= p.decay;
                if (p.life <= 0) {
                    particles.splice(i, 1);
                    continue;
                }
                sketch.push();
                sketch.noStroke();
                const alpha = p.life * 180;
                const pc = getParticleColor(p.channel);
                sketch.fill(pc[0], pc[1], pc[2], alpha);
                sketch.ellipse(p.x, p.y, p.size * p.life, p.size * p.life);
                sketch.pop();
            }
            // draw arrows

            const arrowLocationDictionary = getArrowBoundaryDictionary(
                stateDrawing.grid.arrows,
                stateDrawing.grid.size,
                locationKey
            );

            // non-rotated arrows
            const arrowsToNotRotateDictionary = Object.keys(arrowLocationDictionary).reduce(
                (acc, location) => (
                    arrowLocationDictionary[location].length === 1 ?
                        [
                            ...acc,
                            ...arrowLocationDictionary[location],
                        ] :
                        acc
                ),
                []
            );
            // non-wall Arrows
            const arrowDictionary = getArrowBoundaryDictionary(
                arrowsToNotRotateDictionary,
                stateDrawing.grid.size,
                (arrow, size, rotations, walls) => arrowBoundaryKey(arrow, size, rotations, walls, gridType),
                undefined,
                stateDrawing.grid.walls || []
            );
            (arrowDictionary[NO_BOUNDARY] || []).map((arrow) => {
                sketch.push();
                sketch.strokeWeight(0);
                sketch.fill(...getArrowColor(arrow.channel, arrow.velocity));
                if (isTriangleMode) {
                    const center = convertArrowToCenter(arrow);
                    const shifted = triangleGeo.animationShift(center, arrow.vector, percentage, cellSize);
                    triangleGeo.drawTriangleArrow(sketch, shifted.x, shifted.y, cellSize * 0.75, arrow.vector);
                } else {
                    const shiftedTopLeft = timeShift(
                        convertArrowToTopLeft(arrow),
                        arrow.vector,
                        cellSize * percentage
                    );
                    const triangleDrawer = triangleDrawingArray[arrow.vector];
                    triangleDrawer(shiftedTopLeft, cellSize, sketch);
                }
                sketch.pop();
                return undefined;
            });
            // wall Arrows
            (arrowDictionary[BOUNDARY] || []).map((arrow) => {
                sketch.push();
                sketch.strokeWeight(0);
                sketch.fill(...getArrowColor(arrow.channel, arrow.velocity));
                if (isTriangleMode) {
                    // Bounce animation: arrow moves toward wall then snaps back
                    const center = convertArrowToCenter(arrow);
                    const bounceP = percentage < 0.5 ? percentage : 1 - percentage;
                    const shifted = triangleGeo.animationShift(center, arrow.vector, bounceP * 0.5, cellSize);
                    triangleGeo.drawTriangleArrow(sketch, shifted.x, shifted.y, cellSize * 0.75, arrow.vector);
                } else {
                    const topLeft = convertArrowToTopLeft(arrow);
                    translateAndRotate(topLeft, sketch, arrow.vector, cellSize);
                    sketch.quad(
                        0, cellSize,
                        cellSize / 2, cellSize * percentage,
                        cellSize, cellSize,
                        cellSize / 2, cellSize + cellSize * percentage
                    );
                }
                sketch.pop();
                return undefined;
            });
            // rotating Arrows

            const arrowsToRotateDictionary = Object.keys(arrowLocationDictionary).reduce(
                (acc, location) => (
                    arrowLocationDictionary[location].length !== 1 ?
                        {
                            ...acc,
                            [location]: arrowLocationDictionary[location],
                        } :
                        acc
                ),
                {}
            );
            Object.keys(arrowsToRotateDictionary).map((arrowsToRotateIndex) => {
                const dirCount = isTriangleMode ? 6 : 4;
                const rotations = (
                    (
                        arrowsToRotateDictionary[arrowsToRotateIndex].length % dirCount
                    ) || dirCount
                ) - 1;
                const bouncedRotation = isTriangleMode
                    ? (rotations + 3) % 6
                    : (rotations + 2) % 4;
                // draw not bounced
                const bouncingDictionary = getArrowBoundaryDictionary(
                    arrowsToRotateDictionary[arrowsToRotateIndex],
                    stateDrawing.grid.size,
                    (arrow, size, rots, walls) => arrowBoundaryKey(arrow, size, rots, walls, gridType),
                    rotations,
                    stateDrawing.grid.walls || []
                );
                const arrowsNotBouncing = bouncingDictionary[NO_BOUNDARY] || [];
                arrowsNotBouncing.map((arrow) => {
                    sketch.push();
                    sketch.strokeWeight(0);
                    sketch.fill(...getArrowColor(arrow.channel, arrow.velocity));
                    if (isTriangleMode) {
                        const center = convertArrowToCenter(arrow);
                        // Interpolate rotation animation
                        const fromVec = arrow.vector;
                        const toVec = (arrow.vector + rotations) % 6;
                        const angle0 = -Math.PI / 6 + fromVec * Math.PI / 3;
                        const angle1 = -Math.PI / 6 + toVec * Math.PI / 3;
                        let dAngle = angle1 - angle0;
                        // Shortest rotation path
                        if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
                        if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
                        const angle = angle0 + dAngle * percentage;
                        sketch.translate(center.x, center.y);
                        sketch.rotate(angle);
                        const sz = cellSize * 0.75;
                        sketch.triangle(0, -sz * 0.4, sz * 0.35, sz * 0.2, -sz * 0.35, sz * 0.2);
                    } else {
                        const topLeft = convertArrowToTopLeft(arrow);
                        translateAndRotate(topLeft, sketch, arrow.vector, cellSize);
                        triangleRotatingArray[rotations](cellSize, sketch, percentage);
                    }
                    sketch.pop();
                    return undefined;
                });
                
                const arrowsBouncing = bouncingDictionary[BOUNDARY] || [];

                // bounced
                arrowsBouncing.map((arrow) => {
                    sketch.push();
                    sketch.strokeWeight(0);
                    sketch.fill(...getArrowColor(arrow.channel, arrow.velocity));
                    if (isTriangleMode) {
                        const center = convertArrowToCenter(arrow);
                        const fromVec = arrow.vector;
                        const toVec = (arrow.vector + bouncedRotation) % 6;
                        const angle0 = -Math.PI / 6 + fromVec * Math.PI / 3;
                        const angle1 = -Math.PI / 6 + toVec * Math.PI / 3;
                        let dAngle = angle1 - angle0;
                        if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
                        if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
                        const angle = angle0 + dAngle * percentage;
                        sketch.translate(center.x, center.y);
                        sketch.rotate(angle);
                        const sz = cellSize * 0.75;
                        sketch.triangle(0, -sz * 0.4, sz * 0.35, sz * 0.2, -sz * 0.35, sz * 0.2);
                    } else {
                        const topLeft = convertArrowToTopLeft(arrow);
                        translateAndRotate(topLeft, sketch, arrow.vector, cellSize);
                        triangleRotatingArray[bouncedRotation](cellSize, sketch, percentage);
                    }
                    sketch.pop();
                    return undefined;
                });
                return undefined;
            });

            // draw hover input
            if (stateDrawing.deleting) {
                sketch.cursor(sketch.CROSS);
            } else {
                sketch.cursor(sketch.HAND);
            }
            // eslint-disable-next-line no-param-reassign
            // sketch.touchEnded = (e) => {
            //     if (sketch.mouseX > 0 + gridCanvasBorderSize &&
            //         sketch.mouseX < gridCanvasSize - gridCanvasBorderSize &&
            //         sketch.mouseY > 0 + gridCanvasBorderSize &&
            //         sketch.mouseY < gridCanvasSize - gridCanvasBorderSize
            //     ) {
            //         if (arrowAdder) {
            //             arrowAdder(mouseXindex, mouseYindex, e);
            //             return false;
            //         }
            //     } else {
            //     }
            // };
        };
    };

    // eslint-disable-next-line
    new p5(drawingContext);
};
export const resizeGridCanvas = (newSize) => {
    gridCanvasSize = newSize;
    if (sketchInstance) {
        sketchInstance.resizeCanvas(
            gridCanvasSize + gridCanvasBorderSize * 2,
            gridCanvasSize + gridCanvasBorderSize * 2
        );
    }
};

export const getGridCanvasSize = () => gridCanvasSize;

// Tear down the p5 sketch, cancel its rAF loop, remove canvas & listeners
export const destroyCanvas = () => {
    if (sketchInstance) {
        sketchInstance.remove();
        sketchInstance = null;
    }
    stateDrawing = null;
    previousTime = null;
    particles = [];
};

export const updateCanvas = (state, date) => {
    // Guard against being called before setUpCanvas
    if (!stateDrawing) {
        return;
    }

    const noteLengthChanged = state.noteLength !== stateDrawing.noteLength;
    const gridStepped = state.gridStep !== stateDrawing.gridStep;
    const presetChanged = state.currentPreset !== stateDrawing.currentPreset;
    const playStateChanged = state.playing !== stateDrawing.playing;

    if (noteLengthChanged && stateDrawing.noteLength > 0) {
        // Rescale previousTime so the current animation percentage is preserved
        const elapsed = date.getTime() - previousTime.getTime();
        const pct = Math.min(Math.max(elapsed / stateDrawing.noteLength, 0), 1);
        previousTime = new Date(date.getTime() - pct * state.noteLength);
    }

    if (gridStepped || presetChanged) {
        // Reset animation cycle on actual grid steps or preset switches
        previousTime = date;
        pauseEaseFrom = 0;
    }

    if (playStateChanged && !state.playing) {
        // Just paused — capture current animation progress for elastic ease-out
        const elapsed = date.getTime() - previousTime.getTime();
        pauseEaseFrom = Math.min(Math.max(elapsed / stateDrawing.noteLength, 0), 1);
        pauseEaseStart = date.getTime();
    }

    if (playStateChanged && state.playing) {
        // Starting playback — begin animation from 0%
        previousTime = date;
        pauseEaseFrom = 0;
    }

    // Always sync so size, arrows, direction, and other changes propagate immediately
    stateDrawing = state;
};
