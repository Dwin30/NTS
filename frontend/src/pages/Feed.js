import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { io } from 'socket.io-client';
import { 
  FaHeart, FaRegHeart, FaComment, FaShare, FaNewspaper, 
  FaUserPlus, FaEnvelope, FaTrash, FaEdit, FaPaperPlane, 
  FaTimes, FaImage, FaTimesCircle
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api, { uploadFile } from '../services/api';

const SOCKET_URL = 'https://nts-backend-409a.onrender.com';

const Feed = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const [newPostImage, setNewPostImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [posting, setPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [showCommentsFor, setShowCommentsFor] = useState(null);
  const [comments, setComments] = useState({});
  const [newComment, setNewComment] = useState({});
  const [submittingComment, setSubmittingComment] = useState({});
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const [showDeletePostModal, setShowDeletePostModal] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);
  const [showDeleteCommentModal, setShowDeleteCommentModal] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [commentPostId, setCommentPostId] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, { auth: { token } });
    setSocket(newSocket);

    fetchPosts();
    fetchSuggestedUsers();

    newSocket.on('post:created', (newPostData) => {
      setPosts(prev => [newPostData, ...prev]);
      toast.success('New post created!');
    });

    newSocket.on('post:deleted', (postId) => {
      setPosts(prev => prev.filter(post => post.id !== postId));
      toast.success('Post deleted successfully');
    });

    newSocket.on('post:edited', (updatedPost) => {
      setPosts(prev => prev.map(post => post.id === updatedPost.id ? updatedPost : post));
      toast.success('Post updated');
    });

    newSocket.on('comment:added', ({ postId, comment }) => {
      if (showCommentsFor === postId) {
        setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
      }
      setPosts(prev => prev.map(post => post.id === postId ? { ...post, commentsCount: (post.commentsCount || 0) + 1 } : post));
      toast.success('New comment added!');
    });

    newSocket.on('comment:edited', ({ postId, comment }) => {
      if (showCommentsFor === postId) {
        setComments(prev => ({ ...prev, [postId]: prev[postId].map(c => c.id === comment.id ? comment : c) }));
      }
      toast.success('Comment updated');
    });

    newSocket.on('comment:deleted', ({ postId, commentId }) => {
      if (showCommentsFor === postId) {
        setComments(prev => ({ ...prev, [postId]: prev[postId].filter(c => c.id !== commentId) }));
      }
      setPosts(prev => prev.map(post => post.id === postId ? { ...post, commentsCount: Math.max(0, (post.commentsCount || 0) - 1) } : post));
      toast.success('Comment deleted');
    });

    return () => newSocket.disconnect();
  }, [token]);

  const fetchPosts = async () => {
    try {
      const res = await api.get('/posts/feed');
      setPosts(res.data || []);
    } catch (error) {
      console.error('Failed to fetch posts', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestedUsers = async () => {
    try {
      const res = await api.get('/users/suggested');
      setSuggestedUsers(res.data || []);
    } catch (error) {
      console.error('Failed to fetch suggestions', error);
    }
  };

  const fetchComments = async (postId) => {
    try {
      const res = await api.get(`/posts/${postId}/comments`);
      setComments(prev => ({ ...prev, [postId]: res.data || [] }));
    } catch (error) {
      console.error('Failed to fetch comments', error);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file) return null;
    setUploadingImage(true);
    try {
      const result = await uploadFile(file);
      return result.url;
    } catch (error) {
      toast.error('Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() && !newPostImage) {
      toast.error('Please write something or add an image');
      return;
    }

    setPosting(true);
    let imageUrl = null;
    if (newPostImage) imageUrl = await handleImageUpload(newPostImage);

    try {
      const res = await api.post('/posts', { content: newPost, imageUrl });
      setPosts([res.data, ...posts]);
      setNewPost('');
      setNewPostImage(null);
      toast.success('Post created!');
    } catch (error) {
      toast.error('Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  const handleEditPost = async (postId) => {
    if (!editPostContent.trim()) {
      toast.error('Content cannot be empty');
      return;
    }
    try {
      const res = await api.put(`/posts/${postId}`, { content: editPostContent });
      setPosts(posts.map(post => post.id === postId ? res.data : post));
      setEditingPostId(null);
      setEditPostContent('');
      toast.success('Post updated!');
    } catch (error) {
      toast.error('Failed to edit post');
    }
  };

  const confirmDeletePost = (postId) => {
    setPostToDelete(postId);
    setShowDeletePostModal(true);
  };

  const handleDeletePost = async () => {
    if (!postToDelete) return;
    try {
      await api.delete(`/posts/${postToDelete}`);
      setPosts(posts.filter(post => post.id !== postToDelete));
      toast.success('Post deleted!');
    } catch (error) {
      toast.error('Failed to delete post');
    } finally {
      setShowDeletePostModal(false);
      setPostToDelete(null);
    }
  };

  const handleLike = async (postId) => {
    try {
      const res = await api.post(`/posts/${postId}/like`);
      setPosts(posts.map(post => {
        if (post.id === postId) {
          return { ...post, isLiked: res.data.liked, likesCount: (post.likesCount || 0) + (res.data.liked ? 1 : -1) };
        }
        return post;
      }));
    } catch (error) {
      toast.error('Failed to like post');
    }
  };

  const handleAddComment = async (postId) => {
    const commentText = newComment[postId];
    if (!commentText || !commentText.trim()) {
      toast.error('Please write a comment');
      return;
    }

    setSubmittingComment(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await api.post(`/posts/${postId}/comments`, { content: commentText });
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), res.data] }));
      setNewComment(prev => ({ ...prev, [postId]: '' }));
      setPosts(posts.map(post => post.id === postId ? { ...post, commentsCount: (post.commentsCount || 0) + 1 } : post));
      toast.success('Comment added!');
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setSubmittingComment(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleEditComment = async (postId, commentId) => {
    if (!editCommentContent.trim()) {
      toast.error('Comment cannot be empty');
      return;
    }
    try {
      const res = await api.put(`/posts/${postId}/comments/${commentId}`, { content: editCommentContent });
      setComments(prev => ({ ...prev, [postId]: prev[postId].map(comment => comment.id === commentId ? { ...comment, content: res.data.content, isEdited: true } : comment) }));
      setEditingCommentId(null);
      setEditCommentContent('');
      toast.success('Comment edited!');
    } catch (error) {
      toast.error('Failed to edit comment');
    }
  };

  const confirmDeleteComment = (postId, commentId) => {
    setCommentPostId(postId);
    setCommentToDelete(commentId);
    setShowDeleteCommentModal(true);
  };

  const handleDeleteComment = async () => {
    if (!commentToDelete || !commentPostId) return;
    try {
      await api.delete(`/posts/${commentPostId}/comments/${commentToDelete}`);
      setComments(prev => ({ ...prev, [commentPostId]: prev[commentPostId].filter(comment => comment.id !== commentToDelete) }));
      setPosts(posts.map(post => post.id === commentPostId ? { ...post, commentsCount: Math.max(0, (post.commentsCount || 0) - 1) } : post));
      toast.success('Comment deleted!');
    } catch (error) {
      toast.error('Failed to delete comment');
    } finally {
      setShowDeleteCommentModal(false);
      setCommentToDelete(null);
      setCommentPostId(null);
    }
  };

  const toggleComments = (postId) => {
    if (showCommentsFor === postId) {
      setShowCommentsFor(null);
    } else {
      setShowCommentsFor(postId);
      if (!comments[postId]) fetchComments(postId);
    }
  };

  const startConversation = async (userId) => {
    if (!userId) return;
    try {
      const res = await api.post(`/chat/private/${userId}`);
      navigate('/messages', { state: { selectedChat: res.data } });
    } catch (error) {
      toast.error('Could not start conversation');
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const filteredSuggestedUsers = suggestedUsers.filter(u => u.id !== user?.id);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nts-green-600"></div></div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Delete Post Modal */}
      {showDeletePostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDeletePostModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><FaTrash className="text-red-500 text-2xl" /></div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Delete Post?</h3>
              <p className="text-gray-500 text-sm mb-6">This post will be permanently deleted. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeletePostModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                <button onClick={handleDeletePost} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Comment Modal */}
      {showDeleteCommentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDeleteCommentModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><FaTrash className="text-red-500 text-2xl" /></div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Delete Comment?</h3>
              <p className="text-gray-500 text-sm mb-6">This comment will be permanently deleted.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteCommentModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                <button onClick={handleDeleteComment} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggested Users */}
      {filteredSuggestedUsers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <h3 className="font-semibold mb-3 flex items-center text-gray-800"><FaUserPlus className="mr-2 text-nts-green-600" /> Connect with Students</h3>
          <div className="flex flex-wrap gap-3">
            {filteredSuggestedUsers.slice(0, 5).map(suggested => (
              <div key={suggested.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 flex-1 min-w-[150px]">
                <Link to={`/profile/${suggested.id}`} className="flex items-center space-x-3 flex-1">
                  <div className="w-10 h-10 rounded-full bg-nts-green-600 flex items-center justify-center text-white font-bold text-sm">{getInitials(suggested.fullName)}</div>
                  <div><p className="font-medium text-gray-800 text-sm">{suggested.fullName}</p><p className="text-xs text-gray-500">{suggested.role}</p></div>
                </Link>
                <button onClick={() => startConversation(suggested.id)} className="p-2 text-nts-green-600 hover:bg-nts-green-50 rounded-full transition"><FaEnvelope size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Post */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex space-x-3">
          <div className="w-10 h-10 rounded-full bg-nts-green-600 flex items-center justify-center text-white font-bold">{getInitials(user?.fullName)}</div>
          <div className="flex-1">
            <textarea placeholder={`What's on your mind, ${user?.fullName?.split(' ')[0]}?`} value={newPost} onChange={(e) => setNewPost(e.target.value)} rows="2" className="w-full px-4 py-2 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-nts-green-500 focus:border-transparent text-sm" />
            {newPostImage && (<div className="relative mt-2 inline-block"><img src={URL.createObjectURL(newPostImage)} alt="Preview" className="h-20 w-20 object-cover rounded-lg" /><button onClick={() => setNewPostImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"><FaTimesCircle size={14} /></button></div>)}
            <div className="flex justify-between items-center mt-2">
              <label className="cursor-pointer text-gray-500 hover:text-nts-green-600 transition"><FaImage size={20} /><input type="file" className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) setNewPostImage(e.target.files[0]); }} /></label>
              <button onClick={handleCreatePost} disabled={(!newPost.trim() && !newPostImage) || posting || uploadingImage} className="px-5 py-2 bg-nts-green-600 text-white rounded-xl font-semibold hover:bg-nts-green-700 disabled:opacity-50 transition text-sm">{posting || uploadingImage ? 'Posting...' : 'Post'}</button>
            </div>
          </div>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Link to={`/profile/${post.author.id}`} className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-nts-green-600 flex items-center justify-center text-white font-bold text-sm">{getInitials(post.author.fullName)}</div>
                  <div><p className="font-semibold text-gray-800 hover:text-nts-green-600">{post.author.fullName}</p><p className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleString()}{post.author.role === 'TRAINER' && <span className="ml-2 text-nts-green-600">🎓 Trainer</span>}</p></div>
                </Link>
                <div className="flex items-center space-x-1">
                  <button onClick={() => startConversation(post.author.id)} className="p-2 text-gray-400 hover:text-nts-green-600 rounded-full transition"><FaEnvelope size={14} /></button>
                  {(user?.id === post.author.id || user?.role === 'ADMIN') && (
                    <>
                      <button onClick={() => { if (editingPostId === post.id) { setEditingPostId(null); setEditPostContent(''); } else { setEditingPostId(post.id); setEditPostContent(post.content); } }} className="p-2 text-gray-400 hover:text-blue-500 rounded-full transition"><FaEdit size={14} /></button>
                      <button onClick={() => confirmDeletePost(post.id)} className="p-2 text-gray-400 hover:text-red-500 rounded-full transition"><FaTrash size={14} /></button>
                    </>
                  )}
                </div>
              </div>

              {editingPostId === post.id ? (
                <div className="mb-3"><textarea value={editPostContent} onChange={(e) => setEditPostContent(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" rows="3" /><div className="flex gap-2 mt-2"><button onClick={() => handleEditPost(post.id)} className="px-3 py-1 bg-nts-green-600 text-white rounded-lg text-sm">Save</button><button onClick={() => { setEditingPostId(null); setEditPostContent(''); }} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button></div></div>
              ) : (
                <>
                  <p className="text-gray-700 mb-3 text-sm whitespace-pre-wrap break-words">{post.content}</p>
                  {post.imageUrl && (<div className="mb-3"><img src={post.imageUrl} alt="Post" className="max-w-full rounded-lg cursor-pointer max-h-96 object-cover" onClick={() => window.open(post.imageUrl, '_blank')} /></div>)}
                </>
              )}

              <div className="flex items-center justify-around pt-2 border-t">
                <button onClick={() => handleLike(post.id)} className={`flex items-center space-x-2 px-4 py-1 rounded-full transition ${post.isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}>{post.isLiked ? <FaHeart /> : <FaRegHeart />}<span className="text-sm">{post.likesCount || 0}</span></button>
                <button onClick={() => toggleComments(post.id)} className="flex items-center space-x-2 px-4 py-1 rounded-full text-gray-500 hover:text-nts-green-600 transition"><FaComment /><span className="text-sm">{post.commentsCount || 0}</span></button>
                <button className="flex items-center space-x-2 px-4 py-1 rounded-full text-gray-500 hover:text-nts-green-600 transition"><FaShare /><span className="text-sm">{post.sharesCount || 0}</span></button>
              </div>

              {showCommentsFor === post.id && (
                <div className="mt-4 pt-3 border-t">
                  <div className="space-y-3 max-h-80 overflow-y-auto mb-3">
                    {(comments[post.id] || []).length === 0 ? <div className="text-center py-4 text-gray-400 text-sm">No comments yet. Be the first to comment!</div> : (comments[post.id] || []).map(comment => (
                      <div key={comment.id} className="flex space-x-2 text-sm group">
                        <div className="w-6 h-6 rounded-full bg-nts-green-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">{getInitials(comment.author.fullName)}</div>
                        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between"><p className="font-semibold text-xs">{comment.author.fullName}</p>{(user?.id === comment.author.id || user?.role === 'ADMIN') && (<div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition"><button onClick={() => { setEditingCommentId(comment.id); setEditCommentContent(comment.content); }} className="text-gray-400 hover:text-blue-500"><FaEdit size={10} /></button><button onClick={() => confirmDeleteComment(post.id, comment.id)} className="text-gray-400 hover:text-red-500"><FaTrash size={10} /></button></div>)}</div>
                          {editingCommentId === comment.id ? (<div className="mt-1"><textarea value={editCommentContent} onChange={(e) => setEditCommentContent(e.target.value)} className="w-full px-2 py-1 border rounded text-sm" rows="2" /><div className="flex gap-2 mt-1"><button onClick={() => handleEditComment(post.id, comment.id)} className="px-2 py-0.5 bg-nts-green-600 text-white rounded text-xs">Save</button><button onClick={() => { setEditingCommentId(null); setEditCommentContent(''); }} className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">Cancel</button></div></div>) : (<><p className="text-gray-700 text-sm whitespace-pre-wrap break-words">{comment.content}</p><div className="flex items-center space-x-2 mt-1"><p className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>{comment.isEdited && <p className="text-xs text-gray-400">(edited)</p>}</div></>)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex space-x-2 mt-2">
                    <input type="text" value={newComment[post.id] || ''} onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))} onKeyPress={(e) => e.key === 'Enter' && handleAddComment(post.id)} placeholder="Write a comment..." className="flex-1 px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-nts-green-500 focus:border-transparent" />
                    <button onClick={() => handleAddComment(post.id)} disabled={submittingComment[post.id] || !newComment[post.id]?.trim()} className="p-2 bg-nts-green-600 text-white rounded-xl hover:bg-nts-green-700 disabled:opacity-50 transition"><FaPaperPlane size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {posts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm"><FaNewspaper className="text-5xl text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No posts yet.</p><p className="text-sm text-gray-400">Be the first to share something!</p></div>
        )}
      </div>
    </div>
  );
};

export default Feed;