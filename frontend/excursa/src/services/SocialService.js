/**
 * SocialService - API integration for social/community features
 * Handles all API calls related to posts, feed, comments, likes, and user profiles
 */
import api from './api';
import { Platform } from 'react-native';

class SocialService {
  normalizeFeedResponse(payload) {
    if (!payload) {
      return { results: [], nextPageCursor: null };
    }

    // /community/posts/feed/ response
    if (Array.isArray(payload.posts)) {
      return {
        results: payload.posts,
        nextPageCursor: payload.next_cursor ?? null,
      };
    }

    // /community/posts/ response
    if (Array.isArray(payload.results)) {
      return {
        ...payload,
        nextPageCursor: payload.nextPageCursor ?? null,
      };
    }

    return { results: [], nextPageCursor: null };
  }

  /**
   * Fetch the home feed for the current user
   * Returns posts from followed users with pagination
   */
  async fetchFeed(cursor = null, limit = 10) {
    try {
      const params = { limit };
      if (cursor) {
        params.cursor = cursor;
      }
      try {
        const response = await api.get('/community/posts/feed/', { params });
        return this.normalizeFeedResponse(response.data);
      } catch (feedError) {
        // Fallback to public posts endpoint for backward compatibility.
        const listParams = { limit };
        if (typeof cursor === 'number') {
          listParams.skip = cursor;
        }
        const response = await api.get('/community/posts/', { params: listParams });
        return this.normalizeFeedResponse(response.data);
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
      throw error;
    }
  }

  /**
   * Fetch profile details for current or specific user.
   */
  async fetchUserProfile(userId = null) {
    try {
      const endpoint = userId ? `/user/${userId}/` : '/user/me/';
      const response = await api.get(endpoint);
      return response.data;
    } catch (error) {
      console.error(`Error fetching profile${userId ? ` for user ${userId}` : ''}:`, error);
      throw error;
    }
  }

  /**
   * Fetch followers list for a user profile.
   */
  async fetchFollowers(userId) {
    try {
      const response = await api.get(`/user/${userId}/followers/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching followers for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch following list for a user profile.
   */
  async fetchFollowing(userId) {
    try {
      const response = await api.get(`/user/${userId}/following/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching following for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Follow a user profile by profile UUID.
   */
  async followUser(userId) {
    try {
      const response = await api.post(`/user/${userId}/follow/`);
      return response.data;
    } catch (error) {
      console.error(`Error following user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Unfollow a user profile by profile UUID.
   */
  async unfollowUser(userId) {
    try {
      const response = await api.post(`/user/${userId}/unfollow/`);
      return response.data;
    } catch (error) {
      console.error(`Error unfollowing user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch posts from a specific user (for profile)
   */
  async fetchUserPosts(userId, limit = 10) {
    try {
      const response = await api.get(`/community/user/${userId}/posts/`, {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching posts for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch a single post by ID
   */
  async fetchPostById(postId) {
    try {
      const response = await api.get(`/community/posts/${postId}/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new social post
   * Uploads media to S3 via presigned URL before creating post
   */
  async createPost(postData) {
    try {
      const response = await api.post('/community/posts/', postData);
      return response.data;
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  }

  /**
   * Update an existing post
   */
  async updatePost(postId, updateData) {
    try {
      const response = await api.patch(`/community/posts/${postId}/`, updateData);
      return response.data;
    } catch (error) {
      console.error(`Error updating post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a post
   */
  async deletePost(postId) {
    try {
      await api.delete(`/community/posts/${postId}/`);
      return true;
    } catch (error) {
      console.error(`Error deleting post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Toggle like on a post
   * Optimistic update: updates like count locally
   */
  async toggleLike(postId) {
    try {
      const response = await api.post(`/community/posts/${postId}/toggle_like/`);
      return response.data;
    } catch (error) {
      console.error(`Error toggling like on post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Add a comment to a post
   */
  async addComment(postId, commentText) {
    try {
      const response = await api.post(`/community/posts/${postId}/add_comment/`, {
        text: commentText,
      });
      return response.data;
    } catch (error) {
      console.error(`Error adding comment to post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Get comments for a post
   */
  async fetchPostComments(postId, limit = 20, skip = 0) {
    try {
      const response = await api.get(`/community/posts/${postId}/comments/`, {
        params: { limit, skip },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch posts filtered by tag/category (for Explore/Discover)
   */
  async fetchExplore(tag = null, limit = 10) {
    try {
      const params = { limit };
      if (tag) {
        params.interest = tag;
      }
      const response = await api.get('/community/posts/explore/', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching explore feed:', error);
      throw error;
    }
  }

  /**
   * Fetch trending posts
   */
  async fetchTrendingPosts(limit = 10) {
    try {
      const response = await api.get('/community/posts/trending/', { params: { limit } });
      return response.data;
    } catch (error) {
      console.error('Error fetching trending posts:', error);
      throw error;
    }
  }

  /**
   * Get presigned URL for uploading media to S3
   */
  async getPresignedUrl(filename, contentType) {
    try {
      const response = await api.post('/media-storage/presigned-url/', {
        filename,
        content_type: contentType,
      });
      return response.data;
    } catch (error) {
      console.error('Error getting presigned URL:', error);
      throw error;
    }
  }

  /**
   * Upload media to S3 using presigned URL
   */
  async uploadToS3(presignedUrl, fileData, contentType) {
    try {
      await fetch(presignedUrl, {
        method: 'PUT',
        body: fileData,
        headers: {
          'Content-Type': contentType,
        },
      });
      return true;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw error;
    }
  }

  /**
   * Upload a post image via backend media endpoint and return public URL.
   */
  async uploadPostImage(asset) {
    try {
      if (!asset?.uri) {
        throw new Error('Invalid media asset');
      }

      const fileName = asset.fileName || `post-${Date.now()}.jpg`;
      const contentType = asset.mimeType || 'image/jpeg';
      const formData = new FormData();

      if (Platform.OS === 'web') {
        if (asset.file) {
          formData.append('file', asset.file, fileName);
        } else {
          const blob = await fetch(asset.uri).then((res) => res.blob());
          const file = new File([blob], fileName, { type: contentType });
          formData.append('file', file, fileName);
        }
      } else {
        formData.append('file', {
          uri: asset.uri,
          name: fileName,
          type: contentType,
        });
      }

      formData.append('optimize', 'true');

      const response = await api.post('/media_storage/images/', formData, {
        timeout: 60000,
      });
      const uploadedUrl = response?.data?.url;
      if (!uploadedUrl) {
        throw new Error('Media upload response did not include url');
      }
      return uploadedUrl;
    } catch (error) {
      console.error('Error uploading post image:', error);
      throw error;
    }
  }

  /**
   * Search posts by query
   */
  async searchPosts(query) {
    try {
      const response = await api.get('/community/posts/search/', {
        params: { q: query },
      });
      return response.data;
    } catch (error) {
      console.error('Error searching posts:', error);
      throw error;
    }
  }
}

export default new SocialService();
