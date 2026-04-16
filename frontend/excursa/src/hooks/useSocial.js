/**
 * Custom React Hooks for Social/Community features
 * Provides convenient access to social operations and state management
 */
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import SocialService from '../services/SocialService';
import useAuthStore from '../store/authStore';

const applyLikeToggle = (post) => {
  if (!post) return post;

  const currentlyLiked = !!post.liked;
  const currentLikes = Number(post.likes_count) || 0;

  return {
    ...post,
    liked: !currentlyLiked,
    likes_count: Math.max(0, currentlyLiked ? currentLikes - 1 : currentLikes + 1),
  };
};

const updatePostInsideFeedPages = (feedData, postId, updater) => {
  if (!feedData?.pages) return feedData;

  return {
    ...feedData,
    pages: feedData.pages.map((page) => ({
      ...page,
      results: Array.isArray(page?.results)
        ? page.results.map((post) => (post?.id === postId ? updater(post) : post))
        : [],
    })),
  };
};

const mergeLikeResponse = (existingPost, response) => {
  if (!existingPost) return existingPost;

  const serverPost = response?.post || {};
  const hasServerLiked = typeof response?.liked === 'boolean';

  return {
    ...existingPost,
    ...serverPost,
    liked: hasServerLiked ? response.liked : (serverPost.liked ?? existingPost.liked),
    likes_count:
      typeof serverPost.likes_count === 'number'
        ? serverPost.likes_count
        : existingPost.likes_count,
  };
};

/**
 * Hook: Fetch home feed with infinite scroll pagination
 */
export const useFeed = () => {
  return useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: async ({ pageParam = null }) => {
      const response = await SocialService.fetchFeed(pageParam, 10);
      return response;
    },
    getNextPageParam: (lastPage) => lastPage.nextPageCursor || undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Hook: Fetch single post
 */
export const usePost = (postId) => {
  return useQuery({
    queryKey: ['post', postId],
    queryFn: () => SocialService.fetchPostById(postId),
    enabled: !!postId,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook: Fetch user profile (current user or specific profile)
 */
export const useUserProfile = (userId, isOwnProfile = false) => {
  return useQuery({
    queryKey: ['userProfile', isOwnProfile ? 'me' : userId],
    queryFn: () => SocialService.fetchUserProfile(isOwnProfile ? null : userId),
    enabled: isOwnProfile || !!userId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useFollowUser = () => {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: (userId) => SocialService.followUser(userId),
    onSuccess: (response, userId) => {
      if (typeof response?.following_count === 'number') {
        updateUser({ following_count: response.following_count });
      }
      queryClient.setQueryData(['userProfile', userId], (existing) =>
        existing
          ? {
              ...existing,
              is_following: true,
              followers_count: response?.followers_count ?? existing.followers_count,
            }
          : existing
      );
      queryClient.setQueryData(['userProfile', 'me'], (existing) => {
        if (!existing) return existing;
        const nextFollowing = response?.following_count ?? existing.following_count;
        return {
          ...existing,
          following_count: nextFollowing,
        };
      });
    },
  });
};

export const useUnfollowUser = () => {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: (userId) => SocialService.unfollowUser(userId),
    onSuccess: (response, userId) => {
      if (typeof response?.following_count === 'number') {
        updateUser({ following_count: response.following_count });
      }
      queryClient.setQueryData(['userProfile', userId], (existing) =>
        existing
          ? {
              ...existing,
              is_following: false,
              followers_count: response?.followers_count ?? existing.followers_count,
            }
          : existing
      );
      queryClient.setQueryData(['userProfile', 'me'], (existing) => {
        if (!existing) return existing;
        const nextFollowing = response?.following_count ?? existing.following_count;
        return {
          ...existing,
          following_count: nextFollowing,
        };
      });
    },
  });
};

/**
 * Hook: Fetch posts from specific user (for profile)
 */
export const useUserPosts = (userId) => {
  return useQuery({
    queryKey: ['userPosts', userId],
    queryFn: () => SocialService.fetchUserPosts(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook: Fetch followers or following list for a user profile.
 */
export const useUserFollowList = (userId, listType = 'followers') => {
  return useQuery({
    queryKey: ['userFollowList', userId, listType],
    queryFn: () =>
      listType === 'following'
        ? SocialService.fetchFollowing(userId)
        : SocialService.fetchFollowers(userId),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
};

/**
 * Hook: Fetch comments for a post with infinite scroll
 */
export const usePostComments = (postId) => {
  return useInfiniteQuery({
    queryKey: ['postComments', postId],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await SocialService.fetchPostComments(postId, 20, pageParam);
      return response;
    },
    getNextPageParam: (lastPage, pages) => {
      const skip = pages.length * 20;
      return lastPage.results?.length === 20 ? skip : undefined;
    },
    enabled: !!postId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Hook: Create a new post mutation
 */
export const useCreatePost = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (postData) => SocialService.createPost(postData),
    onSuccess: (newPost) => {
      // Invalidate feed cache to show new post
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      // Also add to user's posts
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['userPosts', user.id] });
      }
      return newPost;
    },
    onError: (error) => {
      console.error('Error creating post:', error);
    },
  });
};

/**
 * Hook: Update a post mutation
 */
export const useUpdatePost = (postId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updateData) => SocialService.updatePost(postId, updateData),
    onSuccess: (updatedPost) => {
      queryClient.setQueryData(['post', postId], updatedPost);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      return updatedPost;
    },
  });
};

/**
 * Hook: Delete a post mutation
 */
export const useDeletePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId) => SocialService.deletePost(postId),
    onSuccess: (_, postId) => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.removeQueries({ queryKey: ['post', postId] });
    },
  });
};

