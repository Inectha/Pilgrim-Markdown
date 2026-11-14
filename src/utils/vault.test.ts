import { describe, it, expect } from 'vitest';
import {
  isMarkdownOrTextFile,
  isSafeRasterImageName,
  shouldSkipVaultEntry,
  resolveRelativePath,
} from './vault';

describe('vault utilities', () => {
  it('recognizes markdown and text files', () => {
    expect(isMarkdownOrTextFile('notes.md')).toBe(true);
    expect(isMarkdownOrTextFile('README.MARKDOWN')).toBe(true);
    expect(isMarkdownOrTextFile('todo.txt')).toBe(true);
    expect(isMarkdownOrTextFile('photo.png')).toBe(false);
    expect(isMarkdownOrTextFile('script.ts')).toBe(false);
  });

  it('allows only safe raster image extensions', () => {
    expect(isSafeRasterImageName('diagram.png')).toBe(true);
    expect(isSafeRasterImageName('photo.JPG')).toBe(true);
    expect(isSafeRasterImageName('anim.webp')).toBe(true);
    expect(isSafeRasterImageName('vector.svg')).toBe(false);
    expect(isSafeRasterImageName('page.html')).toBe(false);
  });

  it('skips hidden and build directories', () => {
    expect(shouldSkipVaultEntry('.git')).toBe(true);
    expect(shouldSkipVaultEntry('node_modules')).toBe(true);
    expect(shouldSkipVaultEntry('.hidden')).toBe(true);
    expect(shouldSkipVaultEntry('docs')).toBe(false);
  });

  it('resolves relative paths inside the vault and blocks escapes/external URLs', () => {
    expect(resolveRelativePath('docs/guide.md', './img/pic.png')).toBe('docs/img/pic.png');
    expect(resolveRelativePath('docs/sub/guide.md', '../assets/a.jpg')).toBe('docs/assets/a.jpg');
    expect(resolveRelativePath(undefined, 'assets/logo.png')).toBe('assets/logo.png');
    expect(resolveRelativePath('docs/guide.md', '/shared/banner.webp')).toBe('shared/banner.webp');
    expect(resolveRelativePath('docs/guide.md', '../../outside.png')).toBeNull();
    expect(resolveRelativePath('docs/guide.md', 'https://example.com/a.png')).toBeNull();
    expect(resolveRelativePath('docs/guide.md', 'data:image/png;base64,AAA')).toBeNull();
    expect(resolveRelativePath('docs/guide.md', 'javascript:alert(1)')).toBeNull();
  });
});
