/**
 * Geometry module index
 *
 * Provides a single `getGeometry(gridType)` entry point so every module
 * can branch on grid shape without importing both geometry files.
 */

import * as squareGeo from './square.js';
import * as triangleGeo from './triangle.js';

const geometries = {
    square: squareGeo,
    triangle: triangleGeo,
};

/**
 * Get the geometry module for a grid type.
 * @param {'square' | 'triangle'} gridType — defaults to 'square'
 */
export const getGeometry = (gridType = 'square') => geometries[gridType] || squareGeo;

export { squareGeo as square, triangleGeo as triangle };
