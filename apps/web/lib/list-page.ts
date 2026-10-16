/**
 * The app's list page size (the campaigns list's). A plain module on purpose:
 * a constant exported from a 'use client' file reaches a server component as a
 * client reference ({}), not a number.
 */
export const LIST_PAGE_SIZE = 8

/**
 * Card grids (the creator pools) page by full rows of three. Eight cards left a
 * half-empty last row and 547 creators came to 69 pages.
 */
export const POOL_PAGE_SIZE = 24
