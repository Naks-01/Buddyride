import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { MessageCircle, X, Send } from 'lucide-react';
import { db } from '../lib/firebase';

export type ChatRole = 'driver' | 'passenger';

type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: ChatRole;
  text: string;
  read: boolean;
  createdAt?: { toMillis?: () => number } | null;
};

const QUICK_REPLIES = ["I'm on my way", "I've arrived", 'Where are you?', "I'm outside, at gate"];
const MAX_LENGTH = 200;
const COMPLETED_STATUSES = new Set(['completed', 'cancelled']);

type RideChatProps = {
  rideId: string;
  currentUserId: string;
  currentUserRole: ChatRole;
  rideStatus?: string | null;
  className?: string;
};

// Floating chat button + panel for in-app driver/passenger messaging on a ride.
export function RideChat({ rideId, currentUserId, currentUserRole, rideStatus, className }: RideChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  const disabled = rideStatus != null && COMPLETED_STATUSES.has(rideStatus);
  const unreadCount = messages.filter((m) => !m.read && m.senderId !== currentUserId).length;

  useEffect(() => {
    if (!rideId) return;
    const q = query(collection(db, `rides/${rideId}/messages`), orderBy('createdAt'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })));
    });
    return () => unsubscribe();
  }, [rideId]);

  useEffect(() => {
    if (open) listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages]);

  // Mark incoming unread messages as read once the passenger/driver opens the chat.
  useEffect(() => {
    if (!open || !rideId) return;
    const unread = messages.filter((m) => !m.read && m.senderId !== currentUserId);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((m) => batch.update(doc(db, `rides/${rideId}/messages`, m.id), { read: true }));
    void batch.commit().catch((err) => console.error('Failed to mark messages read:', err));
  }, [open, messages, rideId, currentUserId]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim().slice(0, MAX_LENGTH);
    if (!trimmed || disabled || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, `rides/${rideId}/messages`), {
        senderId: currentUserId,
        senderRole: currentUserRole,
        text: trimmed,
        createdAt: serverTimestamp(),
        read: false,
      });
      setDraft('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const markAllReadNow = async () => {
    const unread = messages.filter((m) => !m.read && m.senderId !== currentUserId);
    await Promise.all(unread.map((m) => updateDoc(doc(db, `rides/${rideId}/messages`, m.id), { read: true }).catch(() => null)));
  };

  if (disabled && !open) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void markAllReadNow();
        }}
        aria-label="Open chat"
        className={className ?? 'fixed bottom-44 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#3A3D45] text-white shadow-lg'}
      >
        <MessageCircle size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="flex h-[70vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-bold text-gray-800">Chat</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="text-gray-500">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <p className="mt-8 text-center text-sm text-gray-400">No messages yet. Say hello!</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      m.senderId === currentUserId ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={listEndRef} />
            </div>

            {!disabled && (
              <div className="border-t border-gray-100 px-3 py-2">
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => void sendMessage(reply)}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void sendMessage(draft);
                    }}
                    placeholder="Type a message..."
                    maxLength={MAX_LENGTH}
                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-800"
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage(draft)}
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
