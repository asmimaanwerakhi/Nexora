const toPublicUser = (user) => {
  const legacyAbout = user.bio?.length > 160 && !user.about ? user.bio : '';
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username || null,
    email: user.email,
    phone: user.phone || null,
    avatar: user.avatar,
    coverPhoto: user.coverPhoto,
    bio: legacyAbout ? '' : user.bio,
    about: user.about || legacyAbout,
    isVerified: user.isVerified,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    privacy: user.privacy,
    settings: user.settings,
    createdAt: user.createdAt,
  };
};

module.exports = toPublicUser;
