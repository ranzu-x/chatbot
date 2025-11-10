import React, { useEffect, useState } from "react";
import axios from "axios";

const ProfilePage = () => {
  const [profile, setProfile] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    profile_image: null,
  });

  useEffect(() => {
    // Fetch profile data
    const fetchProfile = async () => {
      const res = await axios.get("http://localhost:5000/api/user/profile", {
        withCredentials: true, // if using cookies for auth
      });
      setProfile(res.data);
      setFormData({
        name: res.data.name,
        email: res.data.email,
        phone: res.data.phone,
        profile_image: null,
      });
    };
    fetchProfile();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, profile_image: e.target.files[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = new FormData();
    data.append("name", formData.name);
    data.append("email", formData.email);
    data.append("phone", formData.phone);
    if (formData.profile_image) data.append("profile_image", formData.profile_image);

    await axios.put("http://localhost:5000/api/user/profile", data, {
      headers: { "Content-Type": "multipart/form-data" },
      withCredentials: true,
    });

    alert("Profile updated successfully!");
    setEditMode(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-md mt-10">
      <div className="flex flex-col items-center">
        <img
          src={
            profile.profile_image
              ? `http://localhost:5000/${profile.profile_image}`
              : "/default-avatar.png"
          }
          alt="Profile"
          className="h-24 w-24 rounded-full object-cover border mb-4"
        />
        <h2 className="text-xl font-semibold">{profile.name}</h2>
        <p className="text-gray-500">{profile.email}</p>
        <button
          onClick={() => setEditMode(!editMode)}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md"
        >
          {editMode ? "Cancel" : "Edit Profile"}
        </button>
      </div>

      {editMode && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Profile Image</label>
            <input type="file" onChange={handleFileChange} accept="image/*" />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white w-full py-2 rounded-md"
          >
            Save Changes
          </button>
        </form>
      )}
    </div>
  );
};

export default ProfilePage;
