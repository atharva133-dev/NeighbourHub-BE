function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    notificationPreferences: {
      likes: user.notificationPreferences?.likes ?? true,
      comments: user.notificationPreferences?.comments ?? true,
      emergency: user.notificationPreferences?.emergency ?? true,
      emailAlerts: user.notificationPreferences?.emailAlerts ?? false,
    },
    privacySettings: {
      showName: user.privacySettings?.showName ?? true,
      publicProfile: user.privacySettings?.publicProfile ?? true,
      onlineStatus: user.privacySettings?.onlineStatus ?? true,
    },
    createdAt: user.createdAt,
    communityId: user.communityId || null,
  };
}

module.exports = { formatUser };
