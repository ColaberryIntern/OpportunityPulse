import forumReducer, {
  fetchPosts,
  fetchPostById,
  createPost,
  addComment,
  deleteComment,
  clearCurrentPost,
  clearForumError,
  clearCreateSuccess,
} from '../store/slices/forumSlice';

const initialState = {
  posts: [],
  currentPost: null,
  pagination: null,
  loading: false,
  detailLoading: false,
  error: null,
  createSuccess: false,
};

describe('forumSlice', () => {
  it('should return initial state', () => {
    expect(forumReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('fetchPosts.fulfilled populates posts and pagination', () => {
    const payload = {
      posts: [
        { id: 1, title: 'First Post' },
        { id: 2, title: 'Second Post' },
      ],
      pagination: { total: 2, page: 1, limit: 20, pages: 1 },
    };
    const state = forumReducer(initialState, {
      type: 'forums/fetchPosts/fulfilled',
      payload,
    });
    expect(state.loading).toBe(false);
    expect(state.posts).toEqual(payload.posts);
    expect(state.pagination).toEqual(payload.pagination);
  });

  it('fetchPostById.pending sets detailLoading true', () => {
    const state = forumReducer(initialState, {
      type: 'forums/fetchPostById/pending',
    });
    expect(state.detailLoading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('fetchPostById.fulfilled sets currentPost', () => {
    const post = { id: 5, title: 'Detail Post', body: 'Some body text', comments: [] };
    const state = forumReducer(initialState, {
      type: 'forums/fetchPostById/fulfilled',
      payload: post,
    });
    expect(state.detailLoading).toBe(false);
    expect(state.currentPost).toEqual(post);
  });

  it('createPost.fulfilled adds to posts and sets createSuccess', () => {
    const post = { id: 3, title: 'New Post' };
    const state = forumReducer(initialState, {
      type: 'forums/createPost/fulfilled',
      payload: post,
    });
    expect(state.posts[0]).toEqual(post);
    expect(state.createSuccess).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('addComment.fulfilled appends to currentPost.comments', () => {
    const stateWithPost = {
      ...initialState,
      currentPost: {
        id: 10,
        title: 'Post With Comments',
        comments: [{ id: 100, body: 'Existing comment' }],
      },
    };
    const newComment = { id: 101, body: 'New comment' };
    const state = forumReducer(stateWithPost, {
      type: 'forums/addComment/fulfilled',
      payload: newComment,
    });
    expect(state.currentPost.comments).toHaveLength(2);
    expect(state.currentPost.comments[1]).toEqual(newComment);
  });

  it('deleteComment.fulfilled removes from currentPost.comments', () => {
    const stateWithPost = {
      ...initialState,
      currentPost: {
        id: 10,
        title: 'Post With Comments',
        comments: [
          { id: 100, body: 'Keep this' },
          { id: 101, body: 'Delete this' },
        ],
      },
    };
    const state = forumReducer(stateWithPost, {
      type: 'forums/deleteComment/fulfilled',
      payload: { postId: 10, commentId: 101 },
    });
    expect(state.currentPost.comments).toHaveLength(1);
    expect(state.currentPost.comments[0].id).toBe(100);
  });

  it('clearCurrentPost sets currentPost to null', () => {
    const stateWithPost = {
      ...initialState,
      currentPost: { id: 1, title: 'Some Post' },
    };
    const state = forumReducer(stateWithPost, clearCurrentPost());
    expect(state.currentPost).toBeNull();
  });

  it('clearForumError clears error', () => {
    const stateWithError = { ...initialState, error: 'Something went wrong' };
    const state = forumReducer(stateWithError, clearForumError());
    expect(state.error).toBeNull();
  });
});
