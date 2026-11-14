export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export type DriveUploadOutcome =
  | { status: 'saved'; file: DriveFileMetadata }
  | { status: 'conflict'; remoteFile: DriveFileMetadata };

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID_STORAGE_KEY = 'pilgrim-md-google-client-id';

export function getConfiguredGoogleClientId(): string {
  const envClientId =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID
      ? String(import.meta.env.VITE_GOOGLE_CLIENT_ID).trim()
      : '';
  if (envClientId) return envClientId;

  try {
    return localStorage.getItem(CLIENT_ID_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setConfiguredGoogleClientId(clientId: string): void {
  try {
    const trimmed = clientId.trim();
    if (!trimmed) {
      localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
    } else {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, trimmed);
    }
  } catch {
    // Ignore storage errors
  }
}

export function buildMultipartRelatedBody(
  metadata: { name: string; mimeType: string },
  content: string,
  boundary: string = 'pilgrim_md_boundary_7f9a2b'
): { body: string; contentType: string } {
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n' +
    delimiter +
    `Content-Type: ${metadata.mimeType}; charset=UTF-8\r\n\r\n` +
    content +
    closeDelimiter;

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

/**
 * Initiates a popup OAuth 2.0 token flow for `drive.file` scope without loading external scripts
 * (keeping `script-src 'self'` CSP intact).
 */
export function requestGoogleDriveAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const state =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const redirectUri = `${window.location.origin}${window.location.pathname}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: DRIVE_FILE_SCOPE,
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state,
    });

    const popup = window.open(
      `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      'pilgrim-google-drive-oauth',
      'width=520,height=640,menubar=no,toolbar=no,status=no'
    );

    if (!popup) {
      reject(new Error('Popup was blocked by the browser. Please allow popups for this site.'));
      return;
    }

    const timer = window.setInterval(() => {
      try {
        if (popup.closed) {
          window.clearInterval(timer);
          reject(new Error('Google sign-in window was closed.'));
          return;
        }
        if (popup.location.origin === window.location.origin && popup.location.hash) {
          const hashParams = new URLSearchParams(popup.location.hash.replace(/^#/, ''));
          const returnedState = hashParams.get('state');
          const token = hashParams.get('access_token');
          const error = hashParams.get('error');
          window.clearInterval(timer);
          popup.close();

          if (error) {
            reject(new Error(`Google sign-in error: ${error}`));
            return;
          }
          if (returnedState !== state || !token) {
            reject(new Error('Invalid OAuth response state or missing token.'));
            return;
          }
          resolve(token);
        }
      } catch {
        // Cross-origin while user is on accounts.google.com — keep polling until redirect back
      }
    }, 250);
  });
}

export async function listDriveMarkdownFiles(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<DriveFileMetadata[]> {
  const query =
    "trashed = false and (mimeType = 'text/markdown' or mimeType = 'text/plain' or name contains '.md')";
  const params = new URLSearchParams({
    q: query,
    pageSize: '50',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime)',
  });

  const res = await fetchImpl(`${DRIVE_FILES_API}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Drive list failed (${res.status})`);
  }

  const data = (await res.json()) as { files?: DriveFileMetadata[] };
  return Array.isArray(data.files) ? data.files : [];
}

export async function getDriveFileMetadata(
  accessToken: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DriveFileMetadata> {
  const res = await fetchImpl(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Drive file metadata (${res.status})`);
  }
  return (await res.json()) as DriveFileMetadata;
}

export async function downloadDriveMarkdownFile(
  accessToken: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ metadata: DriveFileMetadata; content: string }> {
  const metadata = await getDriveFileMetadata(accessToken, fileId, fetchImpl);
  const contentRes = await fetchImpl(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!contentRes.ok) {
    throw new Error(`Failed to download Drive file content (${contentRes.status})`);
  }

  const content = await contentRes.text();
  return { metadata, content };
}

export async function uploadDriveMarkdownFile(params: {
  accessToken: string;
  fileId?: string | null;
  fileName: string;
  content: string;
  lastKnownModifiedTime?: string | null;
  ignoreConflict?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<DriveUploadOutcome> {
  const fetchFn = params.fetchImpl ?? fetch;

  if (params.fileId && !params.ignoreConflict && params.lastKnownModifiedTime) {
    const remoteMeta = await getDriveFileMetadata(params.accessToken, params.fileId, fetchFn);
    if (remoteMeta.modifiedTime !== params.lastKnownModifiedTime) {
      return { status: 'conflict', remoteFile: remoteMeta };
    }
  }

  const { body, contentType } = buildMultipartRelatedBody(
    {
      name: params.fileName,
      mimeType: 'text/markdown',
    },
    params.content
  );

  const isUpdate = Boolean(params.fileId);
  const url = isUpdate
    ? `${DRIVE_UPLOAD_API}/${encodeURIComponent(params.fileId!)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime`
    : `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,modifiedTime`;

  const res = await fetchFn(url, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': contentType,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive upload failed (${res.status})`);
  }

  const savedFile = (await res.json()) as DriveFileMetadata;
  return { status: 'saved', file: savedFile };
}
