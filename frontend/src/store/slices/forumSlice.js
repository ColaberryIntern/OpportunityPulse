import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import forumService from '../../services/forumService';

export const fetchPosts = createAsyncThunk(
  'forums/fetchPosts',
  async ({ page = 1, limit = 20, category, status } = {}, { rejectWithValue }) => {
    try {
      const response = await forumService.listPosts({ page, limit, category, status });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch posts'
      );
    }
  }
);

export const fetchPostById = createAsyncThunk(
  'forums/fetchPostById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await forumService.getPost(id);
      return response.data.data.post;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch post'
      );
    }
  }
);

export const createPost = createAsyncThunk(
  'forums/createPost',
  async (data, { rejectWithValue }) => {
    try {
      const response = await forumService.createPost(data);
      return response.data.data.post;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create post'
      );
    }
  }
);

export const deletePost = createAsyncThunk(
  'forums/deletePost',
  async (id, { rejectWithValue }) => {
    try {
      await forumService.deletePost(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete post'
      );
    }
  }
);

export const addComment = createAsyncThunk(
  'forums/addComment',
  async ({ postId, body }, { rejectWithValue }) => {
    try {
      const response = await forumService.addComment(postId, { body });
      return response.data.data.comment;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to add comment'
      );
    }
  }
);

export const deleteComment = createAsyncThunk(
  'forums/deleteComment',
  async ({ postId, commentId }, { rejectWithValue }) => {
    try {
      await forumService.deleteComment(postId, commentId);
      return { postId, commentId };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete comment'
      );
    }
  }
);

const forumSlice = createSlice({
  name: 'forums',
  initialState: {
    posts: [],
    currentPost: null,
    pagination: null,
    loading: false,
    detailLoading: false,
    error: null,
    createSuccess: false,
  },
  reducers: {
    clearForumError: (state) => {
      state.error = null;
    },
    clearCurrentPost: (state) => {
      state.currentPost = null;
    },
    clearCreateSuccess: (state) => {
      state.createSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchPosts
      .addCase(fetchPosts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.loading = false;
        state.posts = action.payload.posts;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchPosts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchPostById
      .addCase(fetchPostById.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchPostById.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.currentPost = action.payload;
      })
      .addCase(fetchPostById.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.payload;
      })
      // createPost
      .addCase(createPost.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createSuccess = false;
      })
      .addCase(createPost.fulfilled, (state, action) => {
        state.loading = false;
        state.posts.unshift(action.payload);
        state.createSuccess = true;
      })
      .addCase(createPost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // deletePost
      .addCase(deletePost.fulfilled, (state, action) => {
        state.posts = state.posts.filter((p) => p.id !== action.payload);
        if (state.currentPost?.id === action.payload) {
          state.currentPost = null;
        }
      })
      // addComment
      .addCase(addComment.fulfilled, (state, action) => {
        if (state.currentPost) {
          state.currentPost.comments = [
            ...(state.currentPost.comments || []),
            action.payload,
          ];
        }
      })
      // deleteComment
      .addCase(deleteComment.fulfilled, (state, action) => {
        if (state.currentPost) {
          state.currentPost.comments = (state.currentPost.comments || []).filter(
            (c) => c.id !== action.payload.commentId
          );
        }
      });
  },
});

export const { clearForumError, clearCurrentPost, clearCreateSuccess } = forumSlice.actions;
export default forumSlice.reducer;
