import { describe, it, expect, vi } from 'vitest';
import {
  buildMultipartRelatedBody,
  listDriveMarkdownFiles,
  uploadDriveMarkdownFile,
} from './googleDriveSync';

describe('Google Drive sync client', () => {
  it('builds a valid RFC 2387 multipart/related payload', () => {
    const { body, contentType } = buildMultipartRelatedBody(
      { name: 'notes.md', mimeType: 'text/markdown' },
      '# Hello Drive\n',
      'test_boundary'
    );
    expect(contentType).toBe('multipart/related; boundary=test_boundary');
    expect(body).toContain('{"name":"notes.md","mimeType":"text/markdown"}');
    expect(body).toContain('# Hello Drive\n');
    expect(body.endsWith('--test_boundary--')).toBe(true);
  });

  it('lists Markdown files from Google Drive v3 API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [
          {
            id: 'drive-1',
            name: 'Roadmap.md',
            mimeType: 'text/markdown',
            modifiedTime: '2026-11-14T10:00:00.000Z',
          },
        ],
      }),
    });

    const files = await listDriveMarkdownFiles('fake-token', mockFetch as unknown as typeof fetch);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('Roadmap.md');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('detects remote modification conflict before overwriting an existing Drive file', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'drive-1',
        name: 'Roadmap.md',
        mimeType: 'text/markdown',
        modifiedTime: '2026-11-14T11:00:00.000Z', // Newer than local base
      }),
    });

    const outcome = await uploadDriveMarkdownFile({
      accessToken: 'fake-token',
      fileId: 'drive-1',
      fileName: 'Roadmap.md',
      content: '# Local edits',
      lastKnownModifiedTime: '2026-11-14T10:00:00.000Z',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(outcome.status).toBe('conflict');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uploads cleanly when remote modifiedTime matches local base', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'drive-1',
          name: 'Roadmap.md',
          mimeType: 'text/markdown',
          modifiedTime: '2026-11-14T10:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'drive-1',
          name: 'Roadmap.md',
          mimeType: 'text/markdown',
          modifiedTime: '2026-11-14T11:05:00.000Z',
        }),
      });

    const outcome = await uploadDriveMarkdownFile({
      accessToken: 'fake-token',
      fileId: 'drive-1',
      fileName: 'Roadmap.md',
      content: '# Updated content',
      lastKnownModifiedTime: '2026-11-14T10:00:00.000Z',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(outcome.status).toBe('saved');
    if (outcome.status === 'saved') {
      expect(outcome.file.modifiedTime).toBe('2026-11-14T11:05:00.000Z');
    }
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