/**
 * Hook: Toggle like on a post mutation
 * Optimistic UI update for faster feedback
 */
export const useToggleLike = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetPostId) => SocialService.toggleLike(targetPostId),
    onMutate: async (targetPostId) => {
      if (!targetPostId) return {};

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['post', targetPostId] });
      await queryClient.cancelQueries({ queryKey: ['feed'] });

      // Snapshot the previous value
      const previousPost = queryClient.getQueryData(['post', targetPostId]);
      const previousFeed = queryClient.getQueryData(['feed']);

      // Optimistically update to new value
      if (previousPost) {
        queryClient.setQueryData(['post', targetPostId], applyLikeToggle(previousPost));
      }

      if (previousFeed) {
        queryClient.setQueryData(
          ['feed'],
          updatePostInsideFeedPages(previousFeed, targetPostId, applyLikeToggle)
        );
      }

      return { previousPost, previousFeed, targetPostId };
    },
    onError: (_, __, context) => {
      if (!context?.targetPostId) return;

      // Rollback on error
      if (context?.previousPost) {
        queryClient.setQueryData(['post', context.targetPostId], context.previousPost);
      }
      if (context?.previousFeed) {
        queryClient.setQueryData(['feed'], context.previousFeed);
      }
    },
    onSuccess: (response, targetPostId) => {
      if (!targetPostId) return;

      queryClient.setQueryData(['post', targetPostId], (existingPost) =>
        mergeLikeResponse(existingPost, response)
      );
      queryClient.setQueryData(['feed'], (oldFeed) =>
        updatePostInsideFeedPages(oldFeed, targetPostId, (existingPost) =>
          mergeLikeResponse(existingPost, response)
        )
      );
    },
  });
};

/**
 * Hook: Add comment to a post mutation
 */
export const useAddComment = (postId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentText) => SocialService.addComment(postId, commentText),
    onSuccess: (newComment) => {
      // Invalidate comments cache
      queryClient.invalidateQueries({ queryKey: ['postComments', postId] });
      // Also update post to reflect new comment count
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      return newComment;
    },
  });
};

/**
 * Hook: Fetch explore/discover feed
 */
export const useExploreFeed = (tag = null) => {
  return useInfiniteQuery({
    queryKey: ['explore', tag],
    queryFn: async ({ pageParam = null }) => {
      const response = await SocialService.fetchExplore(tag, 10);
      return response;
    },
    getNextPageParam: (lastPage) => lastPage.nextPageCursor || undefined,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook: Fetch trending posts
 */
export const useTrendingPosts = () => {
  return useQuery({
    queryKey: ['trending'],
    queryFn: () => SocialService.fetchTrendingPosts(10),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook: Search posts
 */
export const useSearchPosts = (query, enabled = false) => {
  return useQuery({
    queryKey: ['searchPosts', query],
    queryFn: () => SocialService.searchPosts(query),
    enabled: !!query && enabled,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Hook: Get presigned URL for media upload
 */
export const useGetPresignedUrl = () => {
  return useMutation({
    mutationFn: ({ filename, contentType }) =>
      SocialService.getPresignedUrl(filename, contentType),
  });
};

/**
 * Hook: Upload media to S3
 */
export const useUploadToS3 = () => {
  return useMutation({
    mutationFn: ({ presignedUrl, fileData, contentType }) =>
      SocialService.uploadToS3(presignedUrl, fileData, contentType),
  });
};
