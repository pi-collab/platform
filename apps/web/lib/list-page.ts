/**
 * The app's list page size (the campaigns list's). A plain module on purpose:
 * a constant exported from a 'use client' file reaches a server component as a
 * client reference ({}), not a number.
 */
export const LIST_PAGE_SIZE = 8
