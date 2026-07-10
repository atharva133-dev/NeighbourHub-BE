function formatCommunity(community, userId) {
  const adminId = community.admin?._id || community.admin;
  const uid = userId?.toString();

  return {
    id: community._id,
    name: community.name,
    description: community.description || '',
    code: community.code,
    avatar: community.avatar || '',
    admin: community.admin?.name
      ? { id: community.admin._id, name: community.admin.name }
      : null,
    memberCount: community.members?.length || 0,
    isAdmin: adminId?.toString() === uid,
    createdAt: community.createdAt,
    moderationEnabled: community.moderationEnabled !== false,
    communityGuidelines: community.communityGuidelines || '',
    type: community.type || 'other',
    societyDetails: community.societyDetails || null,
    institutionDetails: community.institutionDetails || null,
  };
}

module.exports = { formatCommunity };
