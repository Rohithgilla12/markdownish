export type FileNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[];
};

export const PINNED_NAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  "SKILL.md",
  "README.md",
  "PRODUCT.md",
  "DESIGN.md",
] as const;
