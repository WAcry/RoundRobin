import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Download, File, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAttachmentBlob, putAttachmentBlob } from '../lib/attachments/blobStore';
import { downloadAttachmentBlob, uploadAttachmentBlob } from '../lib/attachments/cloud';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import type { TaskAttachment, TaskId } from '../types';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

function isImageAttachment(att: Pick<TaskAttachment, 'mimeType'>) {
  return typeof att.mimeType === 'string' && att.mimeType.startsWith('image/');
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

async function getOrFetchBlob(att: TaskAttachment): Promise<Blob> {
  const local = await getAttachmentBlob(att.id);
  if (local) return local;
  if (att.cloudPath) {
    const blob = await downloadAttachmentBlob(att.cloudPath);
    await putAttachmentBlob(att.id, blob);
    return blob;
  }
  throw new Error('Attachment is not available on this device.');
}

type PreviewState = {
  attachment: TaskAttachment;
  url: string;
};

export function Attachments({ taskId }: { taskId: TaskId }) {
  const reducedMotion = useReducedMotion();
  const task = useStore((state) => state.tasks[taskId]);
  const addAttachment = useStore((state) => state.addAttachment);
  const removeAttachment = useStore((state) => state.removeAttachment);
  const setAttachmentCloudPath = useStore((state) => state.setAttachmentCloudPath);
  const user = useAuthStore((state) => state.user);
  const pushToast = useToastStore((state) => state.pushToast);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview]);

  const attachments = useMemo(() => {
    if (!task) return [];
    return task.attachments.filter((att) => typeof att.removedAt !== 'number');
  }, [task]);

  const openPreview = async (att: TaskAttachment) => {
    if (!isImageAttachment(att)) return;
    setLoadingAttachmentId(att.id);
    try {
      const blob = await getOrFetchBlob(att);
      const url = URL.createObjectURL(blob);
      setPreview({ attachment: att, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load attachment.';
      pushToast({ kind: 'error', message });
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const downloadToDisk = async (att: TaskAttachment) => {
    setLoadingAttachmentId(att.id);
    try {
      const blob = await getOrFetchBlob(att);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name || `attachment-${att.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed.';
      pushToast({ kind: 'error', message });
    } finally {
      setLoadingAttachmentId(null);
    }
  };

  const handleFilesSelected = async (files: readonly File[]) => {
    if (!task) return;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        pushToast({ kind: 'error', message: `Attachment exceeds 50 MB limit: ${file.name}` });
        continue;
      }

      const id = crypto.randomUUID();
      const createdAt = Date.now();
      try {
        await putAttachmentBlob(id, file);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save attachment.';
        pushToast({ kind: 'error', message });
        continue;
      }

      const attachment: TaskAttachment = {
        id,
        name: file.name || 'Attachment',
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        createdAt,
      };

      addAttachment(taskId, attachment);

      if (user) {
        void uploadAttachmentBlob(user.uid, id, file)
          .then((cloudPath) => setAttachmentCloudPath(taskId, id, cloudPath))
          .catch((err) => {
            const message = err instanceof Error ? err.message : 'Attachment upload failed.';
            pushToast({ kind: 'error', message });
          });
      }
    }
  };

  if (!task) return null;

  return (
    <>
      <div className="w-full mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Attachments</span>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.currentTarget.files ? Array.from(e.currentTarget.files) : [];
                e.currentTarget.value = '';
                void handleFilesSelected(files);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'px-3 py-2 rounded-xl text-sm font-semibold transition-colors',
                'bg-gray-100 hover:bg-gray-200 text-gray-700',
                'dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200',
                'flex items-center gap-2'
              )}
              aria-label="Add attachment"
            >
              <Paperclip size={16} />
              Add
            </button>
          </div>
        </div>

        {attachments.length === 0 ? (
          <div className="mt-3 text-sm text-gray-400">No attachments.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {attachments.map((att) => {
              const isImage = isImageAttachment(att);
              const busy = loadingAttachmentId === att.id;

              return (
                <div
                  key={att.id}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2 rounded-2xl group',
                    'bg-gray-50 dark:bg-gray-800',
                    'border border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => (isImage ? void openPreview(att) : void downloadToDisk(att))}
                    className="min-w-0 flex-1 flex items-center gap-3 text-left"
                    disabled={busy}
                    aria-label={isImage ? `Preview image: ${att.name}` : `Download attachment: ${att.name}`}
                  >
                    <div
                      className={cn(
                        'shrink-0 p-2 rounded-xl',
                        isImage
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                      )}
                      aria-hidden="true"
                    >
                      {isImage ? <ImageIcon size={16} /> : <File size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {att.name || 'Attachment'}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {busy ? 'Loading...' : formatBytes(att.size)}
                      </div>
                    </div>
                  </button>

                  <div className="shrink-0 flex items-center gap-1">
                    {!isImage && (
                      <button
                        type="button"
                        onClick={() => void downloadToDisk(att)}
                        className={cn(
                          'p-2 rounded-xl transition-colors',
                          'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10'
                        )}
                        disabled={busy}
                        aria-label={`Download attachment: ${att.name}`}
                        title="Download"
                      >
                        <Download size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(taskId, att.id)}
                      className={cn(
                        'p-2 rounded-xl transition-colors',
                        'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20'
                      )}
                      aria-label={`Remove attachment: ${att.name}`}
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {preview && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
              initial={reducedMotion ? undefined : { opacity: 0 }}
              animate={reducedMotion ? undefined : { opacity: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0 }}
              onClick={() => setPreview(null)}
            />

            <motion.div
              key="panel"
              className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
              initial={reducedMotion ? undefined : { y: 24, opacity: 0 }}
              animate={reducedMotion ? undefined : { y: 0, opacity: 1 }}
              exit={reducedMotion ? undefined : { y: 24, opacity: 0 }}
              transition={reducedMotion ? undefined : { duration: 0.18, ease: 'easeOut' }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Preview: ${preview.attachment.name}`}
                className={cn(
                  'pointer-events-auto w-full max-w-4xl',
                  'mx-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-black/5 dark:border-white/10',
                  'max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col'
                )}
              >
                <div className="px-6 pt-5 pb-4 flex items-center justify-between bg-white dark:bg-gray-900">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {preview.attachment.name || 'Image'}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{formatBytes(preview.attachment.size)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void downloadToDisk(preview.attachment)}
                      className={cn(
                        'p-2 rounded-xl transition-colors',
                        'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10'
                      )}
                      aria-label="Download image"
                      title="Download"
                    >
                      <Download size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      aria-label="Close"
                    >
                      <X size={18} className="text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto px-6 pb-6">
                  <div className="w-full rounded-2xl bg-black/5 dark:bg-white/5 overflow-hidden">
                    <img
                      src={preview.url}
                      alt={preview.attachment.name || 'Attachment'}
                      className="w-full max-h-[75dvh] object-contain"
                      draggable={false}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
