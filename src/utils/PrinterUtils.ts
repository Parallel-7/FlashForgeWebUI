/**
 * @fileoverview Printer utility functions for model detection and classification
 */

import { PrinterModelType } from '../types/printer';

/**
 * Detect printer model type from typeName string
 * Used for backend selection and feature detection
 */
export const detectPrinterModelType = (typeName: string): PrinterModelType => {
  if (!typeName) {
    return 'generic-legacy';
  }

  const typeNameLower = typeName.toLowerCase();

  // Check for specific models in order of specificity
  if (typeNameLower.includes('5m pro')) {
    return 'adventurer-5m-pro';
  } else if (typeNameLower.includes('5m')) {
    return 'adventurer-5m';
  } else if (typeNameLower.includes('ad5x')) {
    return 'ad5x';
  }

  // Default to generic legacy for all other printers
  return 'generic-legacy';
};
