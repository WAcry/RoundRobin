import { firebaseApp } from '../firebase';

export async function uploadAttachmentBlob(uid: string, attachmentId: string, blob: Blob): Promise<string> {
  const { getStorage, ref, uploadBytes } = await import('firebase/storage');
  const storage = getStorage(firebaseApp);
  const cloudPath = `users/${uid}/attachments/${attachmentId}`;
  await uploadBytes(ref(storage, cloudPath), blob, {
    contentType: blob.type || 'application/octet-stream',
  });
  return cloudPath;
}

export async function downloadAttachmentBlob(cloudPath: string): Promise<Blob> {
  const { getStorage, ref, getDownloadURL } = await import('firebase/storage');
  const storage = getStorage(firebaseApp);
  const url = await getDownloadURL(ref(storage, cloudPath));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Attachment download failed (${response.status}).`);
  }
  return await response.blob();
}

