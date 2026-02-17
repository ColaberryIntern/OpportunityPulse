import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchPostById,
  clearCurrentPost,
  addComment,
  deleteComment,
} from '../store/slices/forumSlice';
import PostDetail from '../components/forums/PostDetail';

function ForumPostPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentPost, detailLoading, error } = useSelector((state) => state.forums);
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    dispatch(fetchPostById(id));
    return () => {
      dispatch(clearCurrentPost());
    };
  }, [dispatch, id]);

  const handleAddComment = (body) => {
    dispatch(addComment({ postId: id, body }));
  };

  const handleDeleteComment = (commentId) => {
    dispatch(deleteComment({ postId: id, commentId }));
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <Link
          to="/forums"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Forums
        </Link>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <PostDetail
          post={currentPost}
          loading={detailLoading}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          currentUserId={user?.id}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

export default ForumPostPage;
