 import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { FaUsers, FaChalkboardTeacher, FaBook, FaBriefcase, FaHeart, FaUserGraduate } from 'react-icons/fa';
import api from '../services/api';

const Dashboard = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    students: 0,
    trainers: 0,
    posts: 0,
    internships: 0,
    applications: 0,
    coursesEnrolled: 0,
    followers: 0,
    following: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch stats', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nts-green-600"></div></div>;
  }

  if (user?.role === 'ADMIN') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of the entire platform</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-500 text-sm">Total Students</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.students || 0}</p></div>
              <div className="bg-blue-100 p-3 rounded-full"><FaUsers className="text-blue-600 text-xl" /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-500 text-sm">Total Trainers</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.trainers || 0}</p></div>
              <div className="bg-green-100 p-3 rounded-full"><FaChalkboardTeacher className="text-green-600 text-xl" /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-500 text-sm">Total Posts</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.posts || 0}</p></div>
              <div className="bg-purple-100 p-3 rounded-full"><FaBook className="text-purple-600 text-xl" /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-500 text-sm">Active Internships</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.internships || 0}</p></div>
              <div className="bg-orange-100 p-3 rounded-full"><FaBriefcase className="text-orange-600 text-xl" /></div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-gradient-to-r from-nts-green-600 to-nts-green-700 rounded-xl p-8 text-white">
          <h2 className="text-xl font-bold mb-2">Welcome, {user?.fullName}</h2>
          <p>You have full control over the platform. Manage users, internships, and content from the Admin Panel.</p>
          <Link to="/admin" className="inline-block mt-4 px-6 py-2 bg-white text-nts-green-600 rounded-lg font-semibold hover:bg-gray-100 transition">Go to Admin Panel</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Welcome back, {user?.fullName}!</h1>
        <p className="text-gray-500 mt-1">Here's your activity summary</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div><p className="text-gray-500 text-sm">Applications</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.applications || 0}</p></div>
            <div className="bg-blue-100 p-3 rounded-full"><FaBriefcase className="text-blue-600 text-xl" /></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div><p className="text-gray-500 text-sm">Courses Enrolled</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.coursesEnrolled || 0}</p></div>
            <div className="bg-green-100 p-3 rounded-full"><FaUserGraduate className="text-green-600 text-xl" /></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div><p className="text-gray-500 text-sm">Your Posts</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.posts || 0}</p></div>
            <div className="bg-purple-100 p-3 rounded-full"><FaBook className="text-purple-600 text-xl" /></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div><p className="text-gray-500 text-sm">Followers</p><p className="text-3xl font-bold text-gray-800 mt-1">{stats.followers || 0}</p></div>
            <div className="bg-pink-100 p-3 rounded-full"><FaHeart className="text-pink-600 text-xl" /></div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-gradient-to-r from-nts-green-600 to-nts-green-700 rounded-xl p-8 text-white">
        <h2 className="text-xl font-bold mb-2">Ready to start your journey?</h2>
        <p>Explore internships, connect with peers, and build your tech career with NTS.</p>
        <div className="flex flex-wrap gap-4 mt-4">
          <Link to="/internships" className="px-5 py-2 bg-white text-nts-green-600 rounded-lg font-semibold hover:bg-gray-100 transition">Browse Internships</Link>
          <Link to="/feed" className="px-5 py-2 border-2 border-white rounded-lg font-semibold hover:bg-white hover:text-nts-green-600 transition">View Feed</Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
