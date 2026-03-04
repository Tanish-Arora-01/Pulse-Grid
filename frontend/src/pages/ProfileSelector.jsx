import React, { useState, useEffect } from "react";
import avatar1 from "../assets/avatar1.jpg";
import avatar2 from "../assets/avatar2.jpg";
import {
  Plus,
  ChevronRight,
  Loader2,
  Zap,
  Pencil,
  Trash2,
  Database,
  X,
  AlertTriangle,
} from "lucide-react";

// Map avatar paths to imported images
const avatarMap = {
  "/avatar1.jpg": avatar1,
  "/avatar2.jpg": avatar2,
};

const getAvatarImage = (avatarPath) => {
  return avatarMap[avatarPath] || avatar1; // Fallback to avatar1
};

const ProfileSelector = ({ onProfileSelected }) => {
  const [profiles, setProfiles] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");

  // Manage Mode States
  const [isManageMode, setIsManageMode] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadProfiles = async () => {
    if (window.fobitAPI) {
      const data = await window.fobitAPI.getProfiles();
      setProfiles(data || []);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  // --- STANDARD ACTIONS ---
  const handleSelect = async (profile) => {
    if (isManageMode) {
      // Open Edit Modal instead of logging in
      setEditingProfile(profile);
      setEditName(profile.name);
      setConfirmClear(false);
      setConfirmDelete(false);
      return;
    }

    setLoadingId(profile.id);
    if (window.fobitAPI) {
      const res = await window.fobitAPI.setActiveProfile(profile.id);
      if (res.success) {
        onProfileSelected(res.profile);
      } else {
        setError("Failed to load profile.");
        setLoadingId(null);
      }
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setLoadingId("new");
    if (window.fobitAPI) {
      const res = await window.fobitAPI.createProfile(newName.trim());
      if (res.success) {
        onProfileSelected(res.profile);
      } else {
        setError("Name already exists.");
        setLoadingId(null);
      }
    }
  };

  // --- EDIT ACTIONS ---
  const handleUpdateName = async () => {
    if (!editName.trim() || editName === editingProfile.name) {
      setEditingProfile(null);
      return;
    }
    if (window.fobitAPI) {
      try {
        const res = await window.fobitAPI.updateProfileName({
          id: editingProfile.id,
          newName: editName.trim(),
        });
        if (res.success) {
          loadProfiles();
          setEditingProfile(null);
          setError("");
        } else {
          setError("Name might already exist.");
        }
      } catch (err) {
        setError("Error updating profile: " + (err.message || err));
      }
    }
  };

  const handleClearData = async () => {
    if (!confirmClear) return setConfirmClear(true);
    if (window.fobitAPI) {
      try {
        const res = await window.fobitAPI.clearProfileData(editingProfile.id);
        if (res.success || res === true) {
          setConfirmClear(false);
          setEditingProfile(null);
          setError("Profile data cleared successfully.");
          // Auto-clear success message after 2 seconds
          setTimeout(() => setError(""), 2000);
        } else {
          setError("Failed to clear profile data.");
        }
      } catch (err) {
        setError("Error clearing data: " + (err.message || err));
      }
    }
  };

  const handleDeleteProfile = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    if (window.fobitAPI) {
      try {
        const res = await window.fobitAPI.deleteProfile(editingProfile.id);
        // Handle both successful responses
        if (res && (res.success === true || res === true)) {
          await loadProfiles();
          setEditingProfile(null);
          setConfirmDelete(false);
          setError("Profile deleted successfully.");
          setTimeout(() => setError(""), 2000);
        } else {
          // Log the actual response for debugging
          const errorMsg = (res && res.message) || "Failed to delete profile.";
          setError(errorMsg);
        }
      } catch (err) {
        setError("Error deleting profile: " + (err.message || err));
      }
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#09090b] flex flex-col items-center justify-center overflow-hidden font-sans selection:bg-indigo-500/30 pt-12">
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000 px-4">
        <div className="flex items-center gap-2 mb-2 select-none">
          {/* App Logo */}
          <div className="bg-indigo-500/20 border border-indigo-500/30 p-2 rounded-full text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            PulseGrid
          </h1>
        </div>
        <p className="text-white/50 text-base sm:text-lg mb-8 sm:mb-12 tracking-wide">
          {isManageMode ? "Manage Profiles" : "Who's focusing today?"}
        </p>

        {/* Profile Grid */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 max-w-4xl w-full">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex flex-col items-center gap-4 group justify-center"
            >
              <button
                onClick={() => handleSelect(profile)}
                disabled={loadingId !== null && loadingId !== profile.id}
                className={`relative w-24 h-24 sm:w-32 sm:h-32 rounded-3xl flex items-center justify-center text-3xl sm:text-4xl font-bold text-white transition-all duration-300 overflow-hidden
                  ${loadingId === profile.id ? "scale-95 opacity-80" : "hover:scale-105 hover:-translate-y-2"}
                  ${isManageMode ? "border-indigo-500/50 opacity-80 hover:opacity-100" : "border-white/10 group-hover:border-indigo-500/50"}
                  bg-white/[0.03] border shadow-2xl backdrop-blur-xl group-hover:bg-white/[0.08] group-hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]
`}
              >
                {/* Edit Overlay */}
                {isManageMode && (
                  <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center backdrop-blur-[2px]">
                    <Pencil size={32} className="text-white opacity-80" />
                  </div>
                )}

                {loadingId === profile.id ? (
                  <Loader2
                    className="animate-spin text-indigo-400 z-10"
                    size={32}
                  />
                ) : profile.avatar_color &&
                  (profile.avatar_color.includes(".jpg") ||
                    profile.avatar_color.includes(".png")) ? (
                  <img
                    src={getAvatarImage(profile.avatar_color)}
                    alt={profile.name}
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <span className="bg-gradient-to-br from-indigo-400 to-purple-500 bg-clip-text text-transparent z-10">
                    {profile.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </button>
              <span className="text-white/70 font-medium tracking-wide group-hover:text-white transition-colors">
                {profile.name}
              </span>
            </div>
          ))}

          {/* Add Profile Button (Hidden in Manage Mode) */}
          {!isManageMode && (
            <div className="flex flex-col items-center gap-4">
              {!isAdding ? (
                <button
                  onClick={() => setIsAdding(true)}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl flex items-center justify-center transition-all duration-300 hover:scale-105 hover:-translate-y-2 bg-white/[0.02] border border-white/5 border-dashed hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <Plus
                    size={32}
                    className="sm:w-[40px] sm:h-[40px] w-[32px] h-[32px] text-white/40 group-hover:text-white/80 transition-colors"
                  />
                </button>
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl flex flex-col items-center justify-center bg-white/[0.05] border border-indigo-500/30 backdrop-blur-xl p-3 sm:p-4 shadow-[0_0_30px_rgba(99,102,241,0.15)] animate-in zoom-in-95 duration-200">
                  <form
                    onSubmit={handleCreate}
                    className="flex flex-col items-center w-full gap-3"
                  >
                    <input
                      type="text"
                      autoFocus
                      placeholder="Name"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setError("");
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-center text-sm focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                    />
                    <button
                      type="submit"
                      disabled={!newName.trim() || loadingId === "new"}
                      className="w-full flex items-center justify-center gap-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {loadingId === "new" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Start"
                      )}
                      {!loadingId && <ChevronRight size={14} />}
                    </button>
                  </form>
                </div>
              )}
              <span className="text-white/40 font-medium tracking-wide">
                {isAdding ? "New Profile" : "Add User"}
              </span>
            </div>
          )}
        </div>

        {/* Manage Profiles Toggle Button */}
        {profiles.length > 0 && !isAdding && (
          <button
            onClick={() => setIsManageMode(!isManageMode)}
            className="mt-12 px-6 py-2 rounded-full border border-white/10 text-white/50 font-medium text-sm hover:text-white hover:bg-white/5 hover:border-white/20 transition-all tracking-wide uppercase"
          >
            {isManageMode ? "Done" : "Manage Profiles"}
          </button>
        )}

        {error && (
          <p
            className={`${
              editingProfile ? "hidden" : "absolute bottom-10"
            } text-sm font-medium animate-in fade-in ${
              error.includes("successfully")
                ? "text-green-400"
                : "text-rose-400"
            }`}
          >
            {error}
          </p>
        )}
      </div>

      {/* --- EDIT MODAL OVERLAY --- */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#0f111a] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col items-center animate-in zoom-in-95">
            {/* Close Button */}
            <button
              onClick={() => setEditingProfile(null)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors bg-white/5 p-1 rounded-full"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold text-white mb-6">Edit Profile</h3>

            {/* Avatar Preview */}
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 mb-6 shadow-lg">
              {editingProfile.avatar_color &&
              (editingProfile.avatar_color.includes(".jpg") ||
                editingProfile.avatar_color.includes(".png")) ? (
                <img
                  src={getAvatarImage(editingProfile.avatar_color)}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white">
                  {editingProfile.name.charAt(0)}
                </div>
              )}
            </div>

            {/* Name Input */}
            <div className="w-full mb-6">
              <label className="text-xs text-white/40 uppercase tracking-widest font-semibold ml-1 mb-2 block">
                Profile Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-medium focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>

            {/* Error Message in Modal */}
            {error && (
              <div
                className={`w-full mb-4 p-3 rounded-lg text-sm font-medium border flex items-center gap-2 ${
                  error.includes("successfully")
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                }`}
              >
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full space-y-3">
              <button
                onClick={handleUpdateName}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-semibold shadow-lg transition-colors"
              >
                Save Changes
              </button>

              <button
                onClick={handleClearData}
                className={`w-full py-3 flex items-center justify-center gap-2 rounded-xl font-medium transition-all border
                  ${confirmClear ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-transparent"}`}
              >
                {confirmClear ? (
                  <AlertTriangle size={18} />
                ) : (
                  <Database size={18} />
                )}
                {confirmClear
                  ? "Click to Confirm Clear"
                  : "Clear Telemetry Data"}
              </button>

              <button
                onClick={handleDeleteProfile}
                className={`w-full py-3 flex items-center justify-center gap-2 rounded-xl font-medium transition-all border
                  ${confirmDelete ? "bg-rose-500 text-white border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]" : "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"}`}
              >
                <Trash2 size={18} />
                {confirmDelete ? "Are you sure?" : "Delete Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSelector;
