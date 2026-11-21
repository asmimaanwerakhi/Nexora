const profileSlugFor = (user) => {
  if (user.username) return user.username;
  const nameSlug =
    user.name
      ?.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'user';
  return `${nameSlug}-${user._id.toString().toLowerCase()}`;
};

module.exports = profileSlugFor;
