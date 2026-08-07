export type FileNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[];
};

/** Flat entry from the `list_files` command — quick open's data source. */
export type FileEntry = { name: string; path: string };

export const PINNED_NAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  "SKILL.md",
  "README.md",
  "PRODUCT.md",
  "DESIGN.md",
  ".cursorrules",
  ".windsurfrules",
] as const;
