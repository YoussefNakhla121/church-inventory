import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getComments, postComment } from '../api/comments';
import styles from './CommentThread.module.css';

export default function CommentThread({ requestId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const commentsEndRef = useRef(null);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await getComments(requestId);
      setComments(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError('Could not load comments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (requestId) {
      fetchComments();
    }
  }, [requestId]);

  // Scroll to bottom whenever comments list updates
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const response = await postComment(requestId, newComment.trim());
      // Append the newly created comment returned from backend
      setComments((prev) => [...prev, response.data]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment:', err);
      setError('Could not post comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading comments...</div>;
  }

  return (
    <div className={styles.threadContainer}>
      <h4 className={styles.title}>Comments & Activity Log</h4>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.commentsList}>
        {comments.length === 0 ? (
          <div className={styles.noComments}>No comments yet. Start the conversation!</div>
        ) : (
          comments.map((comment) => {
            const isMe = comment.author_id === user?.id;
            const authorName = comment.author?.username || comment.author_username || (isMe ? 'You' : 'User');
            return (
              <div
                key={comment.id}
                className={`${styles.commentCard} ${
                  isMe ? styles.myComment : styles.otherComment
                }`}
              >
                <div className={styles.commentHeader}>
                  <span className={styles.author}>{authorName}</span>
                  <span className={styles.date}>
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <p className={styles.body}>{comment.body}</p>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          className={styles.textarea}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Ask a question, update status, or add notes..."
          disabled={submitting}
          required
        />
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={submitting || !newComment.trim()}
        >
          {submitting ? 'Sending...' : 'Post Comment'}
        </button>
      </form>
    </div>
  );
}
